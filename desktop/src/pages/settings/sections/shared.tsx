import type { ComponentProps, ReactNode } from 'react'
import { cn } from '~/lib/style'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import type { viewModel } from '../view-model'

export type SettingsViewModel = ReturnType<typeof viewModel>

/** Shared control sizing for compact row controls (selects / inputs). */
export const rowControlClass = 'h-9 rounded-lg'

/**
 * A settings group: optional heading + one bordered container whose rows are
 * separated by hairline borders.
 */
export function SettingsGroup({
	title,
	description,
	children,
	className,
}: {
	title?: ReactNode
	description?: ReactNode
	children: ReactNode
	className?: string
}) {
	return (
		<section className="space-y-2">
			{(title || description) && (
				<div className="space-y-0.5 px-1">
					{title && <h3 className="text-[13px] font-medium text-foreground">{title}</h3>}
					{description && <p className="text-xs text-muted-foreground">{description}</p>}
				</div>
			)}
			<div className={cn('divide-y divide-border/45 overflow-hidden rounded-xl border border-border/60 bg-card', className)}>{children}</div>
		</section>
	)
}

/** Label + optional one-line description, used on the left side of every row. */
function RowLabel({ label, description, clamp = true }: { label: ReactNode; description?: ReactNode; clamp?: boolean }) {
	return (
		<div className="min-w-0 space-y-0.5">
			<div className="text-sm text-foreground">{label}</div>
			{description && <p className={cn('text-xs text-muted-foreground', clamp && 'line-clamp-1')}>{description}</p>}
		</div>
	)
}

/** A single row: label (+ description) on the left, the control on the right. */
export function SettingsRow({
	label,
	description,
	children,
	className,
	clampDescription = true,
}: {
	label: ReactNode
	description?: ReactNode
	children?: ReactNode
	className?: string
	clampDescription?: boolean
}) {
	return (
		<div className={cn('flex min-h-[52px] items-center justify-between gap-4 px-4 py-2.5', className)}>
			<RowLabel label={label} description={description} clamp={clampDescription} />
			{children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
		</div>
	)
}

/** A stacked row: label (+ description) on top, a full-width control below. */
export function SettingsField({
	label,
	description,
	children,
	footer,
	className,
}: {
	label?: ReactNode
	description?: ReactNode
	children: ReactNode
	footer?: ReactNode
	className?: string
}) {
	return (
		<div className={cn('space-y-2 px-4 py-3', className)}>
			{(label || description) && <RowLabel label={label} description={description} clamp={false} />}
			{children}
			{footer && <div className="text-end text-xs text-muted-foreground">{footer}</div>}
		</div>
	)
}

/** A quiet note inside a group (e.g. "supports up to 4 speakers"). */
export function SettingsNote({ children }: { children: ReactNode }) {
	return <p className="px-4 py-2.5 text-xs text-muted-foreground">{children}</p>
}

/** Whole-row clickable action: label on the left, small muted icon on the right. */
export function ActionRow({
	label,
	description,
	icon,
	onClick,
	destructive,
	disabled,
	className,
	activateOnClick,
}: {
	label: ReactNode
	description?: ReactNode
	icon?: ReactNode
	onClick?: () => void
	destructive?: boolean
	disabled?: boolean
	className?: string
	/** Use the click event instead of mousedown (for actions that open dialogs). */
	activateOnClick?: boolean
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onMouseDown={activateOnClick ? undefined : onClick}
			onClick={activateOnClick ? onClick : undefined}
			className={cn(
				'flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-start transition-colors',
				destructive ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-accent/45',
				'disabled:pointer-events-none disabled:opacity-50',
				className,
			)}>
			<RowLabel label={<span className="text-sm">{label}</span>} description={description} />
			{icon && <span className={cn('shrink-0', destructive ? 'text-destructive' : 'text-muted-foreground')}>{icon}</span>}
		</button>
	)
}

/** Small ghost icon button with a tooltip — for inline row actions. */
export function IconAction({
	label,
	icon,
	onClick,
	disabled,
	className,
	...props
}: {
	label: string
	icon: ReactNode
	onClick?: () => void
	disabled?: boolean
	className?: string
} & Omit<ComponentProps<typeof Button>, 'children' | 'onClick'>) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="iconSm"
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
					className={cn('h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground', className)}
					{...props}>
					{icon}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}
