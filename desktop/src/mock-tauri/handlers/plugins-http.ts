// Mock of the `plugin:http` multi-command protocol, implemented on top of the real
// browser `fetch`. The plugin JS drives it as:
//   1. `fetch`            -> { clientConfig } -> request rid
//   2. `fetch_send`       -> { rid }          -> { status, statusText, url, headers, rid: bodyRid }
//   3. `fetch_read_body`  -> { rid: bodyRid } -> number[] where the LAST byte is a flag:
//                                                0 = chunk (strip the flag), 1 = end of stream
//   4. `fetch_cancel` / `fetch_cancel_body` -> { rid }
// Requests blocked by browser CORS reject, which is expected in mock mode.
import type { CommandHandlerMap } from '../types'

interface ClientConfig {
	method?: string
	url?: string
	headers?: [string, string][]
	data?: number[] | null
}

interface PendingRequest {
	config: ClientConfig
	controller: AbortController
}

interface PendingBody {
	chunks: Uint8Array[]
	index: number
}

const requests = new Map<number, PendingRequest>()
const bodies = new Map<number, PendingBody>()
let nextRid = 1

function toHeaders(entries: [string, string][] | undefined): Headers {
	const headers = new Headers()
	for (const [name, value] of entries ?? []) {
		try {
			headers.set(name, value)
		} catch {
			// Forbidden header names (host, content-length, ...) are set by the browser itself.
		}
	}
	return headers
}

export const httpHandlers: CommandHandlerMap = {
	'plugin:http|fetch': (args) => {
		const config = (args.clientConfig ?? {}) as ClientConfig
		const rid = nextRid++
		requests.set(rid, { config, controller: new AbortController() })
		return rid
	},

	'plugin:http|fetch_cancel': (args) => {
		const rid = args.rid as number
		requests.get(rid)?.controller.abort()
		requests.delete(rid)
		return null
	},

	'plugin:http|fetch_send': async (args) => {
		const rid = args.rid as number
		const pending = requests.get(rid)
		if (!pending) {
			throw new Error(`[mock-http] unknown request rid ${rid}`)
		}
		requests.delete(rid)

		const { config, controller } = pending
		const method = (config.method ?? 'GET').toUpperCase()
		const hasBody = method !== 'GET' && method !== 'HEAD' && config.data != null
		const response = await fetch(config.url ?? '', {
			method,
			headers: toHeaders(config.headers),
			body: hasBody ? new Uint8Array(config.data as number[]) : undefined,
			signal: controller.signal,
		})

		const buffer = new Uint8Array(await response.arrayBuffer())
		const bodyRid = nextRid++
		bodies.set(bodyRid, { chunks: buffer.byteLength ? [buffer] : [], index: 0 })

		return {
			status: response.status,
			statusText: response.statusText,
			url: response.url || (config.url ?? ''),
			headers: Array.from(response.headers.entries()),
			rid: bodyRid,
		}
	},

	'plugin:http|fetch_read_body': (args) => {
		const rid = args.rid as number
		const body = bodies.get(rid)
		if (!body || body.index >= body.chunks.length) {
			bodies.delete(rid)
			// Lone terminator byte: tells the plugin stream to close.
			return [1]
		}
		const chunk = body.chunks[body.index++]
		const out = new Array<number>(chunk.byteLength + 1)
		for (let i = 0; i < chunk.byteLength; i++) {
			out[i] = chunk[i]
		}
		out[chunk.byteLength] = 0
		return out
	},

	'plugin:http|fetch_cancel_body': (args) => {
		bodies.delete(args.rid as number)
		return null
	},
}
