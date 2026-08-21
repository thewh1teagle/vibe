import ReactDOM from 'react-dom/client'
import './globals.css'
import { runMigrations } from './lib/migrations'
import Root from './root'

runMigrations()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
