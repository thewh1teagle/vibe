import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export default function Layout({ children }: { children: ReactNode }) {
	const { t } = useTranslation()

	return (
		<div className="min-h-screen flex flex-col">
			<div className="app-shell flex-1 flex flex-col px-6 py-5">
				<div className="mb-5 border-b border-border/40 pb-3">
					<h1 className="text-xl font-semibold tracking-tight">{t('common.app-title')}</h1>
				</div>
				<div className="flex-1 flex items-center justify-center">
					{children}
				</div>
			</div>
		</div>
	)
}
