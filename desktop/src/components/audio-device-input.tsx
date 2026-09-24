import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { AudioDevice, InputLevelPayload, clampLevel, inputLevelColor, startInputLevelPreview, stopInputLevelPreview } from '~/lib/audio'
import { ModifyState } from '~/lib/types'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface AudioDeviceInputProps {
	type: 'output' | 'input'
	devices: AudioDevice[]
	device: AudioDevice | null
	setDevice: ModifyState<AudioDevice | null>
}

/**
 * Compact horizontal meter shown left of an input device name while the
 * dropdown is open. Width and color both encode the level: a short red bar
 * for quiet, a full green bar for loud.
 */
export function InputLevelBar({ level }: { level: number }) {
	const clamped = clampLevel(level)
	return (
		<span aria-hidden className="inline-flex h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
			<span
				className="h-full rounded-full transition-[width] duration-75 ease-out"
				style={{ width: `${clamped * 100}%`, backgroundColor: inputLevelColor(clamped) }}
			/>
		</span>
	)
}

export default function AudioDeviceInput({ type, devices, device, setDevice }: AudioDeviceInputProps) {
	const filtered = devices.filter((d) => (d.isInput && type === 'input') || (!d.isInput && type === 'output'))
	const isInput = type === 'input'
	const [open, setOpen] = useState(false)
	const [levels, setLevels] = useState<Record<string, number>>({})

	// While the input dropdown is open, run a meter-only capture per mic so every
	// row shows its live level. Closing (or unmounting) stops the preview streams.
	useEffect(() => {
		if (!isInput || !open) return

		const unlisten = listen<InputLevelPayload>('input_level', ({ payload }) => {
			if (!payload || typeof payload.deviceId !== 'string') return
			const level = clampLevel(payload.level)
			setLevels((prev) => (prev[payload.deviceId] === level ? prev : { ...prev, [payload.deviceId]: level }))
		})
		void startInputLevelPreview().catch((error) => {
			console.error('Could not start input level preview:', error)
		})

		return () => {
			unlisten.then((fn) => fn())
			void stopInputLevelPreview().catch(() => {
				// Best effort on teardown; the backend also stops the preview when a recording starts.
			})
			setLevels({})
		}
	}, [isInput, open])

	return (
		<div className="space-y-2.5 w-full">
			<Label>{type === 'input' ? m.microphone() : m.speakers()}</Label>
			<Select
				value={device?.id ?? 'none'}
				onValueChange={(value) => {
					if (value === 'none') {
						setDevice(null)
						return
					}
					const next = filtered.find((d) => d.id === value)
					setDevice(next ?? null)
				}}
				onOpenChange={setOpen}>
				<SelectTrigger>
					<SelectValue placeholder={m.noRecord()} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{m.noRecord()}</SelectItem>
					{filtered.map(({ id, name }) => (
						<SelectItem key={id} value={id} leading={isInput ? <InputLevelBar level={levels[id] ?? 0} /> : undefined}>
							{name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}
