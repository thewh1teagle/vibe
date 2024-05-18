import { NamedPath } from '~/lib/utils'
import BatchQueueItem from './BatchQueueItem'

interface BatchQueueProps {
	files: NamedPath[]
	progress: number | null
	index: number
}

export default function BatchQueue({ files, index, progress }: BatchQueueProps) {
	console.log('index ', index)
	return (
		<div className="flex flex-col gap-3">
			{files.map((file, loopIndex) => (
				<BatchQueueItem key={file.path} file={file} onCancel={() => {}} progress={loopIndex === index ? progress : loopIndex < index ? 100 : null} />
			))}
		</div>
	)
}
