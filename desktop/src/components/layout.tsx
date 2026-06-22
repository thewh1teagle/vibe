import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreferenceProvider } from '~/providers/preference'
import { Logo } from '~/components/logo'

export default function Layout({ children }: { children: ReactNode }) {
	const { t } = useTranslation()
	const preference = usePreferenceProvider()

	return (
		<div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
			<div className="flex flex-col px-6 pt-6 pb-4">
				<div className="flex items-center gap-3 mb-5">
					<Logo size={40} />
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
