import { m } from '~/paraglide/messages.js'
import { viewModel } from './view-model'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'

function App() {
	const vm = viewModel()

	return (
		<div className="app-shell flex min-h-screen items-center justify-center">
			<div className="app-panel w-full max-w-xl text-center">
				<p className="app-kicker mb-2">{m.setup({ defaultValue: 'Setup' })}</p>
				<div className="text-balance text-2xl font-semibold md:text-3xl">{m.downloadingModel({ company: vm.modelCompany })}</div>

				<div className="mt-6 flex flex-col items-center gap-3">
					{vm.downloadProgress > 0 && (
						<>
							<Progress className="w-full max-w-sm" value={vm.downloadProgress} />
							{!vm?.location?.state?.downloadURL && <p className="text-sm text-muted-foreground">{m.thisHappensOnce()}</p>}
						</>
					)}
					{(vm.downloadProgress === 0 || vm.isOnline === null) && <Spinner className="h-8 w-8" />}
				</div>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="sm" className="mt-5 text-destructive text-xs" onClick={vm.cancelSetup}>
							{m.cancel()}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{m.infoCancelDownload()}</TooltipContent>
				</Tooltip>
			</div>

			<Dialog open={vm.isOnline === false}>
				<DialogContent>
					<div className="text-center text-2xl font-semibold">{m.noConnection()}</div>
					<p className="mt-3 text-center text-muted-foreground">{m.infoManualDownload()}</p>
					<div className="mt-5 flex flex-col justify-center gap-2">
						<Button className="flex-1" onClick={vm.downloadIfOnline}>
							{m.tryAgain()}
						</Button>
						<Button variant="secondary" size="sm" onClick={vm.cancelSetup}>
							{m.iPreferManualSetup()}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default App
