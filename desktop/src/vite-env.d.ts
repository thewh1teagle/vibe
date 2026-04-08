/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_COMPANY_NAME?: string
	readonly VITE_APP_NAME?: string
	readonly VITE_APP_DISPLAY_NAME?: string
	readonly VITE_SUPPORT_EMAIL?: string
	readonly VITE_SUPPORT_URL?: string
	readonly VITE_ABOUT_URL?: string
	readonly VITE_UPDATE_URL?: string
	readonly VITE_LATEST_RELEASE_URL?: string
	readonly VITE_FALLBACK_DOWNLOAD_URL?: string
	readonly VITE_MODELS_DOC_URL?: string
	readonly VITE_INSTALL_DOC_URL?: string
	readonly VITE_COMMUNITY_URL?: string
	readonly VITE_EMBEDDING_MODEL_URL?: string
	readonly VITE_SEGMENT_MODEL_URL?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare module '*.svg' {
	import * as React from 'react'

	export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>

	const src: string
	export default src
}
