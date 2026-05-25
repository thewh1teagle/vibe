import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export default function Layout({ children }: { children: ReactNode }) {
	const { t } = useTranslation()

	return (
		<div className="min-h-screen">
			<div className="app-shell px-4 py-3">
				<div className="mb-2 text-sm font-medium text-muted-foreground/60">{t('common.app-title')}</div>
				{children}
			</div>
		</div>
	)
}
