import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { listen } from '@tauri-apps/api/event'

export interface AudioVisualizerProps {
	isRecording: boolean
	inputDevice: { id: string; name?: string } | null
	className?: string
}

function getWaveColor(): string {
	const isDark = document.documentElement.classList.contains('dark')
	return isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 41, 59, 0.75)'
}

function getCenterLineColor(): string {
	const isDark = document.documentElement.classList.contains('dark')
	return isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.15)'
}

function drawWaveform(ctx: CanvasRenderingContext2D, w: number, h: number, amplitude: number, time: number) {
	ctx.clearRect(0, 0, w, h)
	const midY = h / 2

	ctx.strokeStyle = getCenterLineColor()
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(0, midY)
	ctx.lineTo(w, midY)
	ctx.stroke()

	ctx.strokeStyle = getWaveColor()
	ctx.lineWidth = 2
	ctx.lineJoin = 'round'
	ctx.lineCap = 'round'
	ctx.beginPath()

	const points = 64
	const sliceWidth = w / points

	for (let i = 0; i < points; i++) {
		const x = i * sliceWidth
		const wave =
			Math.sin(i * 0.3 + time * 5) * 0.5 +
			Math.sin(i * 0.7 + time * 3) * 0.3 +
			Math.sin(i * 1.1 + time * 7) * 0.2
		const y = midY + wave * amplitude * midY * 0.9
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	}

	ctx.stroke()
}

export default function AudioVisualizer({ isRecording, inputDevice, className = '' }: AudioVisualizerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const frameRef = useRef<number>(0)
	const amplitudeRef = useRef(0)
	const smoothedRef = useRef(0)

	const syncCanvasSize = useCallback(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		const dpr = window.devicePixelRatio
		canvas.width = rect.width * dpr
		canvas.height = rect.height * dpr
	}, [])

	useEffect(() => {
		if (!isRecording) return

		let cancelled = false

		const unlisten = listen<number>('audio_amplitude', (event) => {
			amplitudeRef.current = event.payload
		})

		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		syncCanvasSize()
		window.addEventListener('resize', syncCanvasSize)

		const tick = () => {
			if (cancelled) return
			// Smooth: fast attack, slow decay
			const target = amplitudeRef.current
			const diff = target - smoothedRef.current
			smoothedRef.current += diff * (diff > 0 ? 0.4 : 0.08)

			const dpr = window.devicePixelRatio
			const w = canvas.width / dpr
			const h = canvas.height / dpr
			ctx.save()
			ctx.scale(dpr, dpr)
			drawWaveform(ctx, w, h, smoothedRef.current, performance.now() / 1000)
			ctx.restore()

			frameRef.current = requestAnimationFrame(tick)
		}

		frameRef.current = requestAnimationFrame(tick)

		return () => {
			cancelled = true
			cancelAnimationFrame(frameRef.current)
			window.removeEventListener('resize', syncCanvasSize)
			unlisten.then((fn) => fn())
			smoothedRef.current = 0
		}
	}, [isRecording, inputDevice, syncCanvasSize])

	if (!isRecording) return null

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, ease: 'easeOut' }}
			className={`w-full rounded-lg border border-border/50 bg-card/50 p-3 ${className}`}
		>
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-medium text-muted-foreground">{inputDevice?.name || 'Audio Level'}</span>
				<span className="flex items-center gap-1.5 text-xs text-success">
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
					</span>
					Recording
				</span>
			</div>
			<canvas ref={canvasRef} className="w-full rounded" style={{ display: 'block', height: 80 }} />
		</motion.div>
	)
}
