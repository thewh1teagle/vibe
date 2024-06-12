import { path } from '@tauri-apps/api'
import * as app from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import * as shell from '@tauri-apps/plugin-shell'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as config from '~/lib/config'
import { supportedLanguages } from '~/lib/i18n'
import { NamedPath, getAppInfo, getIssueUrl, ls, resetApp } from '~/lib/utils'
import { usePreferencesContext } from '~/providers/Preferences'
import WhisperLanguages from '~/assets/whisper-languages.json'
import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'

async function openModelPath() {
	const dst = await path.appLocalDataDir()
	invoke('open_path', { path: dst })
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
	invoke('open_path', { path: dst })
}

export function viewModel() {
	const { i18n } = useTranslation()

	const [models, setModels] = useState<NamedPath[]>([])
	const [appVersion, setAppVersion] = useState('')
	const preferences = usePreferencesContext()
	const { t } = useTranslation()
	const listenersRef = useRef<UnlistenFn[]>([])
	const isMountedRef = useRef<boolean>(false)
	const [downloadURL, setDownloadURL] = useState('')
	const navigate = useNavigate()

	async function askAndReset() {
		const yes = await ask(t('common.reset-ask-dialog'), { kind: 'info' })
		if (yes) {
			resetApp()
		}
	}

	async function downloadModel() {
		if (!downloadURL) {
			return
		}
		navigate('/setup', { state: { downloadURL } })
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
		if (!preferences.modelPath) {
			const defaultModelPath = await invoke('get_default_model_path')
			preferences!.setModelPath(defaultModelPath as string)
		}
	}

	async function changeLanguage() {
		await i18n.changeLanguage(preferences.displayLanguage)
		const name = supportedLanguages[preferences.displayLanguage]
		if (name) {
			preferences.setModelOptions({ ...preferences.modelOptions, lang: WhisperLanguages[name as keyof typeof WhisperLanguages] })
			preferences.setTextAreaDirection(i18n.dir())
		}
	}
	async function onWindowFocus() {
		listenersRef.current.push(await listen('tauri://focus', loadModels))
	}
	useEffect(() => {
		if (!isMountedRef.current) {
			isMountedRef.current = true
			return
		}
		changeLanguage()
	}, [preferences.displayLanguage])

	useEffect(() => {
		loadMeta()
		loadModels()
		getDefaultModel()
		onWindowFocus()
		return () => {
			listenersRef.current.forEach((unlisten) => unlisten())
		}
	}, [])

	return {
		downloadModel,
		downloadURL,
		setDownloadURL,
		preferences,
		askAndReset,
		openModelPath,
		openModelsUrl,
		openLogsFolder,
		models,
		appVersion,
		reportIssue,
		loadModels,
	}
}
