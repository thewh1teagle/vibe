import * as event from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { cx, formatLongString } from '../lib/utils'
import { basename } from '@tauri-apps/api/path'
import * as os from '@tauri-apps/plugin-os'

interface Position {
    x: number
    y: number
}

function Document({ position, path }: { position: Position; path: string }) {
    return (
        <div
            className="absolute z-[100000] bg-base-300 p-4 -translate-x-[50%] -translate-y-[50%] rounded-2xl flex flex-col items-center justify-center gap-4"
            style={{ left: position.x, top: position.y, cursor: 'grabbing' }}>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-20 h-20 stroke-neutral">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
            </svg>
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
                    setPath(await basename(paths?.[0]))
                }
                setOpen(true)
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
            {open && platform !== 'macos' && <Document path={path} position={position} />}
            <div className={cx('modal backdrop-blur-sm bg-base-100', open && 'modal-open')}></div>
        </div>
    )
}
