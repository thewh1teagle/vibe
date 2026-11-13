import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Globe } from 'lucide-react'
import { cn } from '~/lib/style'
import { flagFor } from '~/lib/flags'
import { Popover, PopoverAnchor, PopoverContent } from '~/components/ui/popover'

export interface LanguageOption {
	/** Value handed back to `onSelect`. */
	code: string
	/** Text shown in the row and, when selected, on the trigger. */
	label: string
	/** Extra needles the search matches against (english name, own name, ...). */
	keywords?: string[]
	/** Show a globe instead of a flag (used by "any language"). */
	globe?: boolean
	/** Render the row a touch heavier (used by "any language"). */
	emphasis?: boolean
}

export interface LanguageGroup {
	label: string | null
	items: LanguageOption[]
}

interface LanguageComboboxProps {
	/** Currently selected code; the matching row gets a checkmark. */
	value: string
	onSelect: (code: string) => void
	/** Groups to render. Callers filter by `query` themselves so they own the grouping rules. */
	groups: LanguageGroup[]
	query: string
	onQueryChange: (query: string) => void
	/** Text on the closed trigger, and the placeholder while typing, so the selection stays in view. */
	triggerLabel: string
	/** Spoken name of the search field the trigger turns into. */
	searchLabel: string
	ariaLabel: string
	emptyLabel: string
	className?: string
}

function Slot({ option }: { option: LanguageOption }) {
	const flag = option.globe ? null : flagFor(option.code)
	return (
		<span aria-hidden className="inline-flex w-6 shrink-0 justify-center text-[15px] leading-none">
			{flag ?? <Globe className="size-3.5 text-muted-foreground" />}
		</span>
	)
}

/**
 * Search-as-you-type language picker, the one the desktop app uses: the pill turns into the
 * search field while open, still showing the current choice until a letter is typed; arrows move
 * through the list, Enter picks.
 */
export default function LanguageCombobox({
	value,
	onSelect,
	groups,
	query,
	onQueryChange,
	triggerLabel,
	searchLabel,
	ariaLabel,
	emptyLabel,
	className,
}: LanguageComboboxProps) {
	const [open, setOpen] = useState(false)
	const [highlighted, setHighlighted] = useState(0)
	const listRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const restoreFocus = useRef(false)
	const listId = useId()

	const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])

	/** Moves the list itself, never the page: `scrollIntoView` would scroll every ancestor too. */
	function reveal(index: number, block: 'center' | 'nearest') {
		const list = listRef.current
		const row = list?.querySelector<HTMLElement>(`[data-index="${index}"]`)
		if (!list || !row) return
		const top = row.offsetTop
		const bottom = top + row.offsetHeight
		if (block === 'center') list.scrollTop = top - (list.clientHeight - row.offsetHeight) / 2
		else if (top < list.scrollTop) list.scrollTop = top
		else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
	}

	// Opening starts on the current choice, centred; typing starts again from the best match.
	useEffect(() => {
		if (!open) return
		const index = query
			? 0
			: Math.max(
					flat.findIndex((option) => option.code === value),
					0,
				)
		setHighlighted(index)
		const frame = requestAnimationFrame(() => reveal(index, query ? 'nearest' : 'center'))
		return () => cancelAnimationFrame(frame)
	}, [query, open]) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (open) return
		onQueryChange('')
		if (restoreFocus.current) {
			restoreFocus.current = false
			triggerRef.current?.focus()
		}
	}, [open]) // eslint-disable-line react-hooks/exhaustive-deps

	function move(index: number) {
		const next = Math.min(Math.max(index, 0), flat.length - 1)
		setHighlighted(next)
		reveal(next, 'nearest')
	}

	function close() {
		restoreFocus.current = true
		setOpen(false)
	}

	function pick(code: string) {
		onSelect(code)
		close()
	}

	function onInputKeyDown(event: React.KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			move(highlighted + 1)
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			move(highlighted - 1)
		} else if (event.key === 'Home') {
			event.preventDefault()
			move(0)
		} else if (event.key === 'End') {
			event.preventDefault()
			move(flat.length - 1)
		} else if (event.key === 'Enter') {
			event.preventDefault()
			const chosen = flat[highlighted] ?? flat[0]
			if (chosen) pick(chosen.code)
		} else if (event.key === 'Escape') {
			event.preventDefault()
			close()
		} else if (event.key === 'Tab') {
			setOpen(false)
		}
	}

	let runningIndex = -1

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<div
					onClick={() => {
						if (!open) setOpen(true)
					}}
					className={cn(
						'flex h-10 w-full items-center gap-2 rounded-full border bg-card px-3.5 text-start text-sm font-medium transition-colors duration-150 has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring',
						open ? 'border-ring/60' : 'cursor-pointer border-border hover:bg-muted/60',
						className,
					)}>
					<Globe aria-hidden className="size-4 shrink-0 text-muted-foreground" />
					{open ? (
						<input
							autoFocus
							role="combobox"
							aria-expanded
							aria-controls={listId}
							aria-autocomplete="list"
							aria-activedescendant={flat[highlighted] ? `${listId}-${highlighted}` : undefined}
							aria-label={`${ariaLabel}: ${searchLabel}`}
							autoComplete="off"
							autoCorrect="off"
							autoCapitalize="none"
							spellCheck={false}
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							onKeyDown={onInputKeyDown}
							placeholder={triggerLabel}
							className="w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-muted-foreground"
						/>
					) : (
						<button
							ref={triggerRef}
							type="button"
							aria-haspopup="listbox"
							aria-expanded={false}
							aria-label={`${ariaLabel}: ${triggerLabel}`}
							onKeyDown={(event) => {
								if (event.key === 'ArrowDown') {
									event.preventDefault()
									setOpen(true)
								}
							}}
							className="min-w-0 flex-1 cursor-pointer truncate text-start text-inherit outline-none">
							{triggerLabel}
						</button>
					)}
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => event.preventDefault()}
				onEscapeKeyDown={() => {
					restoreFocus.current = true
				}}
				className="w-(--radix-popper-anchor-width) min-w-[240px] overflow-hidden rounded-2xl p-0">
				{/* The scroller is inset from the rounded corners, so its bar never rides the curve. */}
				<div
					ref={listRef}
					id={listId}
					role="listbox"
					aria-label={ariaLabel}
					className="language-list relative my-1.5 max-h-72 overflow-y-auto overscroll-contain px-1.5">
					{flat.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{emptyLabel}</p>}
					{groups.map((group, groupIndex) => (
						<div
							key={group.label ?? `group-${groupIndex}`}
							role="group"
							aria-label={group.label ?? undefined}
							className={cn(groupIndex > 0 && !group.label && group.items.length > 0 && 'mt-1.5 border-t border-border pt-1.5')}>
							{group.label && group.items.length > 0 && (
								<p aria-hidden className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
									{group.label}
								</p>
							)}
							{group.items.map((option) => {
								runningIndex += 1
								const index = runningIndex
								const active = option.code === value
								return (
									<div
										key={option.code}
										id={`${listId}-${index}`}
										role="option"
										aria-selected={active}
										data-index={index}
										onClick={() => pick(option.code)}
										onMouseMove={() => setHighlighted(index)}
										className={cn(
											'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-foreground',
											index === highlighted && 'bg-muted/70',
											option.emphasis && 'font-medium',
										)}>
										<Slot option={option} />
										<span className="min-w-0 flex-1 truncate">{option.label}</span>
										{active && <Check aria-hidden className="size-4 shrink-0 text-foreground" />}
									</div>
								)
							})}
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

/** Does an option match what the user typed? */
export function matchesQuery(option: LanguageOption, needle: string) {
	if (!needle) return true
	const haystack = [option.label, option.code, ...(option.keywords ?? [])]
	return haystack.some((text) => text.toLowerCase().includes(needle))
}
