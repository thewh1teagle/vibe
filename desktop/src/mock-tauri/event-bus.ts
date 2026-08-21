// Event bus for the browser-mode Tauri mock.
//
// Two directions are supported:
//   backend -> frontend: `emitMockEvent()` delivers to every `listen()` callback.
//   frontend -> backend: `onMockEvent()` observes what the app sends via `emit()` / `emitTo()`.
//
// The frontend registers a listener through `plugin:event|listen`, which carries a numeric
// callback id created by `transformCallback()`. The real runtime invokes it through
// `window.__TAURI_INTERNALS__.runCallback(id, { event, id, payload })` — we do exactly the same.

interface TauriInternals {
	runCallback?: (id: number, data: unknown) => void
}

interface EventCallbackPayload {
	event: string
	id: number
	payload?: unknown
}

export type MockEventSubscriber = (payload?: unknown) => void

interface EventBusState {
	// Event name -> callback ids registered by the frontend `listen()`.
	listeners: Map<string, Set<number>>
	// Event name -> observers of frontend `emit()` / `emitTo()`.
	subscribers: Map<string, Set<MockEventSubscriber>>
}

const STATE_KEY = '__vibeMockEventBus__'

// Kept on globalThis so a vite HMR re-evaluation of this module doesn't drop live listeners.
function getState(): EventBusState {
	const holder = globalThis as typeof globalThis & { [STATE_KEY]?: EventBusState }
	if (!holder[STATE_KEY]) {
		holder[STATE_KEY] = { listeners: new Map(), subscribers: new Map() }
	}
	return holder[STATE_KEY]
}

function runCallback(id: number, data: EventCallbackPayload): void {
	const internals = (window as Window & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__
	if (!internals?.runCallback) {
		console.warn('[mock-tauri] event delivered before the runtime was installed', data.event)
		return
	}
	internals.runCallback(id, data)
}

function deliverToListeners(event: string, payload?: unknown): void {
	const ids = getState().listeners.get(event)
	if (!ids?.size) {
		return
	}
	// Snapshot: a handler may unlisten (e.g. `once()`) while we iterate.
	for (const id of [...ids]) {
		runCallback(id, { event, id, payload })
	}
}

function notifySubscribers(event: string, payload?: unknown): void {
	const subscribers = getState().subscribers.get(event)
	if (!subscribers?.size) {
		return
	}
	for (const subscriber of [...subscribers]) {
		try {
			subscriber(payload)
		} catch (error) {
			console.error('[mock-tauri] event subscriber failed', event, error)
		}
	}
}

/** Deliver an event to every frontend `listen()` callback, like the Rust side would. */
export function emitMockEvent(event: string, payload?: unknown): void {
	deliverToListeners(event, payload)
}

/** Observe events the frontend sends with `emit()` / `emitTo()`. Returns an unsubscribe function. */
export function onMockEvent(event: string, cb: MockEventSubscriber): () => void {
	const { subscribers } = getState()
	let forEvent = subscribers.get(event)
	if (!forEvent) {
		forEvent = new Set()
		subscribers.set(event, forEvent)
	}
	forEvent.add(cb)
	return () => {
		subscribers.get(event)?.delete(cb)
	}
}

/** Implements the `plugin:event|*` IPC surface used by `@tauri-apps/api/event`. */
export function handleEventPluginCommand(cmd: string, args: Record<string, unknown>): unknown {
	const { listeners } = getState()
	const event = String(args.event ?? '')

	switch (cmd) {
		case 'plugin:event|listen': {
			const handler = args.handler as number
			let ids = listeners.get(event)
			if (!ids) {
				ids = new Set()
				listeners.set(event, ids)
			}
			ids.add(handler)
			// The returned id is what `unlisten()` and `once()` send back to us.
			return handler
		}
		case 'plugin:event|unlisten': {
			listeners.get(event)?.delete(args.eventId as number)
			return null
		}
		case 'plugin:event|emit':
		case 'plugin:event|emit_to': {
			// A frontend emit reaches both the fake backend and any frontend listener.
			deliverToListeners(event, args.payload)
			notifySubscribers(event, args.payload)
			return null
		}
		default: {
			console.warn('[mock-tauri] unhandled event plugin command', cmd, args)
			return null
		}
	}
}
