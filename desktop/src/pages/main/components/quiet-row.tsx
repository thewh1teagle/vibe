import { ChevronRight, SlidersHorizontal } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Switch } from '~/components/ui/switch'
import { openSettingsSection } from '~/lib/app'
import { useSession } from '../session'

function OptionRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2">
			<span className="text-sm text-foreground">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	)
}

export default function QuietRow() {
	const { preference } = useSession()

	return (
		<div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
			{/* LanguageInput restyled in place: its label is redundant on a one-line row. */}
			<div className="w-[190px] [&>div]:space-y-0 [&_label]:sr-only [&_button]:h-9 [&_button]:rounded-full [&_button]:border-border [&_button]:bg-transparent [&_button]:text-[13px] [&_button]:shadow-none">
				<LanguageInput />
			</div>

			<Popover>
				<PopoverTrigger asChild>
					<Button variant="ghost" size="sm" className="h-9 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground">
						<SlidersHorizontal className="h-3.5 w-3.5" />
						{m.moreOptions()}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="center" className="w-72 rounded-2xl p-4">
					<p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.modelOptions()}</p>
					<div className="divide-y divide-border">
						<OptionRow label={m.recognizeSpeakers()} checked={preference.diarizeEnabled} onChange={preference.setDiarizeEnabled} />
						<OptionRow label={m.stableTimestamps()} checked={preference.stableTimestampsEnabled} onChange={preference.setStableTimestampsEnabled} />
						<OptionRow
							label={m.translateToEnglish()}
							checked={preference.modelOptions.translate ?? false}
							onChange={(value) => preference.setModelOptions({ ...preference.modelOptions, translate: value })}
						/>
						<OptionRow
							label={m.useWordTimestamps()}
							checked={preference.modelOptions.word_timestamps ?? false}
							onChange={(value) => preference.setModelOptions({ ...preference.modelOptions, word_timestamps: value })}
						/>
					</div>
					<Button variant="ghost" size="sm" className="mt-3 w-full justify-between rounded-xl px-3" onClick={() => openSettingsSection('tuning')}>
						{m.fineTuning()}
						<ChevronRight className="h-3.5 w-3.5" />
					</Button>
				</PopoverContent>
			</Popover>
		</div>
	)
}
