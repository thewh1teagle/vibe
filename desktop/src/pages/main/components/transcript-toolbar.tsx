import { AnimatePresence, motion } from 'framer-motion'
import { Download, NotebookPen, Pencil, PilcrowLeft, PilcrowRight, Plus, Search, Settings2, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { usePreferenceProvider } from '~/providers/preference'
import { Button } from '~/components/ui/button'
import ResummarizeDialog from '~/components/resummarize-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/style'
import type { TextFormat } from '~/components/format-select'
import type { TranscriptExportContent } from '~/lib/transcript-export'
import type { Job } from '../hooks/use-transcribe-queue'
import type { TranscriptTab, TranscriptTextSize, TranscriptViewOptions } from '../hooks/use-transcript-view'
import { useTranscriptExport } from '../hooks/use-transcript-export'
import TranscriptExportDialog from './transcript-export-dialog'
import { useSession } from '../session'

const TEXT_SIZES: { value: TranscriptTextSize; label: () => string }[] = [
	{ value: 'sm', label: () => m.textSizeSmall() },
	{ value: 'md', label: () => m.textSizeMedium() },
	{ value: 'lg', label: () => m.textSizeLarge() },
]

/** Reading controls for the transcript: type scale, timestamps, speaker labels. */
function ViewOptions({ options }: { options: TranscriptViewOptions }) {
	// Direction belongs to the reading view too, even though it is stored with the other preferences.
	const preference = usePreferenceProvider()

	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="rounded-full px-3 text-[13px] font-medium" aria-label={m.viewOptions()}>
							<Settings2 className="h-3.5 w-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{m.viewOptions()}</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-64 rounded-2xl p-4">
				<p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.viewOptions()}</p>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<span className="text-sm text-foreground">{m.textSize()}</span>
						<div className="inline-flex w-full items-center gap-1 rounded-full border border-border bg-muted/50 p-1">
							{TEXT_SIZES.map((size) => (
								<button
									key={size.value}
									type="button"
									onClick={() => options.setTextSize(size.value)}
									className={cn(
										'flex-1 cursor-pointer rounded-full py-1 text-[12px] font-medium transition-colors duration-150',
										options.textSize === size.value
											? 'bg-background text-foreground shadow-sm'
											: 'text-muted-foreground hover:text-foreground',
									)}>
									{size.label()}
								</button>
							))}
						</div>
					</div>
					<div className="flex items-center justify-between gap-4 border-t border-border pt-3">
						<span className="text-sm text-foreground">{m.textDirection()}</span>
						<div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 p-1">
							{(['ltr', 'rtl'] as const).map((value) => (
								<button
									key={value}
									type="button"
									aria-label={value.toUpperCase()}
									aria-pressed={preference.textAreaDirection === value}
									onClick={() => preference.setTextAreaDirection(value)}
									className={cn(
										'flex h-6 w-8 cursor-pointer items-center justify-center rounded-full transition-colors duration-150',
										preference.textAreaDirection === value
											? 'bg-background text-foreground shadow-sm'
											: 'text-muted-foreground hover:text-foreground',
									)}>
									{value === 'ltr' ? <PilcrowRight className="h-3.5 w-3.5" /> : <PilcrowLeft className="h-3.5 w-3.5" />}
								</button>
							))}
						</div>
					</div>

					<div className="flex items-center justify-between gap-4">
						<span className="text-sm text-foreground">{m.showTimestamps()}</span>
						<Switch checked={options.showTimestamps} onCheckedChange={options.setShowTimestamps} />
					</div>
					<div className="flex items-center justify-between gap-4">
						<span className="text-sm text-foreground">{m.showSpeakers()}</span>
						<Switch checked={options.showSpeakers} onCheckedChange={options.setShowSpeakers} />
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

/**
 * Everything the AI step can do for the open transcript, behind one icon — same popover grammar as
 * the view options, so the toolbar keeps its shape whether or not a summary exists.
 */
function SummaryMenu({ job, tab, setTab }: { job: Job | null; tab: TranscriptTab; setTab: (tab: TranscriptTab) => void }) {
	const { summaries } = useSession()
	const [open, setOpen] = useState(false)
	const [promptOpen, setPromptOpen] = useState(false)

	const summarizing = job ? Boolean(summaries.pending[job.id]) : false
	const summaryError = job ? summaries.errors[job.id] : undefined
	const hasSummary = Boolean(job?.summary)
	const hasText = (job?.segments.length ?? 0) > 0
	const canSummarize = summaries.enabled && hasText && job?.status !== 'running'
	const actionLabel =
		!canSummarize && hasSummary
			? m.summaryTab()
			: summarizing
				? m.summarizeLoading()
				: summaryError
					? m.retrySummary()
					: hasSummary
						? m.regenerateSummary()
						: m.summarizeTranscript()

	// Nothing to offer: the feature is off in settings and this transcript has no summary either.
	if (!canSummarize && !hasSummary) return null

	function run(prompt?: string) {
		setOpen(false)
		if (job) void summaries.summarize(job, prompt)
	}

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger asChild>
							<Button variant="ghost" size="sm" className="rounded-full px-3 text-[13px] font-medium" aria-label={actionLabel}>
								{summarizing ? <Spinner className="h-3.5 w-3.5" /> : <NotebookPen className="h-3.5 w-3.5" />}
								{actionLabel}
							</Button>
						</PopoverTrigger>
					</TooltipTrigger>
					<TooltipContent>{actionLabel}</TooltipContent>
				</Tooltip>
				<PopoverContent align="end" className="w-64 rounded-2xl p-4">
					<p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.processWithLlm()}</p>

					<div className="space-y-3">
						{hasSummary && (
							<div className="inline-flex w-full items-center gap-1 rounded-full border border-border bg-muted/50 p-1">
								{(['transcript', 'summary'] as const).map((value) => (
									<button
										key={value}
										type="button"
										onClick={() => setTab(value)}
										className={cn(
											'flex-1 cursor-pointer rounded-full py-1 text-[12px] font-medium transition-colors duration-150',
											tab === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
										)}>
										{value === 'transcript' ? m.segmentsTab() : m.summaryTab()}
									</button>
								))}
							</div>
						)}

						<div className={cn('space-y-0.5', hasSummary && 'border-t border-border pt-2')}>
							{canSummarize && (
								<button
									type="button"
									disabled={summarizing}
									onClick={() => run()}
									className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-start text-sm text-foreground transition-colors duration-150 hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50">
									<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
									{summaryError ? m.retrySummary() : hasSummary ? m.regenerateSummary() : m.summarizeTranscript()}
								</button>
							)}
							{canSummarize && (
								<button
									type="button"
									disabled={summarizing}
									onClick={() => {
										setOpen(false)
										setPromptOpen(true)
									}}
									className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-start text-sm text-foreground transition-colors duration-150 hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50">
									<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
									{m.customizeSummary()}
								</button>
							)}
							{summaryError && <p className="px-2 pt-1 text-xs text-destructive">{m.summaryFailed()}</p>}
						</div>
					</div>
				</PopoverContent>
			</Popover>

			<ResummarizeDialog open={promptOpen} onOpenChange={setPromptOpen} loading={summarizing} onSubmit={(prompt) => run(prompt)} />
		</>
	)
}

export default function TranscriptToolbar({
	job,
	query,
	setQuery,
	options,
	tab,
	setTab,
}: {
	job: Job | null
	query: string
	setQuery: (value: string) => void
	options: TranscriptViewOptions
	tab: TranscriptTab
	setTab: (tab: TranscriptTab) => void
}) {
	const { queue, startNew } = useSession()
	const preference = usePreferenceProvider()
	const [exportOpen, setExportOpen] = useState(false)
	const [exportContent, setExportContent] = useState<TranscriptExportContent>('transcript')
	const [exportTimestamps, setExportTimestamps] = useState(options.showTimestamps)
	const [exportSpeakers, setExportSpeakers] = useState(options.showSpeakers)
	const [searching, setSearching] = useState(false)
	const searchRef = useRef<HTMLInputElement>(null)
	const exporter = useTranscriptExport({
		enabled: exportOpen,
		segments: job?.segments ?? [],
		summary: job?.summary,
		file: job ? { name: job.name, path: job.path } : null,
		format: preference.textFormatTranscript,
		content: exportContent,
		showTimestamps: exportTimestamps,
		showSpeakers: exportSpeakers,
	})

	useEffect(() => {
		if (!searching) return
		// The row animates in, so claim focus again once that frame has painted.
		const frame = requestAnimationFrame(() => searchRef.current?.focus())
		searchRef.current?.focus()
		return () => cancelAnimationFrame(frame)
	}, [searching])

	function openExport() {
		setExportContent(tab === 'summary' && job?.summary ? 'summary' : 'transcript')
		setExportTimestamps(options.showTimestamps)
		setExportSpeakers(options.showSpeakers)
		setExportOpen(true)
	}

	function closeSearch() {
		setSearching(false)
		setQuery('')
	}

	async function saveExport() {
		if (await exporter.save()) setExportOpen(false)
	}

	const hasText = (job?.segments.length ?? 0) > 0
	const hasExportContent = hasText || Boolean(job?.summary)

	return (
		<>
			<div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background/85 px-4 backdrop-blur-md">
				<AnimatePresence initial={false} mode="wait">
					{searching ? (
						<motion.div
							key="search"
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.15, ease: 'easeOut' }}
							className="flex w-full items-center gap-2">
							<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
							<input
								ref={searchRef}
								autoFocus
								autoComplete="off"
								autoCorrect="off"
								autoCapitalize="none"
								spellCheck={false}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								onKeyDown={(event) => event.key === 'Escape' && closeSearch()}
								placeholder={m.searchTranscript()}
								className="h-9 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
							/>
							<Button variant="ghost" size="iconSm" onClick={closeSearch} className="rounded-full">
								<X className="h-4 w-4" />
							</Button>
						</motion.div>
					) : (
						<motion.div
							key="actions"
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.15, ease: 'easeOut' }}
							className="flex w-full items-center gap-1">
							<Button
								variant="ghost"
								size="sm"
								onClick={openExport}
								disabled={!hasExportContent}
								className="rounded-full px-3 text-[13px] font-medium">
								<Download className="h-3.5 w-3.5" />
								{m.exportDialogTitle()}
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={() => setSearching(true)}
								disabled={!hasText}
								className="rounded-full px-3 text-[13px] font-medium">
								<Search className="h-3.5 w-3.5" />
							</Button>

							<SummaryMenu job={job} tab={tab} setTab={setTab} />

							<ViewOptions options={options} />

							<div className="ms-auto flex items-center gap-1">
								{queue.running && (
									<Button
										variant="ghost"
										size="sm"
										onClick={queue.cancelAll}
										disabled={queue.isAborting}
										className={cn('rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-destructive')}>
										{queue.isAborting ? m.aborting() : m.cancel()}
									</Button>
								)}
								<Button variant="ghost" size="sm" onClick={startNew} className="rounded-full px-3 text-[13px] font-medium">
									<Plus className="h-3.5 w-3.5" />
									{m.newSession()}
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
			<TranscriptExportDialog
				open={exportOpen}
				onOpenChange={setExportOpen}
				format={preference.textFormatTranscript}
				onFormatChange={(format: TextFormat) => preference.setTextFormatTranscript(format)}
				content={exportContent}
				onContentChange={setExportContent}
				hasSummary={Boolean(job?.summary)}
				showTimestamps={exportTimestamps}
				onShowTimestampsChange={setExportTimestamps}
				showSpeakers={exportSpeakers}
				onShowSpeakersChange={setExportSpeakers}
				preview={exporter.preview}
				renderedPreview={exporter.renderedPreview}
				direction={preference.textAreaDirection}
				theme={preference.theme}
				onCopy={exporter.copy}
				onSave={saveExport}
			/>
		</>
	)
}
