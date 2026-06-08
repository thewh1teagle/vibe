import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreferenceProvider } from '~/providers/preference'

export default function Layout({ children }: { children: ReactNode }) {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()

	return (
		<div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
			<div className="flex flex-col px-6 pt-6 pb-4">
				<div className="flex items-center gap-3 mb-5">
					<div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
						<svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
							/>
						</svg>
					</div>
					<h1 className="text-lg font-semibold tracking-tight">{t('common.app-title')}</h1>
					<span
						className={`ml-auto inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${
							preference.transcriptionProvider === 'groq'
								? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
								: 'bg-green-500/10 text-green-500 border border-green-500/20'
						}`}>
						{preference.transcriptionProvider === 'groq' ? 'Groq Cloud' : 'Local'}
					</span>
				</div>
				{children}
			</div>
		</div>
	)
}
