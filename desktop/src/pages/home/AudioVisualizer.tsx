import { useEffect, useRef, useState } from 'react'

export interface AudioVisualizerProps {
	isRecording: boolean
	inputDevice: { id: string; name?: string } | null
	sensitivity?: number
	reaction?: number
	fftSize?: number
	waveColor?: string
	waveWidth?: number
	backgroundColor?: string
	centerLineColor?: string
	centerLineWidth?: number
	className?: string
	showLabel?: boolean
}

export default function AudioVisualizer({
	isRecording,
	inputDevice,
	sensitivity = 3.0,
	reaction = 0.2,
	fftSize = 2048,
	waveColor = '#fff',
	waveWidth = 2,
	backgroundColor = 'rgb(15, 23, 42)',
	centerLineColor = 'rgba(148, 163, 184, 0.3)',
	centerLineWidth = 1,
	className = '',
	showLabel = true,
}: AudioVisualizerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const animationRef = useRef<number>(null)
	const analyzerRef = useRef<AnalyserNode>(null)
	const audioContextRef = useRef<AudioContext>(null)
	const streamRef = useRef<MediaStream>(null)

	const [targetBrowserDeviceId, setTargetBrowserDeviceId] = useState<string | undefined>()

	useEffect(() => {
		const mapDevice = async () => {
			if (!inputDevice?.name) {
				setTargetBrowserDeviceId(undefined)
				return
			}

			try {
				const devices = await navigator.mediaDevices.enumerateDevices()
				const audioInputs = devices.filter((d) => d.kind === 'audioinput')
				const match = audioInputs.find((d) => d.label.toLowerCase().includes(inputDevice.name!.toLowerCase()))

				if (match) {
					setTargetBrowserDeviceId(match.deviceId)
				} else {
					console.warn(`AudioVisualizer: Could not find browser device matching name: ${inputDevice.name}`)
					setTargetBrowserDeviceId(undefined)
				}
			} catch (err) {
				console.error('AudioVisualizer: Error enumerating devices:', err)
			}
		}

		mapDevice()
	}, [inputDevice])

	useEffect(() => {
		if (!isRecording || !canvasRef.current) {
			// Cleanup
			if (animationRef.current) cancelAnimationFrame(animationRef.current)
			if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
			if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close()
			return
		}

		const setupVisualizer = async () => {
			try {
				const constraints: MediaStreamConstraints = {
					audio: targetBrowserDeviceId
						? {
								deviceId: { exact: targetBrowserDeviceId },
								echoCancellation: false,
								noiseSuppression: false,
								autoGainControl: false,
							}
						: true,
				}

				const stream = await navigator.mediaDevices.getUserMedia(constraints)
				streamRef.current = stream

				const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
				audioContextRef.current = audioContext
				if (audioContext.state === 'suspended') await audioContext.resume()

				const analyzer = audioContext.createAnalyser()
				analyzerRef.current = analyzer

				// Apply Audio Physics Props
				analyzer.fftSize = fftSize
				analyzer.smoothingTimeConstant = reaction
				analyzer.minDecibels = -90
				analyzer.maxDecibels = -10

				const source = audioContext.createMediaStreamSource(stream)
				source.connect(analyzer)

				const bufferLength = analyzer.frequencyBinCount
				const dataArray = new Uint8Array(bufferLength)

				const canvas = canvasRef.current
				if (!canvas) return
				const ctx = canvas.getContext('2d')
				if (!ctx) return

				// Handle resizing
				const updateCanvasSize = () => {
					const rect = canvas.getBoundingClientRect()
					canvas.width = rect.width * window.devicePixelRatio
					canvas.height = rect.height * window.devicePixelRatio
				}
				updateCanvasSize()

				// Handle window resize
				window.addEventListener('resize', updateCanvasSize)

				const draw = () => {
					if (!isRecording) return
					animationRef.current = requestAnimationFrame(draw)
					analyzer.getByteTimeDomainData(dataArray)

					// Clear with prop background
					ctx.fillStyle = backgroundColor
					ctx.fillRect(0, 0, canvas.width, canvas.height)

					ctx.save()
					ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

					// Draw Center Line
					const width = canvas.width / window.devicePixelRatio
					const height = canvas.height / window.devicePixelRatio

					if (centerLineWidth > 0) {
						ctx.strokeStyle = centerLineColor
						ctx.lineWidth = centerLineWidth
						ctx.beginPath()
						ctx.moveTo(0, height / 2)
						ctx.lineTo(width, height / 2)
						ctx.stroke()
					}

					// Draw Waveform
					ctx.lineWidth = waveWidth
					ctx.strokeStyle = waveColor
					ctx.beginPath()

					const sliceWidth = width / bufferLength
					let x = 0

					for (let i = 0; i < bufferLength; i++) {
						const v = dataArray[i] / 128.0

						// Apply Sensitivity Math
						const y = ((v - 1.0) * sensitivity + 1.0) * (height / 2)

						if (i === 0) {
							ctx.moveTo(x, y)
						} else {
							ctx.lineTo(x, y)
						}
						x += sliceWidth
					}

					ctx.lineTo(width, height / 2)
					ctx.stroke()
					ctx.restore()
				}

				draw()

				return () => {
					window.removeEventListener('resize', updateCanvasSize)
				}
			} catch (error) {
				console.error('AudioVisualizer: Error setting up:', error)
			}
		}

		setupVisualizer()

		return () => {
			if (animationRef.current) cancelAnimationFrame(animationRef.current)
			if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
			if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close()
		}
	}, [isRecording, targetBrowserDeviceId, sensitivity, reaction, fftSize, backgroundColor, waveColor, waveWidth, centerLineColor, centerLineWidth])

	if (!isRecording) return null

	return (
		<div className={`w-full rounded-md border border-border/60 bg-card/45 p-3 ${className}`}>
			{showLabel && (
				<div className="mb-2 flex items-center justify-between">
					<span className="text-xs font-medium text-muted-foreground">{inputDevice?.name || 'Audio Level'}</span>
					<span className="text-xs text-green-500">● Recording</span>
				</div>
			)}
			<canvas ref={canvasRef} className="w-full rounded" style={{ display: 'block', height: '90px' }} />
		</div>
	)
}
