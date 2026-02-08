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
		<div className="flex w-full flex-col items-center">
			<div className="flex w-full flex-wrap items-center justify-center gap-3 rounded-md border border-border/60 bg-card/45 px-3 py-2.5 text-center">
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
