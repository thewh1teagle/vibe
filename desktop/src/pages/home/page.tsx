import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { webviewWindow } from '@tauri-apps/api'
import Layout from '~/components/layout'
import DictationDialog from '~/components/dictation-dialog'
import LanguageInput from '~/components/language-input'
import ModelOptions from '~/components/params'
import { viewModel } from './view-model'

export default function Home() {
	const { t } = useTranslation()
	const vm = viewModel()

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
			<div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
				<div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col items-center gap-5">
					<div className="w-full min-w-0 space-y-4">
						<LanguageInput />

						{!vm.preference.modelPath && (
							<p className="text-center text-sm text-muted-foreground">{t('common.no-model-selected')}</p>
						)}

						<DictationDialog />

						<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />
					</div>
				</div>
			</div>
		</Layout>
	)
}
