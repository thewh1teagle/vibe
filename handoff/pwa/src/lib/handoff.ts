/**
 * Wire types and the wasm bridge.
 *
 * The wasm bundle is produced by the `handoff-wasm` crate and dropped into
 * `handoff/pwa/public/wasm/`. Vite copies `public/` verbatim, so we load it with an
 * explicit runtime import of an absolute URL — never a bundler-resolved one —
 * and rebuilding the crate is picked up without touching the app.
 */

import { PairingError, resolvePeer, type Peer } from './pairing'
export { PEER_KEY, loadPeer, savePeer, clearPeer, parsePairingHash, resolvePeer, type Peer } from './pairing'
export const LANG_KEY = 'vibe.handoff.lang'

// Rebased on the deploy base: the app is served from a subpath on GitHub
// Pages (`/vibe/phone/`), so a root-absolute `/wasm/...` would 404. BASE_URL
// always carries a trailing slash, and `new URL(..., document.baseURI)`
// resolves it against the real document location.
const WASM_JS_URL = new URL(`${import.meta.env.BASE_URL}wasm/handoff_wasm.js`, document.baseURI).href
const WASM_BIN_URL = new URL(`${import.meta.env.BASE_URL}wasm/handoff_wasm_bg.wasm`, document.baseURI).href

/**
 * Reply to `op: "capabilities"`. The desktop owns this knowledge because it
 * depends on the model currently loaded there; the phone must never guess it.
 */
export interface Capabilities {
	type: 'capabilities'
	modelLoaded: boolean
	modelName: string | null
	languages: string[]
	languageDetection: boolean
	/** Parsed to mirror the wire contract; the phone does not offer translation. */
	translation: boolean
	/** The desktop's real audio cap in bytes. 0 or absent means "no known limit". */
	maxAudioBytes?: number
}

export interface HandoffError {
	type: 'error'
	code: string
	message: string
}

export type CapabilitiesResult = Capabilities | HandoffError

export type HandoffEvent =
	| { type: 'uploadProgress'; sent: number; total: number }
	| { type: 'accepted' }
	/**
	 * Non-terminal progress phase. `phase` is deliberately a bare string: more
	 * phases may be added later and an unknown one must not break the UI.
	 */
	| { type: 'status'; phase: string }
	| { type: 'progress'; progress: number }
	| { type: 'segment'; start: number; stop: number; text: string; speaker: number | null }
	| { type: 'done'; text: string; processingTimeSec?: number; savedPath?: string }
	| { type: 'error'; code: string; message: string }

interface HandoffClient {
	endpoint_id(): string
	pair(endpointId: string, token: string, deviceToken: string, deviceName: string): Promise<unknown>
	fetch_capabilities(endpointId: string, token: string): Promise<unknown>
	send_recording(
		endpointId: string,
		token: string,
		filename: string,
		mime: string,
		lang: string | null | undefined,
		translate: boolean,
		audio: Uint8Array,
	): ReadableStream
}

interface WasmModule {
	default: (init?: unknown) => Promise<unknown>
	HandoffClient: { create(): Promise<HandoffClient> }
}

let clientPromise: Promise<HandoffClient> | null = null

/** Bind the browser iroh endpoint once and reuse it for every send. */
export async function getClient(): Promise<HandoffClient> {
	if (!clientPromise) {
		clientPromise = (async () => {
			const mod = (await import(/* @vite-ignore */ WASM_JS_URL)) as WasmModule
			await mod.default({ module_or_path: new URL(WASM_BIN_URL) })
			return await mod.HandoffClient.create()
		})().catch((err) => {
			clientPromise = null
			throw err
		})
	}
	return clientPromise
}

/**
 * Events cross the wasm boundary as plain JS objects, but be liberal: a string
 * or byte chunk is parsed as JSON so a change on the Rust side cannot silently
 * break the UI.
 */
export function normalizeEvent(value: unknown): HandoffEvent | null {
	if (value == null) return null
	if (typeof value === 'string') {
		try {
			return JSON.parse(value) as HandoffEvent
		} catch {
			return null
		}
	}
	if (value instanceof Uint8Array) {
		try {
			return JSON.parse(new TextDecoder().decode(value)) as HandoffEvent
		} catch {
			return null
		}
	}
	if (value instanceof Map) return Object.fromEntries(value) as unknown as HandoffEvent
	if (typeof value === 'object') return value as HandoffEvent
	return null
}

/**
 * Ask the desktop what it can do. Never falls back to a locally assumed answer:
 * a failure here is reported so the user can retry, because guessing the
 * language list is exactly what this round trip exists to avoid.
 */
export async function fetchCapabilities(peer: Peer): Promise<CapabilitiesResult> {
	let client: HandoffClient
	try {
		client = await getClient()
	} catch (err) {
		return { type: 'error', code: 'wasm', message: err instanceof Error ? err.message : String(err) }
	}

	try {
		const authorized = await resolvePeer(client, peer)
		const raw = await client.fetch_capabilities(authorized.endpointId, authorized.token)
		const parsed = normalizeEvent(raw) as CapabilitiesResult | null
		if (!parsed) return { type: 'error', code: 'protocol', message: 'The desktop sent an unreadable capabilities reply.' }
		if (parsed.type === 'capabilities' || parsed.type === 'error') return parsed
		return { type: 'error', code: 'protocol', message: 'Unexpected reply to the capabilities request.' }
	} catch (err) {
		return { type: 'error', code: err instanceof PairingError ? err.code : 'transport', message: err instanceof Error ? err.message : String(err) }
	}
}

export function truncateId(id: string): string {
	return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

/**
 * Last path component of a desktop filesystem path. The full absolute path is
 * meaningless on a phone screen, so the done state shows only this.
 */
export function basename(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean)
	return parts.length > 0 ? parts[parts.length - 1] : path
}
