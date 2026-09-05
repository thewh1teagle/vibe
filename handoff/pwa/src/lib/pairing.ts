/** Durable phone credentials, including retries after a lost pairing response. */
export const PEER_KEY = 'vibe.handoff.peer'

export interface Peer {
	endpointId: string
	token: string
	deviceId?: string
	/** Retained to recognize rescans of the same invitation, never used after confirmation. */
	invitationToken?: string
	pendingDeviceToken?: string
}

interface PairingClient {
	pair(endpointId: string, token: string, deviceToken: string, deviceName: string): Promise<unknown>
	fetch_capabilities(endpointId: string, token: string): Promise<unknown>
}

export class PairingError extends Error {
	code: string
	constructor(code: string, message: string) {
		super(message)
		this.code = code
	}
}

export function loadPeer(): Peer | null {
	try {
		const parsed = JSON.parse(localStorage.getItem(PEER_KEY) ?? 'null') as Partial<Peer> | null
		if (!parsed || typeof parsed.endpointId !== 'string' || typeof parsed.token !== 'string') return null
		return {
			endpointId: parsed.endpointId,
			token: parsed.token,
			...(typeof parsed.deviceId === 'string' && { deviceId: parsed.deviceId }),
			...(typeof parsed.invitationToken === 'string' && { invitationToken: parsed.invitationToken }),
			...(typeof parsed.pendingDeviceToken === 'string' && { pendingDeviceToken: parsed.pendingDeviceToken }),
		}
	} catch {
		return null
	}
}

export function savePeer(peer: Peer): void {
	try {
		localStorage.setItem(PEER_KEY, JSON.stringify(peer))
	} catch {
		/* Pairing itself requires durable storage and reports a failure below. */
	}
}

export function clearPeer(): void {
	try {
		localStorage.removeItem(PEER_KEY)
	} catch {
		/* ignore */
	}
}

/** Pairing URL is `<origin>/#<endpointId>:<token>` — 64 hex, then 32 hex. */
export function parsePairingHash(hash: string): Peer | null {
	const match = /^\s*([0-9a-fA-F]{64})\s*:\s*([0-9a-f]{32})\s*$/.exec(hash.replace(/^#/, ''))
	if (!match) return null
	const endpointId = match[1].toLowerCase()
	const token = match[2]
	const saved = loadPeer()
	// Reopening the original QR must retain a confirmed (possibly revoked) credential.
	if (saved?.endpointId === endpointId && (saved.invitationToken === token || saved.token === token)) return saved
	return { endpointId, token, invitationToken: token }
}

function samePairing(a: Peer, b: Peer): boolean {
	return a.endpointId === b.endpointId && (a.token === b.token || (a.invitationToken ?? a.token) === (b.invitationToken ?? b.token))
}

function reply(value: unknown): Record<string, unknown> {
	if (typeof value === 'string') return JSON.parse(value)
	if (value instanceof Map) return Object.fromEntries(value)
	if (value && typeof value === 'object') return value as Record<string, unknown>
	throw new Error('The desktop sent an unreadable pairing reply.')
}

function deviceName(): string {
	const ua = navigator.userAgent
	const platform =
		/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
			? 'iPad'
			: /iPhone/.test(ua)
				? 'iPhone'
				: /Android/.test(ua)
					? 'Android phone'
					: /Macintosh/.test(ua)
						? 'Mac'
						: /Windows/.test(ua)
							? 'Windows'
							: 'Phone'
	const browser = /Edg/.test(ua)
		? 'Edge'
		: /Firefox|FxiOS/.test(ua)
			? 'Firefox'
			: /Chrome|CriOS/.test(ua)
				? 'Chrome'
				: /Safari/.test(ua)
					? 'Safari'
					: 'Browser'
	return `${platform} · ${browser}`
}

const pending = new Map<string, Promise<Peer>>()

/** Both capability requests and uploads wait for this credential exchange. */
export async function resolvePeer(client: PairingClient, requested: Peer): Promise<Peer> {
	const saved = loadPeer()
	if (!saved || !samePairing(saved, requested)) throw new Error('The phone connection changed. Try again with the current connection.')
	const peer = saved
	if (peer.deviceId) return peer
	const key = `${peer.endpointId}:${peer.invitationToken ?? peer.token}`
	const existing = pending.get(key)
	if (existing) return existing
	const operation = pairPeer(client, peer).finally(() => pending.delete(key))
	pending.set(key, operation)
	return operation
}

async function pairPeer(client: PairingClient, peer: Peer): Promise<Peer> {
	if (!peer.invitationToken && !peer.pendingDeviceToken) {
		// Old installs contain only the shared token. Migrate when the new desktop rejects it.
		const capabilities = reply(await client.fetch_capabilities(peer.endpointId, peer.token))
		if (capabilities.type !== 'error' || capabilities.code !== 'unauthorized') {
			const selected = loadPeer()
			if (!selected || !samePairing(selected, peer)) throw new Error('The phone connection changed. Try again with the current connection.')
			return selected
		}
	}
	const deviceToken = peer.pendingDeviceToken ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('')
	const invitationToken = peer.invitationToken ?? peer.token
	const waiting: Peer = { ...peer, invitationToken, pendingDeviceToken: deviceToken }
	const selected = loadPeer()
	if (!selected || !samePairing(selected, peer)) throw new Error('The phone connection changed. Try again with the current connection.')
	// Persist before sending: the desktop may accept while the browser loses its response.
	try {
		localStorage.setItem(PEER_KEY, JSON.stringify(waiting))
	} catch {
		throw new Error('Allow browser storage to save this phone connection, then try again.')
	}
	const result = reply(await client.pair(peer.endpointId, invitationToken, deviceToken, deviceName()))
	if (result.type === 'error' && result.code === 'invalid_request' && result.message === "Unknown op 'pair'") {
		// Older desktops predate device credentials. Require an authenticated capability
		// reply before retaining their shared token; denied pairing must never downgrade.
		const capabilities = reply(await client.fetch_capabilities(peer.endpointId, invitationToken))
		if (capabilities.type === 'error') {
			throw new PairingError(String(capabilities.code ?? 'pairing'), String(capabilities.message ?? 'Could not connect to this desktop.'))
		}
		if (capabilities.type !== 'capabilities') throw new Error('Unexpected reply to the capabilities request.')
		const current = loadPeer()
		if (!current || !samePairing(current, waiting)) throw new Error('The phone connection changed. Try again with the current connection.')
		// Token-only peers are the legacy marker. Capability checks will migrate them
		// to a device credential when an upgraded desktop rejects the shared token.
		const legacy: Peer = { endpointId: peer.endpointId, token: invitationToken }
		savePeer(legacy)
		return legacy
	}
	if (result.type === 'error') throw new PairingError(String(result.code ?? 'pairing'), String(result.message ?? 'Could not pair this phone.'))
	if (result.type !== 'paired' || typeof result.deviceId !== 'string') throw new Error('Unexpected reply to the pairing request.')
	const confirmed: Peer = { endpointId: peer.endpointId, token: deviceToken, deviceId: result.deviceId, invitationToken }
	const current = loadPeer()
	// A late response must not restore a connection the user cleared or replace a newly scanned QR.
	if (!current || !samePairing(current, waiting)) throw new Error('The phone connection changed. Try again with the current connection.')
	savePeer(confirmed)
	return confirmed
}
