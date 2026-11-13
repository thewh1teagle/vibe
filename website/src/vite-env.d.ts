/// <reference types="vite/client" />

declare module '*.md?raw' {
	const content: string
	export default content
}

declare module 'virtual:model-catalog' {
	const catalog: { models: import('./lib/models').Model[] }
	export default catalog
}
