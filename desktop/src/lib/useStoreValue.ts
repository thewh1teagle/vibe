import { Store } from '@tauri-apps/plugin-store'
import { useEffect, useState } from 'react'
import * as config from '~/lib/config'

const store = new Store(config.storeFilename)

export function useStoreValue<T>(key: string) {
	const [value, setValue] = useState<T | null>(null)

	const setValueWrapper = async (newValue: T) => {
		await store.set(key, newValue)
		await store.save()
		// Optimistic
		setValue(newValue)
	}

	useEffect(() => {
		store.get<T>(key).then((currentValue) => {
			setValue(currentValue ?? null)
		})
	}, [value])

	return [value, setValueWrapper] as const
}
