import { ArrowUp, Sparkles, X } from 'lucide-react'
import Markdown from 'react-markdown'
import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { useSession } from '../session'
import type { Job } from '../hooks/use-transcribe-queue'
import { textSizeClass, type TranscriptViewOptions } from '../hooks/use-transcript-view'

/** Markdown with a blinking caret at the end while text is still arriving. */
function Streaming({ text, size }: { text: string; size: TranscriptViewOptions['textSize'] }) {
	return (
		<div className={cn('prose prose-neutral max-w-none dark:prose-invert', textSizeClass[size])}>
			<Markdown>{text}</Markdown>
			<span aria-hidden className="ms-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-foreground/60 align-text-bottom" />
		</div>
	)
}

/**
 * The Summary tab: the summary as it streams in and then as saved, and under it the questions
 * asked about this transcript with their answers. Everything the model writes lands in the
 * project file, so a question answered today is still there next month.
 */
export default function SummaryView({ job, options }: { job: Job; options: TranscriptViewOptions }) {
	const preference = usePreferenceProvider()
	const { summaries } = useSession()
	const [question, setQuestion] = useState('')
	// The question just sent, shown above its answer while the answer streams.
	const [sent, setSent] = useState<string | null>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)

	const summarizing = Boolean(summaries.pending[job.id])
	const draft = summaries.drafts[job.id]
	const progress = summaries.progress[job.id]
	const error = summaries.errors[job.id]
	const asking = Boolean(summaries.asking[job.id])
	const answerDraft = summaries.answerDrafts[job.id]
	const thread = job.thread ?? []
	const canAsk = summaries.enabled && job.segments.length > 0

	// Follow the answer as it grows, the way a chat does: the bottom of the page, padding included,
	// so the newest line sits above the floating box.
	useEffect(() => {
		if (asking || thread.length > 0) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
	}, [asking, answerDraft, thread.length])

	function send() {
		const text = question.trim()
		if (!text || asking) return
		setQuestion('')
		setSent(text)
		void summaries.ask(job, text).finally(() => setSent(null))
		// The box stays where the next question goes.
		inputRef.current?.focus()
	}

	return (
		<div className="relative flex h-full min-h-0 flex-col">
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				<div dir={preference.textAreaDirection} className={cn('mx-auto w-full max-w-[86ch] px-8 py-10 xl:max-w-[96ch]', canAsk && 'pb-28')}>
				<p className="mb-8 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.summaryTab()}</p>

				{summarizing && progress && progress.done < progress.total && (
					<div className="mb-6 space-y-2">
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<Spinner className="h-3.5 w-3.5" />
							{m.summarizeLoading()} · {m.summaryPart({ done: String(progress.done + 1), total: String(progress.total) })}
						</p>
						<div className="h-1 w-48 overflow-hidden rounded-full bg-muted-foreground/15">
							<div
								className="h-full rounded-full bg-primary/70 transition-[width] duration-300"
								style={{ width: `${(progress.done / progress.total) * 100}%` }}
							/>
						</div>
					</div>
				)}

				{summarizing && draft ? (
					<Streaming text={draft} size={options.textSize} />
				) : job.summary ? (
					// The models answer in markdown; render it rather than showing the syntax.
					<div className={cn('prose prose-neutral max-w-none dark:prose-invert', textSizeClass[options.textSize])}>
						<Markdown>{job.summary}</Markdown>
					</div>
				) : summarizing ? (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Spinner className="h-3.5 w-3.5" />
						{m.summarizeLoading()}
					</p>
				) : error ? (
					<p className="text-sm text-destructive">{error}</p>
				) : null}

				{job.summary && summarizing && !draft && (
					<p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
						<Spinner className="h-3.5 w-3.5" />
						{m.summarizeLoading()}
					</p>
				)}

				{(thread.length > 0 || asking) && (
					<section className="mt-12 border-t border-border/60 pt-8">
						<p className="mb-5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{m.askTranscript()}</p>

						<div className="space-y-6">
							{thread.map((entry, index) => (
								<div key={index} className="group">
									<div className="flex items-start gap-3">
										<p className="flex-1 rounded-2xl bg-muted/60 px-4 py-2.5 text-sm text-foreground">{entry.question}</p>
										<button
											type="button"
											onClick={() => summaries.removeThreadEntry(job, index)}
											aria-label={m.removeQuestion()}
											className="mt-2 cursor-pointer rounded-full p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground">
											<X className="h-3.5 w-3.5" />
										</button>
									</div>
									<div className={cn('prose prose-neutral mt-3 max-w-none ps-1 dark:prose-invert', textSizeClass[options.textSize])}>
										<Markdown>{entry.answer}</Markdown>
									</div>
								</div>
							))}
							{asking && (
								<div>
									{sent && <p className="mb-3 rounded-2xl bg-muted/60 px-4 py-2.5 text-sm text-foreground">{sent}</p>}
									{answerDraft ? (
										<Streaming text={answerDraft} size={options.textSize} />
									) : (
										<p className="flex items-center gap-2 text-sm text-muted-foreground">
											<Spinner className="h-3.5 w-3.5" />
											<Sparkles className="h-3.5 w-3.5" />
										</p>
									)}
								</div>
							)}
						</div>

					</section>
				)}
				</div>
			</div>

			{canAsk && (
				// Floats over the end of the page like a chat box, so the question is always one keystroke away.
				<div dir={preference.textAreaDirection} className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent pt-8 pb-5">
					<form
						onSubmit={(event) => {
							event.preventDefault()
							send()
						}}
						className="pointer-events-auto mx-auto flex w-[calc(100%-4rem)] max-w-[calc(86ch-4rem)] items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-lg xl:max-w-[calc(96ch-4rem)]">
						<textarea
							ref={inputRef}
							value={question}
							onChange={(event) => setQuestion(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter' && !event.shiftKey) {
									event.preventDefault()
									send()
								}
							}}
							rows={1}
							placeholder={m.askPlaceholder()}
							className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/70"
						/>
						<Button type="submit" size="iconSm" className="h-7 w-7 shrink-0 rounded-full" disabled={!question.trim() || asking} aria-label={m.askSend()}>
							{asking ? <Spinner className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
						</Button>
					</form>
				</div>
			)}
		</div>
	)
}
