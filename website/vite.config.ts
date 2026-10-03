import { defineConfig, searchForWorkspaceRoot } from 'vite'
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
	server: {
		fs: {
			// Docs and changelog translations live in ../i18n and load lazily; without this the dev server refuses to transform them.
			allow: [searchForWorkspaceRoot(process.cwd()), path.resolve(__dirname, '../i18n')],
		},
	},
	resolve: {
		alias: {
			'~': path.resolve(__dirname, './src'),
		},
	},
})
