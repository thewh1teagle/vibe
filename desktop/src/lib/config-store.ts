import { listen } from '@tauri-apps/api/event'
import { load, type Store } from '@tauri-apps/plugin-store'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as config from '~/lib/config'

/**
 * Settings live in `app_config.json` next to the app's other data, not in `localStorage`: the file
 * survives a cleared webview, every window sees the same values, and a person (or an agent) can
 * open it and edit it.
 *
 * Reads have to be synchronous for React, so the whole file is pulled into a cache once at boot and
 * kept fresh by the store's change events — which also cover writes from another window.
 */
/**
 * Emitted by the Rust file watcher after someone edited `app_config.json` outside the app. The
 * store's own reload is silent (it only emits on set/delete/clear), so this carries the whole file.
 */
const CONFIG_CHANGED_EVENT = 'config-changed'

let store: Store | null = null
const cache = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

function notify(key: string) {
	for (const listener of listeners.get(key) ?? []) listener()
}

/** Must finish before the first render, or every setting would flash its default. */
export async function loadConfigStore() {
	try {
		// autoSave batches the disk writes: a slider being dragged costs one save, not fifty.
		store = await load(config.storeFilename, { autoSave: 300, defaults: {} })
		for (const [key, value] of await store.entries()) cache.set(key, value)
		await store.onChange((key, value) => {
			if (value === undefined) cache.delete(key)
			else cache.set(key, value)
			notify(key)
		})
		await listen<Record<string, unknown>>(CONFIG_CHANGED_EVENT, ({ payload }) => applyExternalConfig(payload))
	} catch (error) {
		// A broken or unreadable file must not stop the app: every setting falls back to its default.
		console.error('failed to load the config store:', error)
	}
}

/** Replace the cache with a config file edited from outside, waking only the keys that moved. */
function applyExternalConfig(next: Record<string, unknown> | null) {
	const incoming = next ?? {}
	const keys = new Set([...cache.keys(), ...Object.keys(incoming)])
	for (const key of keys) {
		const before = cache.get(key)
		const after = incoming[key]
		if (JSON.stringify(before) === JSON.stringify(after)) continue
		if (key in incoming) cache.set(key, after)
		else cache.delete(key)
		notify(key)
	}
}

export function readConfig<T>(key: string, fallback: T): T {
	return cache.has(key) ? (cache.get(key) as T) : fallback
}

export function writeConfig<T>(key: string, value: T) {
	cache.set(key, value)
	notify(key)
	// Fire and forget, like the old localStorage write: the screen must not wait on the disk.
	void store?.set(key, value)
}

function subscribe(key: string, listener: () => void) {
	const existing = listeners.get(key) ?? new Set<() => void>()
	existing.add(listener)
	listeners.set(key, existing)
	return () => {
		existing.delete(listener)
		if (existing.size === 0) listeners.delete(key)
	}
}

/**
 * Drop-in replacement for `useLocalStorage`: same tuple, same functional-update setter, but the
 * value is stored in the config file and shared across windows.
 */
export function usePersisted<T>(key: string, initial: T): [T, (value: T | ((previous: T) => T)) => void] {
	// Callers pass object literals as defaults; pinning the first one keeps the snapshot identity
	// stable while the key is missing, which useSyncExternalStore requires.
	const fallback = useRef(initial)

	const value = useSyncExternalStore(
		useCallback((listener: () => void) => subscribe(key, listener), [key]),
		useCallback(() => readConfig(key, fallback.current), [key]),
	)

	const setValue = useCallback(
		(next: T | ((previous: T) => T)) => {
			const resolved = typeof next === 'function' ? (next as (previous: T) => T)(readConfig(key, fallback.current)) : next
			writeConfig(key, resolved)
		},
		[key],
	)

	return [value, setValue]
}
