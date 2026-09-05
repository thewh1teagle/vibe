import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import './globals.css'
import { loadConfigStore } from './lib/config-store'
import { runMigrations } from './lib/migrations'
import Root from './root'

/**
 * Settings are read synchronously during render, so the config file has to be in memory before the
 * first paint — otherwise the window opens with the default theme and language and then corrects
 * itself. Migrations run after the load because they write through the same store.
 */
async function start() {
	await loadConfigStore()
	runMigrations()
	// Native registrations outlive a webview reload, including their dead JS callbacks.
	// Clear them before either shortcut provider mounts. Auxiliary windows must never
	// clear the main window's live shortcuts when their own webviews start.
	if (getCurrentWindow().label === 'main') {
		try {
			await unregisterAll()
		} catch (error) {
			console.error('Failed to clear shortcuts from the previous webview:', error)
		}
	}
	ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
}

void start()
