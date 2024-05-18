import { path } from '@tauri-apps/api'
import * as app from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import * as shell from '@tauri-apps/plugin-shell'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'usehooks-ts'
import * as config from '~/lib/config'
import { supportedLanguages } from '~/lib/i18n'
import { NamedPath, getAppInfo, getIssueUrl, ls, resetApp } from '~/lib/utils'

async function openModelPath() {
	const dst = await path.appLocalDataDir()
	shell.open(dst)
}

async function openModelsUrl() {
	shell.open(config.modelsURL)
}

async function reportIssue() {
	try {
		const info = await getAppInfo()
		shell.open(await getIssueUrl(info))
	} catch (e) {
		console.error(e)
		shell.open(await getIssueUrl(`Couldn't get info ${e}`))
	}
}

async function openLogsFolder() {
	const dst = await path.appConfigDir()
	shell.open(dst)
}

export function viewModel() {
	const { i18n } = useTranslation()
	const [_direction, setDirection] = useLocalStorage<'ltr' | 'rtl'>('direction', i18n.dir())

	const [modelPath, setModelPath] = useLocalStorage<null | string>('model_path', null)
	const [models, setModels] = useState<NamedPath[]>([])
	const [appVersion, setAppVersion] = useState('')
	const [_, setTranscribeLang] = useLocalStorage('transcribe_lang_code', 'en')
	const [prefsLanguage, prefsSetLanguage] = useLocalStorage('prefs_display_language', i18n.language)
	const [prefsSoundOnFinish, setPrefsSoundOnFinish] = useLocalStorage('prefs_sound_on_finish', true)
	const [prefsFocusOnFinish, setPrefsFocusOnFinish] = useLocalStorage('prefs_focus_on_finish', true)
	const { t } = useTranslation()

	async function askAndReset() {
		const yes = await ask(t('common.reset-ask-dialog'), { kind: 'info' })
		if (yes) {
			resetApp()
		}
	}

	async function loadMeta() {
		try {
			const name = await app.getName()
			const ver = await app.getVersion()
			setAppVersion(`${name} ${ver}`)
		} catch (e) {
			console.error(e)
		}
	}

	async function loadModels() {
		const configPath = await path.appLocalDataDir()
		const entries = await ls(configPath)
		const found = entries.filter((e) => e.name?.endsWith('.bin'))
		setModels(found)
	}

	async function getDefaultModel() {
		if (!modelPath) {
			const defaultModelPath = await invoke('get_default_model_path')
			setModelPath(defaultModelPath as string)
		}
	}

	async function changeLanguage() {
		await i18n.changeLanguage(prefsLanguage)
		setDirection(i18n.dir())
		const name = supportedLanguages[prefsLanguage]
		setTranscribeLang(name)
	}

	useEffect(() => {
		changeLanguage()
	}, [prefsLanguage])

	useEffect(() => {
		loadMeta()
		loadModels()
		getDefaultModel()
	}, [])

	return {
		setTranscribeLang,
		askAndReset,
		prefsSetLanguage,
		setModelPath,
		openModelPath,
		openModelsUrl,
		openLogsFolder,
		modelPath: modelPath ?? '',
		models,
		appVersion,
		reportIssue,
		loadModels,
		prefsSoundOnFinish,
		setPrefsSoundOnFinish,
		prefsFocusOnFinish,
		setPrefsFocusOnFinish,
	}
}
