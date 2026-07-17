import type { ReactNode } from 'react'
import { Label } from '~/components/ui/label'
import type { viewModel } from '../view-model'

export type SettingsViewModel = ReturnType<typeof viewModel>

export function SectionCard({ title, children }: { title?: ReactNode; children: ReactNode }) {
	return (
		<div className="rounded-2xl border border-border/60 bg-card/92 text-card-foreground shadow-xs">
			{title && (
				<div className="border-b border-border/45 px-5 py-3">
					<h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
				</div>
			)}
			<div className="p-5">{children}</div>
		</div>
	)
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="w-full space-y-2">
			<Label className="flex items-center gap-1">{label}</Label>
			{children}
		</div>
	)
}

export function SegmentedControl<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T
	options: { value: T; label: ReactNode }[]
	onChange: (value: T) => void
}) {
	return (
		<div className="flex gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
						value === option.value
							? 'bg-card text-primary shadow-xs'
							: 'text-muted-foreground hover:text-foreground'
					}`}>
					{option.label}
				</button>
			))}
		</div>
	)
}
