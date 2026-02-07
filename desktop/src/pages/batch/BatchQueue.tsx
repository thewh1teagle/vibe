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
		<div className="flex flex-col gap-3">
			{files.map((file, index) => (
				<div key={file.path} className="flex flex-col gap-2">
					<div className="flex justify-center items-center gap-3">
						<div className="flex flex-col justify-between w-full gap-2">
							<div className="cursor-pointer flex gap-1 justify-between underline hover:text-primary/80" onClick={() => openPath(file)}>
								<span className="max-w-[80%] overflow-hidden text-ellipsis">{file.name}</span>
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
