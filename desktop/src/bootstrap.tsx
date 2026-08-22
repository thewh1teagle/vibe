import ReactDOM from 'react-dom/client'
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
	ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
}

void start()
