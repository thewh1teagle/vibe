import { ReactNode, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UpdaterContext } from '~/providers/Updater'
import AppMenu from './AppMenu'
import DropModal from './DropModal'
import SettingsModal from './SettingsModal'
import Toast from './Toast'

export default function Layout({ children }: { children: ReactNode }) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const { updateApp, availableUpdate } = useContext(UpdaterContext)
	const { t } = useTranslation()

	return (
		<div className="flex flex-col pb-[80px]">
			<Toast />
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} />}
			<DropModal />

			<div className="flex flex-col m-auto w-full mt-10">
				<div className="relative text-center">
					<div className="relative w-[300px] m-auto">
						<AppMenu onClickSettings={() => setSettingsVisible(true)} availableUpdate={availableUpdate} updateApp={updateApp} />
					</div>
					<h1 className="text-center text-4xl mb-2 text-base-content font-normal">{t('common.app-title')}</h1>
				</div>
				{children}
			</div>
		</div>
	)
}
