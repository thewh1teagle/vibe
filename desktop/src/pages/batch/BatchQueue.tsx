import { NamedPath, openPath } from '~/lib/utils'
import { ReactComponent as CheckIcon } from '~/icons/check.svg'
import { Progress } from '~/components/ui/progress'

interface BatchQueueProps {
	files: NamedPath[]
	progress: number | null
	activeIndex: number
}

export default function BatchQueue({ files, activeIndex, progress }: BatchQueueProps) {
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/55 p-3">
			{files.map((file, index) => (
				<div key={file.path} className="flex flex-col gap-2 rounded-lg px-1 py-1">
					<div className="flex items-center justify-center gap-3">
						<div className="flex w-full min-w-0 flex-col justify-between gap-2">
							<div className="flex cursor-pointer justify-between gap-1 text-sm hover:text-primary/80" onClick={() => openPath(file)}>
								<span className="min-w-0 flex-1 truncate">{file.name}</span>
								{activeIndex > index && <CheckIcon className="h-5 w-5 stroke-success" />}
							</div>
							{progress && activeIndex === index ? <Progress value={progress} /> : null}
						</div>
					</div>
				</div>
			))}
		</div>
	)
}
