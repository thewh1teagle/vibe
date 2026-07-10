import type { ReactNode } from 'react'
import { Label } from '~/components/ui/label'
import type { viewModel } from '../view-model'

export type SettingsViewModel = ReturnType<typeof viewModel>

export function SectionCard({ children }: { children: ReactNode }) {
	return <div className="rounded-2xl border border-border/60 bg-card/92 p-5 text-card-foreground shadow-xs">{children}</div>
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="w-full space-y-2">
			<Label className="flex items-center gap-1">{label}</Label>
			{children}
		</div>
	)
}
