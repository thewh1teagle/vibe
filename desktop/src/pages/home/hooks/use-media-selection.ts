import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { basename } from '@tauri-apps/api/path'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as config from '~/lib/config'
import type { NamedPath } from '~/lib/types'
import { useFilesContext } from '~/providers/files-provider'
import { usePreferenceProvider } from '~/providers/preference'

export function useMediaSelection() {
	const location = useLocation()
	const navigate = useNavigate()
	const preference = usePreferenceProvider()
	const { files, setFiles } = useFilesContext()
	const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
	const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
	const [isCollectingFolder, setIsCollectingFolder] = useState(false)

	useEffect(() => {
		setFiles([])
		setSelectedFolder(null)
		if (files.length !== 1) setAudio(null)
	}, [location])

	useEffect(() => {
		if (selectedFolder) setAudio(null)
		else if (files.length === 1) setAudio(new Audio(convertFileSrc(files[0].path)))
	}, [files, selectedFolder])

	async function selectFiles() {
		const selected = await dialog.open({ multiple: true, filters: [{ name: 'Audio or Video files', extensions: [...config.audioExtensions, ...config.videoExtensions] }] })
		if (!selected) return
		setSelectedFolder(null)
		const newFiles: NamedPath[] = []
		for (const filePath of selected) newFiles.push({ path: filePath, name: await basename(filePath) })
		setFiles(newFiles)
		if (newFiles.length > 1) navigate('/batch', { state: { files: newFiles.map((file) => file.path) } })
	}

	async function loadFolderFiles(folder: string, recursive: boolean) {
		setIsCollectingFolder(true)
		try {
			const paths = await invoke<string[]>('glob_files', { folder, patterns: [...config.audioExtensions, ...config.videoExtensions], recursive })
			const newFiles: NamedPath[] = []
			for (const filePath of paths) newFiles.push({ path: filePath, name: await basename(filePath) })
			setFiles(newFiles)
		} finally {
			setIsCollectingFolder(false)
		}
	}

	async function selectFolder() {
		const folder = await dialog.open({ multiple: false, directory: true })
		if (!folder || Array.isArray(folder)) return
		setSelectedFolder(folder)
		await loadFolderFiles(folder, preference.advancedTranscribeOptions.includeSubFolders)
	}

	function startFolderBatch() {
		if (selectedFolder && files.length) navigate('/batch', { state: { files: files.map((file) => file.path), outputFolder: selectedFolder } })
	}

	function clearFolderSelection() {
		setSelectedFolder(null); setFiles([]); setAudio(null)
	}

	useEffect(() => {
		if (selectedFolder) loadFolderFiles(selectedFolder, preference.advancedTranscribeOptions.includeSubFolders)
	}, [selectedFolder, preference.advancedTranscribeOptions.includeSubFolders])

	return { files, setFiles, audio, setAudio, selectedFolder, setSelectedFolder, isCollectingFolder, selectFiles, selectFolder, startFolderBatch, clearFolderSelection }
}
