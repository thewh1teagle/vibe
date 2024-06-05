import { useTranslation } from 'react-i18next'

interface AudioInputProps {
	onClick: () => void
}

export default function AudioInput({ onClick }: AudioInputProps) {
	const { t } = useTranslation()

	return (
		<div className="flex items-center w-full justify-center">
			<button onMouseDown={onClick} className="btn btn-primary w-full">
				{t('common.select-file')}
			</button>
		</div>
	)
}
