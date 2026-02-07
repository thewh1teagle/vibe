import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/button'

interface AudioInputProps {
	onClick: () => void
}

export default function AudioInput({ onClick }: AudioInputProps) {
	const { t } = useTranslation()

	return (
		<div className="flex items-center w-full justify-center">
			<Button onMouseDown={onClick} className="w-full">
				{t('common.select-file')}
			</Button>
		</div>
	)
}
