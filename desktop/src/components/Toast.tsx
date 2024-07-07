import { useToastProvider } from '~/providers/Toast'

export default function Toast() {
	const { message, open, progress } = useToastProvider()

	if (!open) {
		return null
	}
	return (
		<div className="toast z-10">
			<div className="alert bg-base-300 flex flex-col">
				<span>{message}</span>
				{progress != null ? <progress className="progress progress-primary w-56" value={progress} max="100" /> : null}
			</div>
		</div>
	)
}
