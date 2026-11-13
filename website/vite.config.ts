import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'fs'

/**
 * `public/models.json` is served as-is for the desktop app, and the /models page is built from
 * the same file. Vite will not import out of `public/`, so the page reads it through this module.
 */
function modelCatalog(): Plugin {
	const file = path.resolve(__dirname, 'public/models.json')
	const id = 'virtual:model-catalog'
	return {
		name: 'model-catalog',
		resolveId: (source) => (source === id ? `\0${id}` : null),
		load(resolved) {
			if (resolved !== `\0${id}`) return null
			this.addWatchFile(file)
			return `export default ${JSON.stringify(JSON.parse(readFileSync(file, 'utf8')))}`
		},
		handleHotUpdate({ file: changed, server }) {
			if (changed !== file) return
			const module = server.moduleGraph.getModuleById(`\0${id}`)
			if (module) server.moduleGraph.invalidateModule(module)
			server.ws.send({ type: 'full-reload' })
			return []
		},
	}
}

export default defineConfig({
	plugins: [
		modelCatalog(),
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
