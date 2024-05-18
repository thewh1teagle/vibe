import { useTranslation } from 'react-i18next'

interface ProgressPanelProps {
	isAborting: boolean
	onAbort: () => void
	progress: number | null
}

export default function ProgressPanel({ isAborting, onAbort, progress }: ProgressPanelProps) {
	const { t } = useTranslation()
	return (
		<div className="w-full flex flex-col items-center">
			<div className="flex flex-row items-center text-center gap-3 bg-base-200 p-4 rounded-2xl">
				<span className="loading loading-spinner text-primary"></span>
				{isAborting ? (
					<p>{t('common.aborting')}...</p>
				) : (
					<p>
						{t('common.transcribing')} {progress ? `${Math.round(progress)}%` : '0%'}
					</p>
				)}
				{!isAborting && (
					<button onClick={onAbort} className="btn btn-primary btn-ghost btn-sm text-red-500">
						{t('common.cancel')}
					</button>
				)}
			</div>
		</div>
	)
}
