import { useTranslation } from 'react-i18next'
import { ReactComponent as FileIcon } from '~/icons/file.svg'
import { Button } from '~/components/ui/button'

interface AudioInputProps {
	onClick: () => void
	onSelectFolder: () => void
}

export default function AudioInput({ onClick, onSelectFolder }: AudioInputProps) {
	const { t } = useTranslation()

	return (
		<div
			onClick={onClick}
			className="group flex min-h-[148px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/90 bg-card/70 px-6 py-6 text-foreground/85 shadow-xs transition-colors hover:border-primary/55 hover:bg-card hover:text-foreground dark:border-border dark:bg-card/80 dark:text-foreground/90"
		>
			<FileIcon className="h-7 w-7 text-primary/85 transition-colors group-hover:text-primary" />
			<div className="space-y-1 text-center">
				<p className="text-sm font-semibold">{t('common.select-file')}</p>
				<p className="text-xs text-muted-foreground">
					{t('common.supports-formats', { defaultValue: 'Supports audio and video files' })}
				</p>
				<Button
					type="button"
					variant="link"
					size="sm"
					className="h-auto px-0 text-xs"
					onMouseDown={(event) => {
						event.stopPropagation()
						onSelectFolder()
					}}>
					{t('common.select-folder')}
				</Button>
			</div>
		</div>
	)
}
