import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export default function Layout({ children }: { children: ReactNode }) {
	const { t } = useTranslation()

	return (
		<div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
			<div className="flex-1 flex flex-col items-center justify-center px-8 py-10">
				<div className="mb-6 text-center">
					<div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-3">
						<svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
						</svg>
					</div>
					<h1 className="text-2xl font-semibold tracking-tight">{t('common.app-title')}</h1>
				</div>
				{children}
			</div>
		</div>
	)
}
