import { createStore } from '@tauri-apps/plugin-store'
import { useEffect, useState } from 'react'
import * as config from '~/lib/config'

export function useStoreValue<T>(key: string) {
	const [value, setValue] = useState<T | null>(null)

	const setValueWrapper = async (newValue: T) => {
		const store = await createStore(config.storeFilename)
		await store.set(key, newValue)
		await store.save()
		// Optimistic
		setValue(newValue)
	}

	async function initValue() {
		const store = await createStore(config.storeFilename)
		store.get<T>(key).then((currentValue) => {
			setValue(currentValue ?? null)
		})
	}

	useEffect(() => {
		initValue()
	}, [value])

	return [value, setValueWrapper] as const
}
