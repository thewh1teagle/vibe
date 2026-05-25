import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export default function Layout({ children }: { children: ReactNode }) {
	const { t } = useTranslation()

	return (
		<div className="min-h-screen">
			<div className="app-shell">
				<div className="stagger-in mb-4 flex items-center justify-between gap-4 border-b border-border/55 pb-3">
					<h1 className="app-title">{t('common.app-title')}</h1>
					<div />
				</div>
				<div className="stagger-in [animation-delay:120ms]">{children}</div>
			</div>
		</div>
	)
}
