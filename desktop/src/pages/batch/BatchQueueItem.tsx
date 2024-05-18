import { ReactComponent as CheckIcon } from '~/icons/check.svg'
import { NamedPath, openPathParent } from '~/lib/utils'
interface BatchQueueItemProps {
	progress: number | null
	file: NamedPath
	onCancel: () => void
}
export default function BatchQueueItem({ file, progress }: BatchQueueItemProps) {
	console.log('filename => ', file.name)
	return (
		<div key={file.path} className="flex flex-col gap-2">
			<div className="flex justify-center items-center gap-3">
				<div className="flex flex-col justify-between w-full gap-2">
					<div className="cursor-pointer flex gap-1 justify-between link link-hover" onClick={() => openPathParent(file)}>
						{file.name} {progress === 100 && <CheckIcon className="h-5 w-5 stroke-success" />}
					</div>
					{progress && progress !== 100 ? <progress className="progress progress-primary" value={progress} /> : null}
				</div>
			</div>
		</div>
	)
}
