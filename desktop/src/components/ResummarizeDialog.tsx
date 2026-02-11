import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { Sparkles } from 'lucide-react'
import { promptTemplates, type PromptTemplate } from '~/lib/promptTemplates'

interface ResummarizeDialogProps {
	onSubmit: (prompt: string) => void
	loading: boolean
}

export default function ResummarizeDialog({ onSubmit, loading }: ResummarizeDialogProps) {
	const { t, i18n } = useTranslation()
	const lang = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(i18n.language) ?? 'English'
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
					<DialogTitle className="text-lg font-semibold">{t('common.resummarize')}</DialogTitle>
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
								{t(tpl.labelKey)}
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
							<p className="text-xs text-destructive">{t('common.prompt-must-contain-placeholder')}</p>
						)}
					</div>

					<Button onMouseDown={handleSubmit} disabled={!isValid || loading} className="w-full">
						{loading ? t('common.summarize-loading') : t('common.resummarize')}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
