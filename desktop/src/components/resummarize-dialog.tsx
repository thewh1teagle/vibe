import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { Sparkles } from 'lucide-react'
import { PLACEHOLDERS, presets } from '~/lib/ai'
import { presetLabel } from '~/pages/settings/sections/ai'
import { usePreferenceProvider } from '~/providers/preference'

interface ResummarizeDialogProps {
	onSubmit: (prompt: string) => void
	loading: boolean
	/** Controlled mode: opened from somewhere else (a menu item), so no trigger is rendered. */
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

/**
 * A one-off prompt for this transcript: starts from the prompt in settings, with the presets
 * a click away. Nothing here changes settings; that page is the place for the default.
 */
export default function ResummarizeDialog({ onSubmit, loading, open: openProp, onOpenChange }: ResummarizeDialogProps) {
	const { ai } = usePreferenceProvider()
	const summaryPresets = presets.filter((preset) => preset.task === 'summary')
	const [selected, setSelected] = useState<string>(ai.tasks.summary.preset)
	const [prompt, setPrompt] = useState(ai.tasks.summary.prompt)
	const [openState, setOpenState] = useState(false)
	const controlled = openProp !== undefined
	const open = controlled ? openProp : openState
	const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOpenState(next))

	const isValid = prompt.includes(PLACEHOLDERS.transcript) || prompt.includes('%s')

	function handleSubmit() {
		if (!isValid) return
		onSubmit(prompt)
		setOpen(false)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{!controlled && (
				<DialogTrigger asChild>
					<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" disabled={loading}>
						<Sparkles className="h-4 w-4" />
					</Button>
				</DialogTrigger>
			)}
			<DialogContent className="max-w-lg rounded-2xl border-border/60 bg-card/95 p-6 shadow-xl">
				<DialogHeader>
					<DialogTitle className="text-lg font-semibold">{m.customizeSummary()}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 pt-2">
					<div className="flex flex-wrap gap-1.5">
						{summaryPresets.map((preset) => (
							<button
								key={preset.id}
								type="button"
								onClick={() => {
									setSelected(preset.id)
									setPrompt(preset.prompt)
								}}
								className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
									selected === preset.id
										? 'border-primary bg-primary/10 text-primary'
										: 'border-border/65 bg-background/50 text-muted-foreground hover:bg-accent/40'
								}`}>
								{presetLabel(preset.id)}
							</button>
						))}
					</div>

					<div className="space-y-1.5">
						<Textarea
							value={prompt}
							onChange={(e) => {
								setPrompt(e.target.value)
								setSelected('custom')
							}}
							spellCheck={false}
							className="max-h-[360px] min-h-[160px] font-mono text-[12px] leading-relaxed"
						/>
						{!isValid && <p className="text-xs text-destructive">{m.promptMustContainPlaceholder({ placeholder: PLACEHOLDERS.transcript })}</p>}
					</div>

					<Button onMouseDown={handleSubmit} disabled={!isValid || loading} className="w-full">
						{loading ? m.summarizeLoading() : m.summarizeTranscript()}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
