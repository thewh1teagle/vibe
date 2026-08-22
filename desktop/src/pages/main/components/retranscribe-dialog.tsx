import { Bot, ChevronRight } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Switch } from '~/components/ui/switch'
import { openSettingsSection } from '~/lib/app'
import { useModelGates } from '~/providers/model-gates'
import { getFriendlyModelName } from '~/lib/model'
import { usePreferenceProvider } from '~/providers/preference'

function OptionRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
	return (
		<div className="flex items-center justify-between gap-4 py-2">
			<span className="text-sm text-foreground">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	)
}

/**
 * Re-running a transcript is rarely "the same again" — it is usually the same audio with a different
 * language or model. The dialog surfaces those choices before the run starts.
 */
export default function RetranscribeDialog({
	open,
	onOpenChange,
	name,
	onConfirm,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	name: string
	onConfirm: () => void
}) {
	const preference = usePreferenceProvider()
	// Same gate as the options popover: the models are fetched before either switch takes effect.
	const modelGates = useModelGates()
	// Renamed models keep their custom label; otherwise fall back to the file's friendly name.
	const modelPath = preference.modelPath
	const modelName = modelPath ? (preference.modelDisplayNames[modelPath] ?? getFriendlyModelName(modelPath.split(/[/\\]/).pop() ?? '')) : m.selectModel()

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md rounded-2xl border-border/60 bg-card/95 p-6 shadow-xl">
				<DialogHeader>
					<DialogTitle className="text-lg font-semibold">{m.reTranscribe()}</DialogTitle>
				</DialogHeader>

				<p className="-mt-1 truncate text-[13px] text-muted-foreground" title={name}>
					{name}
				</p>

				<div className="space-y-3 pt-2">
					<LanguageInput />

					<div className="divide-y divide-border rounded-xl border border-border/60 px-3">
						<OptionRow
							label={m.recognizeSpeakers()}
							checked={preference.diarizeEnabled}
							onChange={(value) => void modelGates.toggleDiarization(value)}
						/>
						<OptionRow
							label={m.stableTimestamps()}
							checked={preference.stableTimestampsEnabled}
							onChange={(value) => void modelGates.toggleStableTimestamps(value)}
						/>
					</div>

					<button
						type="button"
						onClick={() => {
							onOpenChange(false)
							openSettingsSection('models')
						}}
						className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-start transition-colors duration-150 hover:bg-muted/60">
						<span className="flex min-w-0 items-center gap-2">
							<Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
							<span className="min-w-0">
								<span className="block text-sm text-foreground">{m.selectModel()}</span>
								<span className="block truncate text-xs text-muted-foreground">{modelName}</span>
							</span>
						</span>
						<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
					</button>

					<div className="flex justify-end gap-2 pt-1">
						<Button variant="ghost" onClick={() => onOpenChange(false)}>
							{m.cancel()}
						</Button>
						<Button
							onClick={() => {
								onOpenChange(false)
								onConfirm()
							}}>
							{m.reTranscribe()}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
