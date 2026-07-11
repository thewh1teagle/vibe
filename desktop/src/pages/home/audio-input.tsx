import { m } from '~/paraglide/messages.js'
import { ReactComponent as FileIcon } from '~/icons/file.svg'

interface AudioInputProps {
	onClick: () => void
	onSelectFolder: () => void
}

export default function AudioInput({ onClick, onSelectFolder }: AudioInputProps) {

	return (
		<div
			onClick={onClick}
			className="group flex min-h-[152px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border/90 bg-card/70 px-6 py-7 text-foreground/85 shadow-xs transition-colors hover:border-primary/55 hover:bg-card hover:text-foreground dark:border-border dark:bg-card/80 dark:text-foreground/90"
		>
			<div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/15">
				<FileIcon className="h-5 w-5 text-primary" />
			</div>
			<div className="space-y-1 text-center">
				<p className="text-sm font-semibold">{m.selectFile()}</p>
				<p className="text-xs text-muted-foreground">
					{m.supportsFormats({ defaultValue: 'Supports audio and video files' })}
				</p>
			</div>
			<button
				type="button"
				className="text-xs italic text-muted-foreground/70 underline decoration-dotted underline-offset-2 transition-colors hover:text-muted-foreground"
				onMouseDown={(event) => {
					event.stopPropagation()
					onSelectFolder()
				}}>
				{m.orSelectFolder({ defaultValue: 'or a whole folder' })}
			</button>
		</div>
	)
}
