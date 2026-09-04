import { describe, expect, it } from 'vitest'
import { isGpuOutOfMemory, serverErrorCodes } from './server-errors'

describe('isGpuOutOfMemory', () => {
	it('trusts the code server reports on a failed GPU allocation', () => {
		expect(isGpuOutOfMemory(serverErrorCodes.GPU_OUT_OF_MEMORY, 'vk::Device::allocateMemory: ErrorOutOfDeviceMemory')).toBe(true)
	})

	it('reads the abort message when the allocation killed the process', () => {
		const report =
			'vibe-server process died during transcription (exited with code -1073740791)\n\nsona stderr: memory allocation of 1610612736 bytes failed'
		expect(isGpuOutOfMemory(serverErrorCodes.INTERNAL_ERROR, report)).toBe(true)
	})

	it('leaves system memory exhaustion alone, since the CPU would fail the same way', () => {
		expect(isGpuOutOfMemory(serverErrorCodes.OUT_OF_MEMORY, 'failed to allocate 3 GiB')).toBe(false)
	})

	it('does not read memory into an unrelated death or stream failure', () => {
		expect(isGpuOutOfMemory(serverErrorCodes.INTERNAL_ERROR, 'vibe-server process died during transcription (killed by signal 9)')).toBe(false)
		expect(isGpuOutOfMemory(serverErrorCodes.INTERNAL_ERROR, 'failed to read server event line: invalid json')).toBe(false)
	})
})
