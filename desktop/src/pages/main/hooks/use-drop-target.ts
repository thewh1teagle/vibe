import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/**
 * Drag & drop for the whole window.
 *
 * The webview delivers real filesystem paths through `tauri://drag-drop`. In browser mock mode
 * those events never fire and the HTML5 `File` objects carry no path we could transcribe, so a
 * browser drop only explains that the mock dialog (Browse) is the way in.
 */
export function useDropTarget(onPaths: (paths: string[]) => void) {
	const [dragging, setDragging] = useState(false)
	const onPathsRef = useRef(onPaths)
	const browserDepth = useRef(0)

	useEffect(() => {
		onPathsRef.current = onPaths
	}, [onPaths])

	useEffect(() => {
		const unlisteners: Promise<UnlistenFn>[] = []
		unlisteners.push(listen('tauri://drag-enter', () => setDragging(true)))
		unlisteners.push(listen('tauri://drag-leave', () => setDragging(false)))
		unlisteners.push(
			listen<{ paths?: string[] }>('tauri://drag-drop', ({ payload }) => {
				setDragging(false)
				if (payload.paths?.length) onPathsRef.current(payload.paths)
			}),
		)

		function onDragEnter(event: DragEvent) {
			event.preventDefault()
			browserDepth.current += 1
			setDragging(true)
		}
		function onDragOver(event: DragEvent) {
			event.preventDefault()
		}
		function onDragLeave(event: DragEvent) {
			event.preventDefault()
			browserDepth.current = Math.max(0, browserDepth.current - 1)
			if (browserDepth.current === 0) setDragging(false)
		}
		function onDrop(event: DragEvent) {
			event.preventDefault()
			browserDepth.current = 0
			setDragging(false)
			const files = Array.from(event.dataTransfer?.files ?? [])
			// Only reachable in a plain browser — the webview swallows HTML drops.
			if (files.length > 0) {
				toast.info(`Browser preview can't read “${files[0].name}” from disk. Use Browse to pick a file.`, { position: 'bottom-center' })
			}
		}

		window.addEventListener('dragenter', onDragEnter)
		window.addEventListener('dragover', onDragOver)
		window.addEventListener('dragleave', onDragLeave)
		window.addEventListener('drop', onDrop)

		return () => {
			unlisteners.forEach((promise) => promise.then((unlisten) => unlisten()))
			window.removeEventListener('dragenter', onDragEnter)
			window.removeEventListener('dragover', onDragOver)
			window.removeEventListener('dragleave', onDragLeave)
			window.removeEventListener('drop', onDrop)
		}
	}, [])

	return dragging
}
