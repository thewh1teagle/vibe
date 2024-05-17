import * as event from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { cx, formatLongString, validPath } from '~/lib/utils'
import { basename } from '@tauri-apps/api/path'
import * as os from '@tauri-apps/plugin-os'
import * as webview from '@tauri-apps/api/webview'
import { ReactComponent as DocumentIcon } from '~/icons/document.svg'

interface Position {
	x: number
	y: number
}

function Document({ position, path }: { position: Position; path: string }) {
	return (
		<div
			className="absolute z-[100000] bg-base-300 p-4 -translate-x-[50%] -translate-y-[50%] rounded-2xl flex flex-col items-center justify-center gap-4"
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
			await event.listen('tauri://drop-over', (event: any) => {
				const newPosition = { x: event.payload.position.x, y: event.payload.position.y as any }
				setPosition(newPosition)
			})
		)
		listeners.current.push(
			await event.listen('tauri://drag', async (event) => {
				const paths = ((event.payload as any)?.paths as string[]) ?? []
				if (paths) {
					const newPath = await basename(paths?.[0])
					if (validPath(newPath)) {
						setPath(newPath)
						setOpen(true)
						// Focus window
						const currentWindow = webview.getCurrent().window
						currentWindow.setFocus()
					}
				}
			})
		)

		listeners.current.push(
			await event.listen('tauri://drag-cancelled', (_) => {
				setOpen(false)
			})
		)

		listeners.current.push(
			await event.listen('tauri://drop', () => {
				setOpen(false)
			})
		)
	}

	useEffect(() => {
		handleDrops()
		os.platform().then((p) => setPlatofrm(p))
		return () => {
			for (const unlisten of listeners.current) {
				unlisten()
			}
		}
	}, [])

	return (
		<div>
			{open && platform === 'windows' && <Document path={path} position={position} />}
			<div className={cx('modal backdrop-blur-sm bg-base-100', open && 'modal-open')}></div>
		</div>
	)
}
