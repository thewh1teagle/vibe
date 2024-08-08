import { useTranslation } from 'react-i18next'
import { Segment, formatTimestamp } from '~/lib/transcript'
import { NamedPath, formatSpeaker } from '~/lib/utils'
import { Preference } from '~/providers/Preference'

interface HTMLViewProps {
	segments: Segment[]
	file: NamedPath
	preference: Preference
}

function formatDuration(start: number, stop: number) {
	const startFmt = formatTimestamp(start, false, '', false)
	const stopFmt = formatTimestamp(stop, false, '', false)
	return `${startFmt} --> ${stopFmt}`
}

export default function HTMLView({ segments, file, preference }: HTMLViewProps) {
	const { t } = useTranslation()
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
						<div
							className="timestamp"
							style={{ fontSize: '12px', paddingBottom: '6px', color: preference.theme === 'dark' ? '#3B4045' : '#000000' }}>
							{formatDuration(segment.start, segment.stop)}
						</div>
						{segment.speaker ? formatSpeaker(segment.speaker, t('common.speaker-prefix')) : ''}
						{segment.speaker && <br />}
						{segment.text}
					</div>
				</div>
			))}
		</div>
	)
}
