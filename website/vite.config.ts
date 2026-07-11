import { defineConfig } from 'vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/paraglide',
			emitTsDeclarations: true,
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
		}),
		react(),
		tailwindcss(),
	],
	base: '/vibe/',
	resolve: {
		alias: {
			'~': path.resolve(__dirname, './src'),
		},
	},
})
