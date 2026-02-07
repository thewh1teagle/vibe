import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactComponent as CancelIcon } from '~/icons/cancel.svg'
import { ReactComponent as ChevronUp } from '~/icons/chevron-down.svg'
import { ReactComponent as ChevronDown } from '~/icons/chevron-up.svg'
import { ReactComponent as PlayIcon } from '~/icons/play.svg'
import { NamedPath } from '~/lib/utils'
import BatchQueue from './BatchQueue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'

interface BatchPanelProps {
	files: NamedPath[]
	onStart: () => void
	onCancel: () => void
	progress: number | null
	index: number
	inProgress: boolean
	isAborting: boolean
}

export default function BatchPanel({ files, onStart, onCancel, progress, index, inProgress, isAborting }: BatchPanelProps) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div className="border border-border bg-muted rounded-lg p-3 flex flex-row items-center">
				<div className="flex flex-col ms-4">
					{inProgress && (
						<span className="text-sm font-light tracking-wider">
							{t('common.transcribing')} ({index + 1}/{files.length})
						</span>
					)}
					{!isAborting && !inProgress && index < files.length && (
						<span className="text-sm font-light tracking-wider">
							{t('common.transcribe')} {files.length} {t('common.files')}
						</span>
					)}
					{!isAborting && !inProgress && index > files.length && (
						<span className="text-sm font-light tracking-wider">
							{t('common.transcribed')} {files.length} {t('common.files')}
						</span>
					)}
					{isAborting && <span className="text-sm font-light tracking-wider">{t('common.aborting')}...</span>}
				</div>
				<div className="ms-auto flex gap-3">
					<CollapsibleTrigger asChild>
						<div className="cursor-pointer p-2 bg-secondary rounded-full">
							{open ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
						</div>
					</CollapsibleTrigger>
					<div
						onClick={() => (inProgress ? onCancel() : onStart())}
						className={inProgress ? 'cursor-pointer p-2 rounded-full bg-destructive' : 'cursor-pointer p-2 rounded-full bg-success'}>
						{inProgress ? (
							<CancelIcon className="h-5 w-5 stroke-destructive-foreground" />
						) : (
							<PlayIcon className="h-5 w-5 stroke-success-foreground stroke-2" />
						)}
					</div>
				</div>
			</div>
			<CollapsibleContent className="max-w-[100%] overflow-hidden pt-3">
				<BatchQueue progress={progress} activeIndex={index} files={files} />
			</CollapsibleContent>
		</Collapsible>
	)
}
