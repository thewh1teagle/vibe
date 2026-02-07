import { ModifyState } from '~/lib/utils'
import SettingsPage from '~/pages/settings/Page'

interface SettingsModalProps {
	visible: boolean
	setVisible: ModifyState<boolean>
}

export default function SettingsModal({ visible, setVisible }: SettingsModalProps) {
	if (!visible) return null

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 backdrop-blur-xl">
			<SettingsPage setVisible={setVisible} />
		</div>
	)
}
