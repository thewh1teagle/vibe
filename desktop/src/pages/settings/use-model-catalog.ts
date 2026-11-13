import { useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { ANY_LANGUAGE, catalogLanguages, defaultCatalogLanguage, groupForLanguage, installedFilename, supportedModels, type CatalogModel } from '~/lib/model-catalog'
import { bundledCatalog, fetchCatalog } from '~/lib/model-catalog-source'
import { cancelInstall, installCatalogModel, useInstallCompleted, useInstallState } from '~/lib/model-install'
import { ErrorModalContext } from '~/providers/error-modal'
import type { SettingsViewModel } from './sections/shared'

export function useModelCatalog(vm: SettingsViewModel) {
	const [catalog, setCatalog] = useState(bundledCatalog)
	const [chosenLanguage, setLanguage] = useState<string | null>(null)
	const installState = useInstallState()
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const { preference } = vm

	useEffect(() => {
		let stale = false
		fetchCatalog().then((live) => {
			if (live && !stale) setCatalog(live)
		})
		return () => {
			stale = true
		}
	}, [])

	useInstallCompleted(() => vm.loadModels())

	const languages = useMemo(() => catalogLanguages(catalog.models), [catalog])
	const language =
		chosenLanguage && (chosenLanguage === ANY_LANGUAGE || languages.includes(chosenLanguage))
			? chosenLanguage
			: defaultCatalogLanguage(preference.modelOptions.lang, preference.displayLanguage, catalog.models)

	const supported = useMemo(() => supportedModels(catalog.models, vm.appVersionNumber), [catalog, vm.appVersionNumber])
	const view = useMemo(() => groupForLanguage(supported, language), [supported, language])

	/** Where a catalog model lives on disk, and whether it is the one transcribing right now. */
	function installed(model: CatalogModel): { path: string; inUse: boolean } | null {
		const filename = installedFilename(
			supported,
			model,
			vm.models.map((file) => file.name),
		)
		const file = vm.models.find((entry) => entry.name === filename)
		return file ? { path: file.path, inUse: file.path === preference.modelPath } : null
	}

	async function install(model: CatalogModel) {
		try {
			const result = await installCatalogModel(model)
			if (result.status === 'offline') toast.error(m.noConnection())
			if (result.status !== 'installed') return
			preference.setModelDisplayNames((names) => ({ ...names, [result.path]: model.name }))
			await vm.loadModels()
			await vm.selectModel(result.path)
			toast.success(m.modelCatalogInstalledToast({ name: model.name }))
		} catch (error) {
			console.error('[models] install failed:', error)
			setErrorModal?.({ open: true, log: String(error) })
		}
	}

	return { language, setLanguage, languages, view, installed, use: vm.selectModel, install, cancel: cancelInstall, active: installState.active, unverified: installState.unverified }
}

export type ModelCatalogViewModel = ReturnType<typeof useModelCatalog>
