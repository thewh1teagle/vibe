import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as CancelIcon } from '~/icons/cancel.svg'
import { ReactComponent as ChevronUp } from '~/icons/chevron-down.svg'
import { ReactComponent as ChevronDown } from '~/icons/chevron-up.svg'
import { ReactComponent as PlayIcon } from '~/icons/play.svg'
import { NamedPath } from '~/lib/utils'
import BatchQueue from './BatchQueue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { Button } from '~/components/ui/button'

interface BatchPanelProps {
	files: NamedPath[]
	onStart: () => void
	onCancel: () => void
	progress: number | null
	index: number
	inProgress: boolean
	isAborting: boolean
	modelPath: string | null
}

export default function BatchPanel({ files, onStart, onCancel, progress, index, inProgress, isAborting, modelPath }: BatchPanelProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-muted/55 p-3 md:p-4">
				<div className="flex flex-col">
					{inProgress && (
						<span className="text-sm font-medium tracking-wide">
							{t('common.transcribing')} ({index + 1}/{files.length})
						</span>
					)}
					{!isAborting && !inProgress && index < files.length && (
						<span className="text-sm font-medium tracking-wide">
							{t('common.transcribe')} {files.length} {t('common.files')}
						</span>
					)}
					{!isAborting && !inProgress && index > files.length && (
						<span className="text-sm font-medium tracking-wide">
							{t('common.transcribed')} {files.length} {t('common.files')}
						</span>
					)}
					{isAborting && <span className="text-sm font-medium tracking-wide">{t('common.aborting')}...</span>}
				</div>
				<div className="ms-auto flex gap-2">
					<CollapsibleTrigger asChild>
						<Button variant="secondary" size="iconSm" className="rounded-full">
							{open ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
						</Button>
					</CollapsibleTrigger>
					<Button
						onClick={() => (inProgress ? onCancel() : onStart())}
						disabled={!inProgress && !modelPath}
						size="iconSm"
						className={inProgress ? 'rounded-full bg-destructive hover:bg-destructive/90' : 'rounded-full bg-success hover:bg-success/90'}>
						{inProgress ? (
							<CancelIcon className="h-5 w-5 stroke-destructive-foreground" />
						) : (
							<PlayIcon className="h-5 w-5 stroke-success-foreground stroke-2" />
						)}
					</Button>
				</div>
			</div>
			<CollapsibleContent className="max-w-[100%] overflow-hidden pt-3">
				<BatchQueue progress={progress} activeIndex={index} files={files} />
			</CollapsibleContent>
		</Collapsible>
	)
}
