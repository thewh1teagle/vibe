import { useState } from 'react'
import { getLocale } from '~/paraglide/runtime.js'
import { m } from '~/paraglide/messages.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { Sparkles } from 'lucide-react'
import { promptTemplates, type PromptTemplate } from '~/lib/prompt-templates'

interface ResummarizeDialogProps {
	onSubmit: (prompt: string) => void
	loading: boolean
}

export default function ResummarizeDialog({ onSubmit, loading }: ResummarizeDialogProps) {
	const templateLabels = {
		'prompt-template-meeting-notes': m.promptTemplateMeetingNotes,
		'prompt-template-tldr': m.promptTemplateTldr,
		'prompt-template-translate': m.promptTemplateTranslate,
		'prompt-template-rewrite': m.promptTemplateRewrite,
	} as const
	const lang = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(getLocale()) ?? 'English'
	const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate>(promptTemplates[0])
	const [prompt, setPrompt] = useState(() => promptTemplates[0].prompt(lang))
	const [open, setOpen] = useState(false)

	const isValid = prompt.includes('%s')

	function selectTemplate(tpl: PromptTemplate) {
		setSelectedTemplate(tpl)
		setPrompt(tpl.prompt(lang))
	}

	function handleSubmit() {
		if (!isValid) return
		onSubmit(prompt)
		setOpen(false)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8 text-muted-foreground hover:text-foreground"
					disabled={loading}>
					<Sparkles className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg rounded-2xl border-border/60 bg-card/95 p-6 shadow-xl">
				<DialogHeader>
					<DialogTitle className="text-lg font-semibold">{m.resummarize()}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 pt-2">
					<div className="flex flex-wrap gap-1.5">
						{promptTemplates.map((tpl) => (
							<button
								key={tpl.labelKey}
								type="button"
								onClick={() => selectTemplate(tpl)}
								className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
									selectedTemplate === tpl
										? 'border-primary bg-primary/10 text-primary'
										: 'border-border/65 bg-background/50 text-muted-foreground hover:bg-accent/40'
								}`}>
								{templateLabels[tpl.labelKey as keyof typeof templateLabels]?.() ?? tpl.labelKey}
							</button>
						))}
					</div>

					<div className="space-y-1.5">
						<Textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							className="min-h-[120px] text-sm"
						/>
						{!isValid && (
							<p className="text-xs text-destructive">{m.promptMustContainPlaceholder()}</p>
						)}
					</div>

					<Button onMouseDown={handleSubmit} disabled={!isValid || loading} className="w-full">
						{loading ? m.summarizeLoading() : m.resummarize()}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
