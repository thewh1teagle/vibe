import { path } from '@tauri-apps/api'
import * as shell from '@tauri-apps/plugin-shell'
import * as app from '@tauri-apps/api/app'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorage } from 'usehooks-ts'
import { Path, getAppInfo, getIssueUrl, ls, resetApp } from '../../lib/utils'
import * as config from '../../lib/config'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'

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

export function useSettingsViewmodel() {
    const { i18n } = useTranslation()
    const [_, setDirection] = useLocalStorage<'ltr' | 'rtl'>('direction', i18n.dir())
    const [language, setLanguage] = useLocalStorage('display_language', i18n.language)
    const [modelPath, setModelPath] = useLocalStorage<null | string>('model_path', null)
    const [models, setModels] = useState<Path[]>([])
    const [appVersion, setAppVersion] = useState('')
    const [soundOnFinish, setSoundOnFinish] = useLocalStorage('sound_on_finish', true)
    const [focusOnFinish, setFocusOnFinish] = useLocalStorage('focus_on_finish', true)
    const { t } = useTranslation()

    async function askAndReset() {
        const yes = await ask(t('reset-ask-dialog'), { kind: "info" })
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
        await i18n.changeLanguage(language)
        setDirection(i18n.dir())
    }

    useEffect(() => {
        changeLanguage()
    }, [language])

    useEffect(() => {
        loadMeta()
        loadModels()
        getDefaultModel()
    }, [])

    return {
        askAndReset,
        setLanguage,
        setModelPath,
        openModelPath,
        openModelsUrl,
        openLogsFolder,
        modelPath: modelPath ?? '',
        models,
        appVersion,
        reportIssue,
        loadModels,
        soundOnFinish,
        setSoundOnFinish,
        focusOnFinish,
        setFocusOnFinish,
    }
}
