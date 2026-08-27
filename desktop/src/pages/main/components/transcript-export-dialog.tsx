import { Clipboard, Download, Moon, PilcrowLeft, PilcrowRight, Sun } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import jsonLanguage from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { m } from '~/paraglide/messages.js'
import type { TextFormat } from '~/components/format-select'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Switch } from '~/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/style'
import type { TranscriptExportContent } from '~/lib/transcript-export'

SyntaxHighlighter.registerLanguage('json', jsonLanguage)

export interface TranscriptExportDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	format: TextFormat
	onFormatChange: (format: TextFormat) => void
	content: TranscriptExportContent
	onContentChange: (content: TranscriptExportContent) => void
	hasSummary: boolean
	showTimestamps: boolean
	onShowTimestampsChange: (show: boolean) => void
	showSpeakers: boolean
	onShowSpeakersChange: (show: boolean) => void
	preview: string
	renderedPreview?: string
	direction: 'rtl' | 'ltr'
	/** Direction of this export only — a one-off override, never saved. */
	onDirectionChange: (direction: 'rtl' | 'ltr') => void
	/** Appearance of the exported file, kept apart from the app's own theme. */
	theme: 'dark' | 'light'
	onThemeChange: (theme: 'dark' | 'light') => void
	onCopy: () => void | Promise<void>
	onSave: () => void | Promise<void>
}

const formats: Array<{
	value: TextFormat
	extension: string
	label: () => string
	description: () => string
}> = [
	{ value: 'normal', extension: 'TXT', label: m.exportFormatText, description: m.exportFormatTextDescription },
	{ value: 'md', extension: 'MD', label: m.exportFormatMarkdown, description: m.exportFormatMarkdownDescription },
	{ value: 'srt', extension: 'SRT', label: m.exportFormatSrt, description: m.exportFormatSrtDescription },
	{ value: 'vtt', extension: 'VTT', label: m.exportFormatVtt, description: m.exportFormatVttDescription },
	{ value: 'html', extension: 'HTML', label: m.exportFormatHtml, description: m.exportFormatHtmlDescription },
	{ value: 'json', extension: 'JSON', label: m.exportFormatJson, description: m.exportFormatJsonDescription },
	{ value: 'csv', extension: 'CSV', label: m.exportFormatCsv, description: m.exportFormatCsvDescription },
	{ value: 'docx', extension: 'DOCX', label: m.exportFormatDocx, description: m.exportFormatDocxDescription },
	{ value: 'pdf', extension: 'PDF', label: m.exportFormatPdf, description: m.exportFormatPdfDescription },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>
}

function VirtualPreviewRows({
	rows,
	direction,
	className,
	renderRow,
}: {
	rows: string[]
	direction: 'rtl' | 'ltr'
	className?: string
	renderRow: (row: string, index: number) => ReactNode
}) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 30,
		overscan: 10,
		measureElement: (element) => element.getBoundingClientRect().height,
	})

	return (
		<div
			ref={scrollRef}
			tabIndex={0}
			dir={direction}
			aria-label={m.exportPreviewAriaLabel()}
			className={cn('mt-3 min-h-[14rem] flex-1 overflow-auto rounded-xl border border-border/60 shadow-inner', className)}>
			<div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
				{virtualizer.getVirtualItems().map((virtualRow) => (
					<div
						key={virtualRow.key}
						ref={virtualizer.measureElement}
						data-index={virtualRow.index}
						className="absolute start-0 top-0 w-full"
						style={{ transform: `translateY(${virtualRow.start}px)` }}>
						{renderRow(rows[virtualRow.index], virtualRow.index)}
					</div>
				))}
			</div>
		</div>
	)
}

/** Label on the left, its control on the right — one row of the options card. */
function OptionRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2.5">
			<span className="text-sm text-foreground">{label}</span>
			{children}
		</div>
	)
}

/**
 * Two choices that need no words: a sun and a moon, an arrow each way. The label survives as the
 * tooltip and the accessible name, so nothing is lost by dropping the visible text.
 */
function IconToggle<T extends string>({
	value,
	onChange,
	options,
	ariaLabel,
}: {
	value: T
	onChange: (value: T) => void
	options: Array<{ value: T; label: string; icon: ReactNode }>
	ariaLabel: string
}) {
	return (
		<div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 p-1" role="radiogroup" aria-label={ariaLabel}>
			{options.map((option) => (
				<Tooltip key={option.value}>
					<TooltipTrigger asChild>
						<button
							type="button"
							role="radio"
							aria-checked={value === option.value}
							aria-label={option.label}
							onClick={() => onChange(option.value)}
							className={cn(
								'flex h-7 w-9 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80',
								value === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
							)}>
							{option.icon}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">{option.label}</TooltipContent>
				</Tooltip>
			))}
		</div>
	)
}

/** A row of mutually exclusive choices — the pill control used for content and for theme. */
function Segmented<T extends string>({
	value,
	onChange,
	options,
	ariaLabel,
	className,
}: {
	value: T
	onChange: (value: T) => void
	options: Array<{ value: T; label: string; disabled: boolean }>
	ariaLabel: string
	className?: string
}) {
	return (
		<div className={cn('grid grid-cols-2 rounded-full bg-muted/50 p-1', className)} role="radiogroup" aria-label={ariaLabel}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					role="radio"
					aria-checked={value === option.value}
					disabled={option.disabled}
					onClick={() => onChange(option.value)}
					className={cn(
						'cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 disabled:cursor-not-allowed disabled:opacity-40',
						value === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
					)}>
					{option.label}
				</button>
			))}
		</div>
	)
}

function htmlPreviewRows(html: string) {
	const parsed = new DOMParser().parseFromString(html, 'text/html')
	const main = parsed.querySelector('main')
	if (!main) return []
	const rows: string[] = []
	for (const child of main.children) {
		if (child.matches('section.transcript, section.summary')) {
			for (const nested of child.children) rows.push(nested.outerHTML)
		} else {
			rows.push(child.outerHTML)
		}
	}
	return rows
}

function RenderedDocumentPreview({ html, direction, theme }: { html: string; direction: 'rtl' | 'ltr'; theme: 'dark' | 'light' }) {
	const rows = useMemo(() => htmlPreviewRows(html), [html])
	return (
		<VirtualPreviewRows
			rows={rows}
			direction={direction}
			className={cn(
				'px-5 py-2 font-sans text-sm leading-relaxed [&_.metadata]:mb-1 [&_.metadata]:text-xs [&_.metadata]:font-semibold [&_.metadata]:text-muted-foreground [&_.segment]:py-3 [&_h1]:py-5 [&_h1]:text-center [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-primary [&_h2]:border-b [&_h2]:border-border [&_h2]:py-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:whitespace-pre-wrap',
				theme === 'dark' ? 'bg-[#181818] text-[#ececec]' : 'bg-white text-[#1a1c1f]',
			)}
			renderRow={(row) => <div dangerouslySetInnerHTML={{ __html: row }} />}
		/>
	)
}

export default function TranscriptExportDialog({
	open,
	onOpenChange,
	format,
	onFormatChange,
	content,
	onContentChange,
	hasSummary,
	showTimestamps,
	onShowTimestampsChange,
	showSpeakers,
	onShowSpeakersChange,
	preview,
	renderedPreview,
	direction,
	onDirectionChange,
	theme,
	onThemeChange,
	onCopy,
	onSave,
}: TranscriptExportDialogProps) {
	const timestampsRequired = format === 'srt' || format === 'vtt'
	const selectedFormat = formats.find((option) => option.value === format)
	const contentOptions: Array<{ value: TranscriptExportContent; label: string; disabled: boolean }> = [
		{ value: 'transcript', label: m.exportTranscript(), disabled: false },
		{ value: 'summary', label: m.exportSummary(), disabled: !hasSummary },
	]

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] w-[calc(100%_-_1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-border/60 bg-card/98 p-0 shadow-2xl">
				<DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pe-14 sm:px-6 sm:py-5 sm:pe-14">
					<DialogTitle className="text-xl">{m.exportDialogTitle()}</DialogTitle>
					<DialogDescription>{m.exportDialogDescription()}</DialogDescription>
				</DialogHeader>

				<div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:overflow-hidden">
					<div className="space-y-4 p-5 sm:p-6 lg:overflow-y-auto">
						<section className="space-y-2" aria-labelledby="export-format-heading">
							<div id="export-format-heading">
								<SectionLabel>{m.format()}</SectionLabel>
							</div>
							{/* One line per format: the description belongs to whichever is selected, below. */}
							<div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="export-format-heading">
								{formats.map((option) => {
									const selected = format === option.value
									return (
										<button
											key={option.value}
											type="button"
											role="radio"
											aria-checked={selected}
											onClick={() => onFormatChange(option.value)}
											className={cn(
												'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80',
												selected
													? 'border-primary/60 bg-primary/10 text-foreground'
													: 'border-transparent bg-muted/35 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
											)}>
											<span
												className={cn(
													'flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-semibold tracking-tight',
													selected ? 'bg-primary/20 text-primary' : 'bg-background/60 text-muted-foreground',
												)}>
												{option.extension}
											</span>
											<span className="truncate text-[13px] font-medium">{option.label()}</span>
										</button>
									)
								})}
							</div>
							<p className="min-h-[1.25rem] px-0.5 text-xs text-muted-foreground">{selectedFormat?.description()}</p>
						</section>

						{/* Every option is a row in one card: the same rhythm the Settings page uses. */}
						<section className="space-y-2" aria-label={m.exportOptions()}>
							<SectionLabel>{m.exportOptions()}</SectionLabel>
							<div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-background/30">
								<OptionRow label={m.exportContent()}>
									<Segmented
										className="w-52"
										ariaLabel={m.exportContent()}
										value={content}
										onChange={onContentChange}
										options={contentOptions}
									/>
								</OptionRow>

								<OptionRow label={m.theme()}>
									<IconToggle
										ariaLabel={m.theme()}
										value={theme}
										onChange={onThemeChange}
										options={[
											{ value: 'light' as const, label: m.light(), icon: <Sun className="h-3.5 w-3.5" /> },
											{ value: 'dark' as const, label: m.dark(), icon: <Moon className="h-3.5 w-3.5" /> },
										]}
									/>
								</OptionRow>

								<OptionRow label={m.textDirection()}>
									<IconToggle
										ariaLabel={m.textDirection()}
										value={direction}
										onChange={onDirectionChange}
										options={[
											{ value: 'ltr' as const, label: 'LTR', icon: <PilcrowRight className="h-3.5 w-3.5" /> },
											{ value: 'rtl' as const, label: 'RTL', icon: <PilcrowLeft className="h-3.5 w-3.5" /> },
										]}
									/>
								</OptionRow>

								<OptionRow label={m.showTimestamps()}>
									<Switch
										aria-label={m.showTimestamps()}
										checked={timestampsRequired || showTimestamps}
										disabled={timestampsRequired}
										onCheckedChange={onShowTimestampsChange}
									/>
								</OptionRow>

								<OptionRow label={m.showSpeakers()}>
									<Switch aria-label={m.showSpeakers()} checked={showSpeakers} onCheckedChange={onShowSpeakersChange} />
								</OptionRow>
							</div>
						</section>
					</div>

					<section
						className="flex min-h-[18rem] flex-col border-t border-border/60 bg-muted/20 p-5 sm:p-6 lg:min-h-0 lg:border-s lg:border-t-0"
						aria-labelledby="export-preview-heading">
						<div id="export-preview-heading">
							<SectionLabel>{m.exportPreview()}</SectionLabel>
						</div>
						{renderedPreview ? (
							<RenderedDocumentPreview html={renderedPreview} direction={direction} theme={theme} />
						) : format === 'md' ? (
							<VirtualPreviewRows
								rows={preview.split(/\n{2,}/)}
								direction={direction}
								className={cn('px-5 py-2', theme === 'dark' ? 'bg-[#181818] text-[#ececec]' : 'bg-white text-[#1a1c1f]')}
								renderRow={(block) => (
									<div className={cn('prose max-w-none py-2 text-sm', theme === 'dark' && 'prose-invert')}>
										<Markdown>{block}</Markdown>
									</div>
								)}
							/>
						) : format === 'json' ? (
							<VirtualPreviewRows
								rows={preview.split('\n')}
								direction="ltr"
								className="bg-[#fafafa] py-2 text-left dark:bg-[#282c34]"
								renderRow={(line) => (
									<SyntaxHighlighter
										language="json"
										style={theme === 'dark' ? oneDark : oneLight}
										customStyle={{
											margin: 0,
											padding: '0 1rem',
											fontSize: '12px',
											lineHeight: 1.7,
											textAlign: 'left',
											// Each row is its own <pre>: left to itself it scrolls, so a long line grows a scrollbar inside
											// every row instead of one on the preview. Wrapping keeps the scrolling on the preview alone.
											overflow: 'visible',
											whiteSpace: 'pre-wrap',
											wordBreak: 'break-word',
										}}
										codeTagProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }}>
										{line || ' '}
									</SyntaxHighlighter>
								)}
							/>
						) : (
							<VirtualPreviewRows
								rows={preview.split('\n')}
								direction={direction}
								className="bg-background/75 px-4 py-2 font-mono text-xs leading-relaxed text-foreground selection:bg-primary/20"
								renderRow={(line) => <div className="min-h-[1.7em] whitespace-pre-wrap break-words">{line || '\u00a0'}</div>}
							/>
						)}
					</section>
				</div>

				<DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-card px-5 py-4 sm:px-6">
					{format !== 'html' && format !== 'docx' && format !== 'pdf' && (
						<Button type="button" variant="outline" onClick={() => void onCopy()}>
							<Clipboard aria-hidden="true" />
							{m.exportCopy()}
						</Button>
					)}
					<Button type="button" onClick={() => void onSave()}>
						<Download aria-hidden="true" />
						{m.exportSave()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
