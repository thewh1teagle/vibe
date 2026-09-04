import { CONFIG_KEYS } from './config-keys'
import { readConfig, writeConfig } from './config-store'

/**
 * Whether this model has run out of GPU memory on this machine before. The verdict is kept per
 * model: a smaller one may still fit, and the user did not ask to give up the GPU everywhere.
 */
export function gpuOutOfMemoryBefore(modelPath: string | null): boolean {
	return modelPath !== null && readConfig<string[]>(CONFIG_KEYS.gpuOutOfMemoryModels, []).includes(modelPath)
}

export function rememberGpuOutOfMemory(modelPath: string | null) {
	if (modelPath === null || gpuOutOfMemoryBefore(modelPath)) return
	writeConfig(CONFIG_KEYS.gpuOutOfMemoryModels, [...readConfig<string[]>(CONFIG_KEYS.gpuOutOfMemoryModels, []), modelPath])
}
