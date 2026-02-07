import * as shell from '@tauri-apps/plugin-shell'
import { useTranslation } from 'react-i18next'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ModifyState, getIssueUrl, resetApp } from '~/lib/utils'
import { ErrorModalState } from '~/providers/ErrorModal'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { collectLogs } from '~/lib/logs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'

interface ErrorModalProps {
	state: ErrorModalState
	setState: ModifyState<ErrorModalState>
}

export default function ErrorModal({ state, setState }: ErrorModalProps) {
	const { t } = useTranslation()

	async function clearLogAndReset() {
		setState({ open: false, log: '' })
		resetApp()
	}
	async function reportIssue() {
		let info = ''
		try {
			info = await collectLogs()
		} catch (e) {
			console.error(e)
			info = `Couldn't get info: ${e}`
		}

		const url = await getIssueUrl(state?.log + '\n' + info)
		shell.open(url)
	}

	return (
		<Dialog open={state?.open} onOpenChange={(open) => setState({ ...state, open })}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('common.error-title')}</DialogTitle>
					<DialogDescription>{t('common.modal-error-body')}</DialogDescription>
				</DialogHeader>
				<div className="relative">
					<Textarea readOnly className="w-full max-h-20" dir="ltr" value={state?.log} />
					<CopyIcon
						className="w-6 h-6 z-10 right-4 bottom-4 absolute opacity-50 cursor-pointer stroke-foreground"
						onMouseDown={() => clipboard.writeText(state?.log ?? '')}
					/>
				</div>
				<div className="flex justify-center gap-3 mt-3">
					<Button onClick={clearLogAndReset}>{t('common.reset-app')}</Button>
					<Button variant="outline" onMouseDown={reportIssue}>
						{t('common.report-issue')}
					</Button>
				</div>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setState?.({ log: '', open: false })}>
						{t('common.modal-close')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
