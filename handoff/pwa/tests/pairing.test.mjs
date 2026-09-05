import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { PEER_KEY, clearPeer, loadPeer, parsePairingHash, resolvePeer, savePeer } from '../src/lib/pairing.ts'

const endpointId = 'a'.repeat(64)
const invitation = 'b'.repeat(32)
const replacement = 'c'.repeat(32)
let stored

beforeEach(() => {
	stored = new Map()
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key) => stored.get(key) ?? null,
			setItem: (key, value) => stored.set(key, value),
			removeItem: (key) => stored.delete(key),
		},
	})
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: { userAgent: 'iPhone Safari', maxTouchPoints: 1 },
	})
})

function scanned() {
	const peer = parsePairingHash(`#${endpointId}:${invitation}`)
	savePeer(peer)
	return peer
}

function client(pair) {
	return { pair, fetch_capabilities: async () => ({ type: 'capabilities' }) }
}

test('stores credential before pairing and promotes it after desktop confirmation', async () => {
	const peer = scanned()
	const paired = await resolvePeer(
		client(async (endpoint, token, deviceToken, name) => {
			assert.equal(endpoint, endpointId)
			assert.equal(token, invitation)
			assert.match(deviceToken, /^[0-9a-f]{32}$/)
			assert.equal(loadPeer().pendingDeviceToken, deviceToken)
			assert.equal(name, 'iPhone · Safari')
			return { type: 'paired', deviceId: 'phone-1' }
		}),
		peer,
	)
	assert.equal(paired.token, loadPeer().token)
	assert.equal(paired.deviceId, 'phone-1')
	assert.notEqual(paired.token, invitation)
	assert.equal(paired.pendingDeviceToken, undefined)
})

test('retries the same saved credential after losing an accepted response', async () => {
	const peer = scanned()
	let firstToken
	await assert.rejects(
		resolvePeer(
			client(async (_endpoint, _token, credential) => {
				firstToken = credential
				throw new Error('connection lost')
			}),
			peer,
		),
		/connection lost/,
	)
	const retried = await resolvePeer(
		client(async (_endpoint, _token, credential) => {
			assert.equal(credential, firstToken)
			return { type: 'paired', deviceId: 'phone-1' }
		}),
		loadPeer(),
	)
	assert.equal(retried.token, firstToken)
})

test('confirmed phones never attempt pairing again, including after revocation', async () => {
	const peer = { endpointId, token: replacement, deviceId: 'phone-1', invitationToken: invitation }
	savePeer(peer)
	const denied = {
		pair: async () => assert.fail('revoked credential must never pair'),
		fetch_capabilities: async () => ({ type: 'error', code: 'unauthorized' }),
	}
	assert.deepEqual(await resolvePeer(denied, peer), peer)
	assert.deepEqual(parsePairingHash(`#${endpointId}:${invitation}`), peer)
	assert.equal(parsePairingHash(`#${endpointId}:${'d'.repeat(32)}`).deviceId, undefined)
})

test('migrates legacy shared tokens only after unauthorized capabilities', async () => {
	const peer = { endpointId, token: invitation }
	savePeer(peer)
	const migrated = await resolvePeer(
		{
			fetch_capabilities: async () => ({ type: 'error', code: 'unauthorized' }),
			pair: async (_endpoint, token) => {
				assert.equal(token, invitation)
				return { type: 'paired', deviceId: 'legacy-phone' }
			},
		},
		peer,
	)
	assert.equal(migrated.deviceId, 'legacy-phone')
})

test('fresh QR connects to an older desktop and migrates after desktop upgrade', async () => {
	const peer = scanned()
	let capabilityCalls = 0
	const legacy = await resolvePeer(
		{
			pair: async () => ({ type: 'error', code: 'invalid_request', message: "Unknown op 'pair'" }),
			fetch_capabilities: async (_endpoint, token) => {
				capabilityCalls++
				assert.equal(token, invitation)
				return { type: 'capabilities' }
			},
		},
		peer,
	)
	assert.equal(capabilityCalls, 1)
	assert.deepEqual(legacy, { endpointId, token: invitation })
	assert.deepEqual(loadPeer(), legacy)
	assert.deepEqual(parsePairingHash(`#${endpointId}:${invitation}`), legacy)
	const migrated = await resolvePeer(
		{
			fetch_capabilities: async () => ({ type: 'error', code: 'unauthorized' }),
			pair: async (_endpoint, token) => {
				assert.equal(token, invitation)
				return { type: 'paired', deviceId: 'upgraded-phone' }
			},
		},
		legacy,
	)
	assert.equal(migrated.deviceId, 'upgraded-phone')
	assert.notEqual(migrated.token, invitation)
})

test('denied or malformed pairing never falls back to a shared token', async () => {
	for (const result of [
		{ type: 'error', code: 'unauthorized', message: 'Revoked invitation' },
		{ type: 'error', code: 'revoked', message: 'Revoked device' },
		{ type: 'error', code: 'pairing_failed', message: 'Unable to save device' },
		{ type: 'error', code: 'invalid_request', message: 'Missing device credential' },
	]) {
		clearPeer()
		const peer = scanned()
		await assert.rejects(
			resolvePeer(
				{
					pair: async () => result,
					fetch_capabilities: async () => assert.fail('denied pairing must not fall back'),
				},
				peer,
			),
			(error) => error.code === result.code,
		)
		assert.equal(loadPeer().invitationToken, invitation)
		assert.ok(loadPeer().pendingDeviceToken)
	}
})

test('older desktop fallback requires a successful authenticated capabilities reply', async () => {
	for (const capabilities of [
		{ type: 'error', code: 'unauthorized', message: 'Invalid pairing token' },
		{ type: 'paired', deviceId: 'unexpected' },
	]) {
		clearPeer()
		const peer = scanned()
		await assert.rejects(
			resolvePeer(
				{
					pair: async () => ({ type: 'error', code: 'invalid_request', message: "Unknown op 'pair'" }),
					fetch_capabilities: async () => capabilities,
				},
				peer,
			),
		)
		assert.equal(loadPeer().invitationToken, invitation)
		assert.ok(loadPeer().pendingDeviceToken)
	}
})

test('late legacy fallback cannot restore a forgotten connection', async () => {
	const peer = scanned()
	await assert.rejects(
		resolvePeer(
			{
				pair: async () => ({ type: 'error', code: 'invalid_request', message: "Unknown op 'pair'" }),
				fetch_capabilities: async () => {
					clearPeer()
					return { type: 'capabilities' }
				},
			},
			peer,
		),
		/connection changed/,
	)
	assert.equal(loadPeer(), null)
})

test('parallel capabilities and upload callers share one pairing exchange', async () => {
	const peer = scanned()
	let answer
	let calls = 0
	const desktop = client(() => {
		calls++
		return new Promise((resolve) => {
			answer = resolve
		})
	})
	const first = resolvePeer(desktop, peer)
	const second = resolvePeer(desktop, peer)
	answer({ type: 'paired', deviceId: 'phone-1' })
	assert.deepEqual(await first, await second)
	assert.equal(calls, 1)
})

test('late pairing response cannot restore a cleared connection', async () => {
	const peer = scanned()
	let answer
	const request = resolvePeer(
		client(
			() =>
				new Promise((resolve) => {
					answer = resolve
				}),
		),
		peer,
	)
	clearPeer()
	answer({ type: 'paired', deviceId: 'phone-1' })
	await assert.rejects(request, /connection changed/)
	assert.equal(loadPeer(), null)
})

test('storage failure prevents sending an unrecoverable credential', async () => {
	const peer = scanned()
	localStorage.setItem = () => {
		throw new Error('storage blocked')
	}
	await assert.rejects(
		resolvePeer(
			client(async () => assert.fail('must save before pair')),
			peer,
		),
		/Allow browser storage/,
	)
	assert.equal(JSON.parse(stored.get(PEER_KEY)).pendingDeviceToken, undefined)
})

test('stale legacy callers reuse the migrated credential saved by another request', async () => {
	const legacy = { endpointId, token: invitation }
	const confirmed = { endpointId, token: replacement, deviceId: 'phone-1', invitationToken: invitation }
	savePeer(confirmed)
	assert.deepEqual(
		await resolvePeer(
			client(async () => assert.fail('already paired')),
			legacy,
		),
		confirmed,
	)
})

test('switching QR during legacy capability lookup cannot overwrite the new selection', async () => {
	const legacy = { endpointId, token: invitation }
	savePeer(legacy)
	let answer
	const request = resolvePeer(
		{
			pair: async () => assert.fail('old invitation must not pair'),
			fetch_capabilities: () =>
				new Promise((resolve) => {
					answer = resolve
				}),
		},
		legacy,
	)
	const next = parsePairingHash(`#${endpointId}:${replacement}`)
	savePeer(next)
	answer({ type: 'error', code: 'unauthorized' })
	await assert.rejects(request, /connection changed/)
	assert.deepEqual(loadPeer(), next)
})

test('rejected invitations retain the unauthorized code for the rescan prompt', async () => {
	const peer = scanned()
	await assert.rejects(
		resolvePeer(
			client(async () => ({ type: 'error', code: 'unauthorized', message: 'Scan a new code.' })),
			peer,
		),
		(error) => {
			assert.equal(error.code, 'unauthorized')
			return true
		},
	)
})

test('confirmed credentials cannot be used after forgetting or switching the connection', async () => {
	const confirmed = { endpointId, token: replacement, deviceId: 'phone-1', invitationToken: invitation }
	savePeer(confirmed)
	clearPeer()
	const desktop = client(async () => assert.fail('must not contact old desktop'))
	await assert.rejects(resolvePeer(desktop, confirmed), /connection changed/)
	savePeer(parsePairingHash(`#${endpointId}:${'d'.repeat(32)}`))
	await assert.rejects(resolvePeer(desktop, confirmed), /connection changed/)
})

test('late pairing success after a new QR cannot authorize a queued upload', async () => {
	const peer = scanned()
	let answer
	const request = resolvePeer(
		client(
			() =>
				new Promise((resolve) => {
					answer = resolve
				}),
		),
		peer,
	)
	const next = parsePairingHash(`#${endpointId}:${replacement}`)
	savePeer(next)
	answer({ type: 'paired', deviceId: 'phone-1' })
	await assert.rejects(request, /connection changed/)
	assert.deepEqual(loadPeer(), next)
})

test('QR parsing preserves case-insensitive endpoint IDs', () => {
	assert.equal(parsePairingHash(`# ${endpointId.toUpperCase()} : ${invitation} `).endpointId, endpointId)
})

test('legacy capabilities success after forgetting also prevents an upload', async () => {
	const legacy = { endpointId, token: invitation }
	savePeer(legacy)
	let answer
	const request = resolvePeer(
		{
			pair: async () => assert.fail('must not pair'),
			fetch_capabilities: () =>
				new Promise((resolve) => {
					answer = resolve
				}),
		},
		legacy,
	)
	clearPeer()
	answer({ type: 'capabilities' })
	await assert.rejects(request, /connection changed/)
})
