import { Segment, formatTimestamp } from '~/lib/transcript'
import { NamedPath } from '~/lib/utils'
import { Preference } from '~/providers/Preference'

interface HTMLViewProps {
	segments: Segment[]
	file: NamedPath
	preference: Preference
}

export function formatDuration(start: number, stop: number, direction: 'rtl' | 'ltr' = 'ltr') {
	const startFmt = formatTimestamp(start, false, '', false)
	const stopFmt = formatTimestamp(stop, false, '', false)
	const duration = `${startFmt} --> ${stopFmt}`

	if (direction === 'rtl') {
		return `\u202B${duration}\u202C` // Use Unicode characters for right-to-left embedding
	}
	return duration
}

export default function HTMLView({ segments, file, preference }: HTMLViewProps) {
	return (
		<div
			autoCorrect="off"
			contentEditable={true}
			dir={preference.textAreaDirection}
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
				{file?.name}
			</h1>
			{segments.map((segment) => (
				<div key={segment.text} className="segment" style={{ fontSize: '18px', display: 'flex', flexDirection: 'column', paddingTop: '18px' }}>
					<div style={{ marginBottom: '10px' }}>
						<div className="timestamp" style={{ fontSize: '13px', paddingBottom: '6px', opacity: 0.7 }}>
							{formatDuration(segment.start, segment.stop)}
						</div>
						{segment.text}
					</div>
				</div>
			))}
		</div>
	)
}
