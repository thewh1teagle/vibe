import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Copy, Download, Plus, Search, X, AlignLeft, Braces, Captions, CodeXml, FileText, FileType } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { cn } from '~/lib/style'
import type { Job } from '../hooks/use-transcribe-queue'
import { exportFormatLabels, exportFormats, useTranscriptExport } from '../hooks/use-transcript-export'

// One glyph per format so the save menu scans visually.
const formatIcons: Record<string, typeof AlignLeft> = {
	normal: AlignLeft,
	srt: Captions,
	vtt: Captions,
	html: CodeXml,
	pdf: FileText,
	json: Braces,
	docx: FileType,
}
import { useSession } from '../session'

export default function TranscriptToolbar({ job, query, setQuery }: { job: Job | null; query: string; setQuery: (value: string) => void }) {
	const { queue, startNew } = useSession()
	const { copy, exportAs } = useTranscriptExport(job?.segments ?? [], job ? { name: job.name, path: job.path } : null)
	const [copied, setCopied] = useState(false)
	const [searching, setSearching] = useState(false)
	const searchRef = useRef<HTMLInputElement>(null)
	const resetRef = useRef<number | null>(null)

	useEffect(() => {
		return () => {
			if (resetRef.current) window.clearTimeout(resetRef.current)
		}
	}, [])

	useEffect(() => {
		if (searching) searchRef.current?.focus()
	}, [searching])

	async function onCopy() {
		await copy()
		setCopied(true)
		if (resetRef.current) window.clearTimeout(resetRef.current)
		resetRef.current = window.setTimeout(() => setCopied(false), 1200)
	}

	function closeSearch() {
		setSearching(false)
		setQuery('')
	}

	const hasText = (job?.segments.length ?? 0) > 0

	return (
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
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => event.key === 'Escape' && closeSearch()}
							placeholder="Search transcript"
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
						<Button variant="ghost" size="sm" onClick={onCopy} disabled={!hasText} className="rounded-full px-3 text-[13px] font-medium">
							{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
							{copied ? m.copied() : m.copy()}
						</Button>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="sm" disabled={!hasText} className="rounded-full px-3 text-[13px] font-medium">
									<Download className="h-3.5 w-3.5" />
									{m.save()}
									<ChevronDown className="h-3.5 w-3.5 opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="min-w-[9rem] rounded-xl">
								{exportFormats.map((format) => {
									const Icon = formatIcons[format] ?? FileText
									return (
										<DropdownMenuItem key={format} onSelect={() => void exportAs(format)} className="gap-2.5 rounded-lg text-[13px]">
											<Icon className="h-4 w-4 text-muted-foreground" />
											{exportFormatLabels[format]}
										</DropdownMenuItem>
									)
								})}
							</DropdownMenuContent>
						</DropdownMenu>

						<Button
							variant="ghost"
							size="sm"
							onClick={() => setSearching(true)}
							disabled={!hasText}
							className="rounded-full px-3 text-[13px] font-medium">
							<Search className="h-3.5 w-3.5" />
						</Button>

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
								New
							</Button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
