import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'

interface ProgressPanelProps {
	isAborting: boolean
	onAbort: () => void
	progress: number | null
}

export default function ProgressPanel({ isAborting, onAbort, progress }: ProgressPanelProps) {
	const { t } = useTranslation()
	return (
		<div className="w-full flex flex-col items-center">
			<div className="flex flex-row items-center text-center gap-3 bg-muted p-4 rounded-2xl">
				<Spinner className="text-primary" />
				{isAborting ? (
					<p>{t('common.aborting')}...</p>
				) : (
					<p>
						{t('common.transcribing')} {progress ? `${Math.round(progress)}%` : '0%'}
					</p>
				)}
				{!isAborting && (
					<Button variant="ghost" size="sm" onClick={onAbort} className="text-destructive hover:text-destructive/80">
						{t('common.cancel')}
					</Button>
				)}
			</div>
		</div>
	)
}
