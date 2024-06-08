import { ModifyState, cx } from '~/lib/utils'
import SettingsPage from '~/pages/settings/Page'

interface SettingsModalProps {
	visible: boolean
	setVisible: ModifyState<boolean>
}
export default function SettingsModal({ visible, setVisible }: SettingsModalProps) {
	if (visible) {
		return (
			<div className={cx('modal modal-open backdrop-blur-3xl !bg-base-100 dark:!bg-transparent overflow-y-auto')}>
				<SettingsPage setVisible={setVisible} />
			</div>
		)
	}
}
