import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

// https://vitejs.dev/config/
export default defineConfig(async () => ({
	plugins: [
		react(),
		tailwindcss(),
		svgr({
			// allow import it as regular react component
			svgrOptions: { exportType: 'named', ref: true, svgo: false, titleProp: true },
			include: '**/*.svg',
		}),
	],

	resolve: {
		alias: {
			'~': '/src',
		},
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		watch: {
			ignored: ['**/src-tauri/**'],
		},
	},
}))
