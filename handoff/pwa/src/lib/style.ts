import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function cx(...cns: (boolean | string | undefined)[]): string {
	return cns.filter(Boolean).join(' ')
}
