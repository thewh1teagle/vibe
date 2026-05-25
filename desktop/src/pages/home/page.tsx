import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { webviewWindow } from '@tauri-apps/api'
import { Settings2 } from 'lucide-react'
import Layout from '~/components/layout'
import DictationDialog from '~/components/dictation-dialog'
import LanguageInput from '~/components/language-input'
import ModelOptions from '~/components/params'
import SettingsModal from '~/components/settings-modal'
import { Button } from '~/components/ui/button'
import { viewModel } from './view-model'

export default function Home() {
	const { t } = useTranslation()
	const vm = viewModel()
	const [settingsOpen, setSettingsOpen] = useState(false)

	async function showWindow() {
		const currentWindow = webviewWindow.getCurrentWebviewWindow()
		await currentWindow.show()
		if (import.meta.env.PROD) await currentWindow.setFocus()
	}

	useEffect(() => {
		showWindow()
	}, [])

	return (
		<Layout>
			<SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
			<div className="mx-auto flex w-full min-w-0 max-w-xl flex-col gap-2">
				{!vm.preference.modelPath && (
					<p className="text-center text-sm text-muted-foreground">{t('common.no-model-selected')}</p>
				)}
				<div className="flex items-center gap-2">
					<div className="flex-1">
						<LanguageInput />
					</div>
					<div className="flex items-center gap-0">
						<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
						<Button
							variant="ghost"
							className="h-9 w-9 rounded-md border border-border/65 text-muted-foreground hover:bg-accent/45 hover:text-foreground"
							aria-label={t('common.settings')}
							onClick={() => setSettingsOpen(true)}>
							<Settings2 className="h-4 w-4" />
						</Button>
					</div>
				</div>
				<DictationDialog />
			</div>
		</Layout>
	)
}
