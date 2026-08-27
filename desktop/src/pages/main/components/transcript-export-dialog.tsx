import { Check, Clipboard, Download } from 'lucide-react'
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
	theme: 'dark' | 'light'
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
	theme,
	onCopy,
	onSave,
}: TranscriptExportDialogProps) {
	const timestampsRequired = format === 'srt' || format === 'vtt'
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
					<div className="space-y-5 p-5 sm:p-6 lg:overflow-y-auto">
						<section className="space-y-3" aria-labelledby="export-format-heading">
							<div id="export-format-heading">
								<SectionLabel>{m.format()}</SectionLabel>
							</div>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-labelledby="export-format-heading">
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
												'group relative min-h-[4.5rem] rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80',
												selected
													? 'border-primary/70 bg-primary/7 shadow-xs'
													: 'border-border/60 bg-background/40 hover:border-border hover:bg-muted/45',
											)}>
											<span className="flex items-start gap-2.5">
												<span
													className={cn(
														'flex h-8 min-w-10 shrink-0 items-center justify-center rounded-lg border px-1.5 font-mono text-[10px] font-bold tracking-tight',
														selected
															? 'border-primary/25 bg-primary/12 text-primary'
															: 'border-border/60 bg-muted/50 text-muted-foreground',
													)}>
													{option.extension}
												</span>
												<span className="min-w-0">
													<span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
														{option.label()}
														{selected && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
													</span>
													<span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.description()}</span>
												</span>
											</span>
										</button>
									)
								})}
							</div>
						</section>

						<section className="space-y-3" aria-labelledby="export-content-heading">
							<div id="export-content-heading">
								<SectionLabel>{m.exportContent()}</SectionLabel>
							</div>
							<div className="grid grid-cols-2 rounded-xl bg-muted/55 p-1" role="radiogroup" aria-labelledby="export-content-heading">
								{contentOptions.map((option) => (
									<button
										key={option.value}
										type="button"
										role="radio"
										aria-checked={content === option.value}
										disabled={option.disabled}
										onClick={() => onContentChange(option.value)}
										className={cn(
											'rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 disabled:cursor-not-allowed disabled:opacity-40',
											content === option.value
												? 'bg-background text-foreground shadow-xs'
												: 'text-muted-foreground hover:text-foreground',
										)}>
										{option.label}
									</button>
								))}
							</div>
						</section>

						<section className="space-y-3" aria-label={m.exportOptions()}>
							<SectionLabel>{m.exportOptions()}</SectionLabel>
							<div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-background/30 px-3">
								<label className="flex cursor-pointer items-center justify-between gap-4 py-3 text-sm">
									<span>{m.showTimestamps()}</span>
									<Switch
										aria-label={m.showTimestamps()}
										checked={timestampsRequired || showTimestamps}
										disabled={timestampsRequired}
										onCheckedChange={onShowTimestampsChange}
									/>
								</label>
								<label className="flex cursor-pointer items-center justify-between gap-4 py-3 text-sm">
									<span>{m.showSpeakers()}</span>
									<Switch aria-label={m.showSpeakers()} checked={showSpeakers} onCheckedChange={onShowSpeakersChange} />
								</label>
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
