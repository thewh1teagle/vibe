import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

export interface AudioVisualizerProps {
	isRecording: boolean
	inputDevice: { id: string; name?: string } | null
	className?: string
}

// --- Audio engine ---

interface AudioEngine {
	ctx: AudioContext
	analyser: AnalyserNode
	stream: MediaStream
	buffer: Uint8Array
}

async function resolveDeviceId(name: string): Promise<string | undefined> {
	const devices = await navigator.mediaDevices.enumerateDevices()
	return devices
		.filter((d) => d.kind === 'audioinput')
		.find((d) => d.label.toLowerCase().includes(name.toLowerCase()))?.deviceId
}

async function createAudioEngine(deviceName?: string): Promise<AudioEngine> {
	const deviceId = deviceName ? await resolveDeviceId(deviceName) : undefined

	const stream = await navigator.mediaDevices.getUserMedia({
		audio: deviceId
			? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
			: true,
	})

	const ctx = new AudioContext()
	if (ctx.state === 'suspended') await ctx.resume()

	// Two cascaded highpass filters at 85Hz — aggressively removes DC offset and low rumble
	const highpass1 = ctx.createBiquadFilter()
	highpass1.type = 'highpass'
	highpass1.frequency.value = 85
	highpass1.Q.value = 0.7

	const highpass2 = ctx.createBiquadFilter()
	highpass2.type = 'highpass'
	highpass2.frequency.value = 85
	highpass2.Q.value = 0.7

	// Fixed gain boost — no dynamic compression, no level jumps
	const gain = ctx.createGain()
	gain.gain.value = 6

	const analyser = ctx.createAnalyser()
	analyser.fftSize = 2048
	analyser.smoothingTimeConstant = 0.3

	// Chain: mic → highpass × 2 → gain → analyser
	const source = ctx.createMediaStreamSource(stream)
	source.connect(highpass1)
	highpass1.connect(highpass2)
	highpass2.connect(gain)
	gain.connect(analyser)

	return { ctx, analyser, stream, buffer: new Uint8Array(analyser.frequencyBinCount) }
}

function destroyAudioEngine(engine: AudioEngine | null) {
	if (!engine) return
	engine.stream.getTracks().forEach((t) => t.stop())
	if (engine.ctx.state !== 'closed') engine.ctx.close()
}

// --- Theme ---

function getWaveColor(): string {
	const isDark = document.documentElement.classList.contains('dark')
	return isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 41, 59, 0.75)'
}

function getCenterLineColor(): string {
	const isDark = document.documentElement.classList.contains('dark')
	return isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.15)'
}

// --- Waveform renderer ---

const SENSITIVITY = 6

function drawWaveform(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	data: Float32Array,
	bufferLength: number,
) {
	ctx.clearRect(0, 0, w, h)

	const midY = h / 2

	// Center line
	ctx.strokeStyle = getCenterLineColor()
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(0, midY)
	ctx.lineTo(w, midY)
	ctx.stroke()

	// Waveform with smooth bezier curves
	ctx.strokeStyle = getWaveColor()
	ctx.lineWidth = 2
	ctx.lineJoin = 'round'
	ctx.lineCap = 'round'
	ctx.beginPath()

	const sampleCount = Math.floor(bufferLength * 0.25)
	const sliceWidth = w / sampleCount

	const getY = (i: number) => {
		const v = data[i] / 128.0
		// Clamp to prevent waveform from going off-canvas
		const deflection = Math.max(-0.95, Math.min(0.95, (v - 1.0) * SENSITIVITY))
		return (deflection + 1.0) * midY
	}

	for (let i = 0; i < sampleCount; i++) {
		const y = getY(i)
		if (i === 0) {
			ctx.moveTo(0, y)
		} else {
			const prevX = (i - 1) * sliceWidth
			const currX = i * sliceWidth
			ctx.quadraticCurveTo(prevX, getY(i - 1), (prevX + currX) / 2, (getY(i - 1) + y) / 2)
		}
	}

	ctx.stroke()
}

// --- Component ---

export default function AudioVisualizer({
	isRecording,
	inputDevice,
	className = '',
}: AudioVisualizerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const engineRef = useRef<AudioEngine | null>(null)
	const frameRef = useRef<number>(0)
	const [deviceLabel, setDeviceLabel] = useState<string | null>(null)

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

		const run = async () => {
			try {
				const engine = await createAudioEngine(inputDevice?.name)
				if (cancelled) {
					destroyAudioEngine(engine)
					return
				}
				engineRef.current = engine
				setDeviceLabel(inputDevice?.name ?? null)

				const canvas = canvasRef.current
				if (!canvas) return
				const ctx = canvas.getContext('2d')
				if (!ctx) return

				syncCanvasSize()
				window.addEventListener('resize', syncCanvasSize)

				const smoothed = new Float32Array(engine.analyser.frequencyBinCount).fill(128)

				const tick = () => {
					if (cancelled) return

					engine.analyser.getByteTimeDomainData(engine.buffer)

					// Smooth with asymmetric lerp — no manual DC/gain needed
					for (let i = 0; i < smoothed.length; i++) {
						const diff = engine.buffer[i] - smoothed[i]
						smoothed[i] += diff * (Math.abs(diff) > 3 ? 0.35 : 0.15)
					}

					const dpr = window.devicePixelRatio
					const w = canvas.width / dpr
					const h = canvas.height / dpr
					ctx.save()
					ctx.scale(dpr, dpr)
					drawWaveform(ctx, w, h, smoothed, engine.analyser.frequencyBinCount)
					ctx.restore()

					frameRef.current = requestAnimationFrame(tick)
				}

				frameRef.current = requestAnimationFrame(tick)
			} catch (err) {
				console.error('AudioVisualizer:', err)
			}
		}

		run()

		return () => {
			cancelled = true
			cancelAnimationFrame(frameRef.current)
			window.removeEventListener('resize', syncCanvasSize)
			destroyAudioEngine(engineRef.current)
			engineRef.current = null
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
				<span className="text-xs font-medium text-muted-foreground">{deviceLabel || 'Audio Level'}</span>
				<span className="flex items-center gap-1.5 text-xs text-success">
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
					</span>
					Recording
				</span>
			</div>
			<canvas
				ref={canvasRef}
				className="w-full rounded"
				style={{ display: 'block', height: 80 }}
			/>
		</motion.div>
	)
}
