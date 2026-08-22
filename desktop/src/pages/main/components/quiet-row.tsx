import { Bot, ChevronRight, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Switch } from '~/components/ui/switch'
import { openSettingsSection } from '~/lib/app'
import { useModelGates } from '~/providers/model-gates'
import { useSession } from '../session'

function OptionRow({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange: (value: boolean) => void }) {
	return (
		<div className="py-2">
			<div className="flex items-center justify-between gap-4">
				<span className="text-sm text-foreground">{label}</span>
				<Switch checked={checked} onCheckedChange={onChange} />
			</div>
			{/* Same note the settings page shows, so the cost of the option is visible where it is switched on. */}
			{checked && note && <p className="mt-1 pe-12 text-xs text-muted-foreground">{note}</p>}
		</div>
	)
}

export default function QuietRow() {
	const { preference } = useSession()
	// Both options need a model on disk; the gate downloads it before the switch takes effect.
	const modelGates = useModelGates()
	// Controlled: clicking a row inside the panel doesn't dismiss it on its own, so links close it by hand.
	const [open, setOpen] = useState(false)

	function openSection(section: string) {
		setOpen(false)
		openSettingsSection(section)
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			{/* Language leads the row: it changes the output, so it gets the only bordered control here. */}
			<div className="w-auto max-w-[220px]">
				<LanguageInput variant="prominent" />
			</div>

			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button variant="ghost" size="sm" className="h-9 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground">
						<SlidersHorizontal className="h-3.5 w-3.5" />
						{m.moreOptions()}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-72 rounded-2xl p-4">
					<p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.modelOptions()}</p>
					<div className="divide-y divide-border">
						<OptionRow
							label={m.recognizeSpeakers()}
							note={m.diarizeMaxSpeakersNote()}
							checked={preference.diarizeEnabled}
							onChange={(value) => void modelGates.toggleDiarization(value)}
						/>
						<OptionRow
							label={m.stableTimestamps()}
							note={m.stableTimestampsSlowNote()}
							checked={preference.stableTimestampsEnabled}
							onChange={(value) => void modelGates.toggleStableTimestamps(value)}
						/>
					</div>
					<Button variant="ghost" size="sm" className="mt-3 w-full justify-between rounded-xl px-3" onClick={() => openSection('tuning')}>
						<span className="flex items-center gap-2">
							<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
							{m.fineTuning()}
						</span>
						<ChevronRight className="h-3.5 w-3.5" />
					</Button>
					<Button variant="ghost" size="sm" className="mt-1 w-full justify-between rounded-xl px-3" onClick={() => openSection('models')}>
						<span className="flex items-center gap-2">
							<Bot className="h-3.5 w-3.5 text-muted-foreground" />
							{m.selectModel()}
						</span>
						<ChevronRight className="h-3.5 w-3.5" />
					</Button>
				</PopoverContent>
			</Popover>
		</div>
	)
}
