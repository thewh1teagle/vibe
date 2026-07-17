import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { useLocation, useNavigate } from 'react-router-dom'
import { ReactComponent as IndicatorIcon } from '~/icons/update-indicator.svg'
import { ArrowLeft, MoreHorizontal, RefreshCcw, Settings2, Terminal, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { safeTranslate } from '~/lib/i18n'

interface AppMenuProps {
	availableUpdate: boolean
	updateApp: () => void
	onClickSettings: (scrollTo?: string) => void
}

export default function AppMenu({ availableUpdate, updateApp, onClickSettings }: AppMenuProps) {
	const navigate = useNavigate()
	const location = useLocation()
	const disableBack = Boolean((location.state as { disableBack?: boolean } | null)?.disableBack)
	const canGoBack = location.key !== 'default' && !disableBack
	const [open, setOpen] = useState(false)

	async function hideToTray() {
		await getCurrentWebviewWindow().hide()
	}

	return (
		<div dir="ltr">
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="icon"
						className="group relative h-11 w-11 rounded-xl border-border/75 bg-card/92 shadow-xs transition-all hover:-translate-y-px hover:bg-card hover:shadow-sm"
						aria-label={m.moreOptions()}
					>
						<MoreHorizontal className="h-4.5 w-4.5 text-foreground/90 transition-colors group-hover:text-foreground" strokeWidth={2.35} />
						{availableUpdate && <IndicatorIcon className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 drop-shadow-sm" />}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56 rounded-xl border-border/75 bg-popover/98 p-1.5 shadow-lg">
					<DropdownMenuItem onClick={() => onClickSettings()} className="h-10 rounded-md px-3 text-[15px] font-medium">
						<Settings2 className="h-4 w-4 text-muted-foreground" />
						{m.settings()}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onClickSettings('api')} className="h-10 rounded-md px-3 text-[15px] font-medium">
						<Terminal className="h-4 w-4 text-muted-foreground" />
						{m.apiAndAgents()}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={hideToTray} className="h-10 rounded-md px-3 text-[15px] font-medium">
						<X className="h-4 w-4 text-muted-foreground" />
						{safeTranslate(m, 'hideToTray', 'Hide to tray')}
					</DropdownMenuItem>
					{canGoBack && (
						<DropdownMenuItem onClick={() => navigate(-1)} className="h-10 rounded-md px-3 text-[15px] font-medium">
							<ArrowLeft className="h-4 w-4 text-muted-foreground" />
							{m.back()}
						</DropdownMenuItem>
					)}
					{availableUpdate && (
						<DropdownMenuItem onClick={updateApp} className="h-10 rounded-md px-3 text-[15px] font-medium text-primary">
							<RefreshCcw className="h-4 w-4 text-muted-foreground" />
							{m.updateVersion()}
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
