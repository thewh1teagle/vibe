import { invoke } from '@tauri-apps/api/core'
import * as pathApi from '@tauri-apps/api/path'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { MoreHorizontal, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { cn } from '~/lib/style'
import { deleteTranscript, listTranscripts, readTranscript, renameTranscript, TRANSCRIPTS_CHANGED_EVENT, type TranscriptEntry } from '~/lib/transcripts-store'
import { useSession } from '../session'

/** "just now" / "14m ago" / "3h ago" / "2d ago" / "Aug 19" / "Aug 19, 2024" */
function relativeDate(date: Date) {
	const time = date.getTime()
	if (!time) return ''
	const minutes = Math.floor((Date.now() - time) / 60_000)
	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	if (days < 7) return `${days}d ago`
	const sameYear = date.getFullYear() === new Date().getFullYear()
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

interface RowMenuState {
	/** null while the source path is still being read from disk */
	sourcePath: string | null
	sourceExists: boolean
}

function RecentRow({
	entry,
	active,
	disabled,
	onOpen,
	onDeleted,
	onRenamed,
}: {
	entry: TranscriptEntry
	active: boolean
	disabled: boolean
	onOpen: () => void
	onDeleted: () => void
	onRenamed: () => void
}) {
	const { queue } = useSession()
	const [menu, setMenu] = useState<RowMenuState>({ sourcePath: null, sourceExists: false })
	const [renaming, setRenaming] = useState(false)
	const [draftName, setDraftName] = useState(entry.name)

	// The list is built from filenames only, so the original media path is read lazily — the first
	// time the row's menu opens — to decide whether "Re-transcribe" can do anything.
	const loadSource = useCallback(async () => {
		const record = await readTranscript(entry.path)
		if (!record?.sourcePath) {
			setMenu({ sourcePath: null, sourceExists: false })
			return
		}
		let sourceExists = false
		try {
			sourceExists = await fs.exists(record.sourcePath)
		} catch (error) {
			console.warn('failed to check source file:', error)
		}
		setMenu({ sourcePath: record.sourcePath, sourceExists })
	}, [entry.path])

	async function reveal() {
		try {
			await invoke('open_path', { path: await pathApi.dirname(entry.path) })
		} catch (error) {
			console.warn('failed to reveal transcript:', error)
		}
	}

	async function remove() {
		const confirmed = await dialog.ask(`Delete “${entry.name}”? The transcript file will be removed.`, {
			title: 'Delete transcript',
			kind: 'warning',
		})
		if (!confirmed) return
		await deleteTranscript(entry.path)
		onDeleted()
	}

	function retranscribe() {
		if (!menu.sourcePath || !menu.sourceExists) return
		queue.enqueue([{ name: entry.name, path: menu.sourcePath }])
	}

	async function commitRename() {
		const next = draftName.trim()
		setRenaming(false)
		if (!next || next === entry.name) return
		if (await renameTranscript(entry.path, next)) onRenamed()
	}

	if (renaming) {
		return (
			<div className="flex items-center rounded-xl bg-muted px-2 py-1.5">
				<input
					autoFocus
					value={draftName}
					onChange={(event) => setDraftName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') void commitRename()
						if (event.key === 'Escape') setRenaming(false)
					}}
					onBlur={() => void commitRename()}
					aria-label="Transcript name"
					className="h-7 w-full min-w-0 rounded-lg border border-ring/40 bg-background px-2 text-[13px] text-foreground outline-none"
				/>
			</div>
		)
	}

	return (
		<div className={cn('group relative flex items-center rounded-xl transition-colors duration-150', active ? 'bg-muted' : 'hover:bg-muted/60')}>
			<button
				type="button"
				onClick={onOpen}
				disabled={disabled}
				title={entry.name}
				className="min-w-0 flex-1 cursor-pointer px-3 py-2 text-start disabled:cursor-default disabled:opacity-50">
				<p className="truncate text-[13px] font-medium text-foreground">{entry.name}</p>
				<p className="mt-0.5 truncate text-[11px] text-muted-foreground">{relativeDate(entry.createdAt)}</p>
			</button>

			<DropdownMenu
				onOpenChange={(open) => {
					if (open) void loadSource()
				}}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Transcript actions"
						className={cn(
							'me-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-opacity duration-150',
							'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:text-foreground',
						)}>
						<MoreHorizontal className="h-4 w-4" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem disabled={disabled || !menu.sourceExists} onSelect={retranscribe}>
						Re-transcribe
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => {
							setDraftName(entry.name)
							setRenaming(true)
						}}>
						Rename
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void reveal()}>{m.showInFolder()}</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void remove()}>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

export default function RecentsSidebar() {
	const { queue, startNew } = useSession()
	const [entries, setEntries] = useState<TranscriptEntry[]>([])
	const [query, setQuery] = useState('')

	const refresh = useCallback(() => {
		void listTranscripts().then(setEntries)
	}, [])

	useEffect(() => {
		refresh()
		// Saves happen inside the queue; deletes happen in other rows. Both announce themselves.
		window.addEventListener(TRANSCRIPTS_CHANGED_EVENT, refresh)
		return () => window.removeEventListener(TRANSCRIPTS_CHANGED_EVENT, refresh)
	}, [refresh])

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase()
		if (!needle) return entries
		return entries.filter((entry) => entry.name.toLowerCase().includes(needle))
	}, [entries, query])

	const activePath = queue.selectedJob?.savedPath ?? null

	async function open(entry: TranscriptEntry) {
		const record = await readTranscript(entry.path)
		if (!record) return
		queue.hydrate(record, entry.path)
	}

	return (
		<aside className="flex min-h-[420px] w-[260px] shrink-0 flex-col border-e border-border">
			<div className="px-2 pt-1">
				<button
					type="button"
					onClick={startNew}
					className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-muted/60">
					<Plus className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
					New transcription
				</button>
			</div>

			{entries.length > 8 && (
				<div className="relative mt-2 px-3">
					<Search className="pointer-events-none absolute start-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search recents"
						className="h-8 w-full rounded-full border border-border bg-transparent ps-7 pe-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring/40"
					/>
				</div>
			)}

			<p className="px-4 pt-4 pb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">Recents</p>

			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{filtered.length === 0 ? (
					<p className="px-3 py-2 text-[13px] text-muted-foreground">{entries.length === 0 ? 'Transcripts you create appear here' : 'No matches'}</p>
				) : (
					filtered.map((entry) => (
						<RecentRow
							key={entry.path}
							entry={entry}
							active={entry.path === activePath}
							// Loading another transcript mid-run would fight the queue for the view.
							disabled={queue.running}
							onOpen={() => void open(entry)}
							onDeleted={refresh}
							onRenamed={refresh}
						/>
					))
				)}
			</div>
		</aside>
	)
}
