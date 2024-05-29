import { invoke } from '@tauri-apps/api/core'

interface X86feature {
	enabled: boolean
	support: boolean
}

export interface X86features {
	avx: X86feature
	avx2: X86feature
	fma: X86feature
	f16c: X86feature
}
export async function getX86Features() {
	return await invoke<X86features | null>('get_x86_features')
}
