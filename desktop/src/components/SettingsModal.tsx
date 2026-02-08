import { useEffect } from 'react'
import { ModifyState } from '~/lib/utils'
import SettingsPage from '~/pages/settings/Page'

interface SettingsModalProps {
	visible: boolean
	setVisible: ModifyState<boolean>
}

export default function SettingsModal({ visible, setVisible }: SettingsModalProps) {
	useEffect(() => {
		if (!visible) return

		const prevBodyOverflow = document.body.style.overflow
		const prevHtmlOverflow = document.documentElement.style.overflow
		document.body.style.overflow = 'hidden'
		document.documentElement.style.overflow = 'hidden'

		return () => {
			document.body.style.overflow = prevBodyOverflow
			document.documentElement.style.overflow = prevHtmlOverflow
		}
	}, [visible])

	if (!visible) return null

	return (
		<div className="fixed inset-0 z-50 overflow-hidden bg-background/70 backdrop-blur-2xl">
			<div className="h-full overflow-y-auto overscroll-contain">
				<SettingsPage setVisible={setVisible} />
			</div>
		</div>
	)
}
