import { ModifyState, cx } from '~/lib/utils'
import SettingsPage from '~/pages/settings/Page'
import * as os from '@tauri-apps/plugin-os'

interface SettingsModalProps {
	visible: boolean
	setVisible: ModifyState<boolean>
}
export default function SettingsModal({ visible, setVisible }: SettingsModalProps) {
	if (visible) {
		return (
			// Don't use transparent background on Linux since the backdrop doesn't work!
			<div className={cx('modal modal-open backdrop-blur-3xl !bg-base-100 overflow-y-auto', os.platform() != 'linux' && 'dark:!bg-transparent')}>
				<SettingsPage setVisible={setVisible} />
			</div>
		)
	}
}
