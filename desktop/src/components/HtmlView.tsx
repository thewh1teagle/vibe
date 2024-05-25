import { Segment } from '~/lib/transcript'
import { NamedPath } from '~/lib/utils'
import { Preferences } from '~/providers/Preferences'
import '@formatjs/intl-durationformat/polyfill'

export function formatTimestamp(start: number, stop: number): string {
	if (start < 0 || stop < 0) {
		throw new Error('Non-negative timestamps expected')
	}

	const durationInSeconds = stop - start

	const duration = {
		hours: Math.floor(durationInSeconds / 3600),
		minutes: Math.floor((durationInSeconds % 3600) / 60),
		seconds: durationInSeconds % 60,
	}

	return new (Intl as any).DurationFormat('en', { style: 'digital' }).format(duration)
}

interface HTMLViewProps {
	segments: Segment[]
	file: NamedPath
	preferences: Preferences
}
export default function HTMLView({ segments, file, preferences }: HTMLViewProps) {
	return (
		<div
			autoCorrect="off"
			contentEditable={true}
			dir={preferences.textAreaDirection}
			className="html printable"
			style={{ padding: '22px', minHeight: '90vh', fontFamily: 'Roboto, Arial', maxWidth: '1000px', margin: 'auto', outline: 'none' }}>
			<h1
				style={{
					fontSize: '36px',
					textAlign: 'center',
					color: '#1565c0',
					maxWidth: '50vw',
					margin: 'auto',
					whiteSpace: 'nowrap',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
				}}>
				{file.name}
			</h1>
			{segments.map((segment) => (
				<div className="segment" style={{ fontSize: '18px', display: 'flex', flexDirection: 'column', paddingTop: '18px' }}>
					<div style={{ marginBottom: '10px' }}>
						<div
							className="timestamp"
							style={{ fontSize: '12px', paddingBottom: '6px', color: preferences.theme === 'dark' ? '#3B4045' : '#000000' }}>
							{formatTimestamp(segment.start, segment.stop)}
						</div>
						{segment.text}
					</div>
				</div>
			))}
		</div>
	)
}
