import * as event from '@tauri-apps/api/event'
import { basename } from '@tauri-apps/api/path'
import * as webview from '@tauri-apps/api/webview'
import * as os from '@tauri-apps/plugin-os'
import { useEffect, useRef, useState } from 'react'
import { ReactComponent as DocumentIcon } from '~/icons/document.svg'
import { cn, formatLongString, validPath } from '~/lib/utils'

interface Position {
	x: number
	y: number
}

function Document({ position, path }: { position: Position; path: string }) {
	return (
		<div
			className="absolute z-[100000] bg-accent p-4 -translate-x-[50%] -translate-y-[50%] rounded-2xl flex flex-col items-center justify-center gap-4"
			style={{ left: position.x, top: position.y, cursor: 'grabbing' }}>
			<DocumentIcon />
			<p className="text-md font-light font-mono">{formatLongString(path, 10)}</p>
		</div>
	)
}

export default function DropModal() {
	const [open, setOpen] = useState(false)
	const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
	const listeners = useRef<event.UnlistenFn[]>([])
	const [path, setPath] = useState('')
	const [platform, setPlatofrm] = useState<os.Platform>('macos')

	async function handleDrops() {
		listeners.current.push(
			await event.listen('tauri://drag-enter', () => {
				setOpen(true)
			})
		)

		listeners.current.push(
			await event.listen('tauri://drag-leave', (_event) => {
				setOpen(false)
			})
		)

		listeners.current.push(
			await event.listen<{ position: Position }>('tauri://drag-over', (event) => {
				setPosition(event.payload.position)
			})
		)

		listeners.current.push(
			await event.listen<{ paths?: string[] }>('tauri://drag-drop', async (event) => {
				const { paths } = event.payload
				if (paths && paths.length > 0) {
					const newPath = await basename(paths[0])
					if (validPath(newPath)) {
						setPath(newPath)
						setOpen(true)
						const currentWindow = webview.getCurrentWebview().window
						currentWindow.setFocus()
					}
				}
				setOpen(false)
			})
		)
	}

	useEffect(() => {
		handleDrops()
		setPlatofrm(os.platform())
		return () => {
			listeners.current.forEach((unlisten) => unlisten())
		}
	}, [])

	return (
		<div>
			{open && platform === 'windows' && <Document path={path} position={position} />}
			<div className={cn('fixed inset-0 backdrop-blur-sm bg-background/60 z-50', open ? 'block' : 'hidden')}></div>
		</div>
	)
}
