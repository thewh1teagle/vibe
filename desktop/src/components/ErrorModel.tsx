import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorModalContext } from '~/providers/ErrorModalProvider'
import { cx, getAppInfo, getIssueUrl, resetApp } from '~/lib/utils'
import * as shell from '@tauri-apps/plugin-shell'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'

export default function ErrorModal() {
	const { t } = useTranslation()
	const { state, setState } = useContext(ErrorModalContext)

	async function clearLogAndReset() {
		setState?.({ open: false, log: '' })
		resetApp()
	}
	async function reportIssue() {
		let info = ''
		try {
			info = await getAppInfo()
		} catch (e) {
			console.error(e)
			info = `Couldn't get info: ${e}`
		}

		const url = await getIssueUrl(state?.log + '\n' + info)
		shell.open(url)
	}

	return (
		<dialog id="modal-error" className={cx('modal', state?.open && 'modal-open')}>
			<div className="modal-box">
				<h3 className="font-bold text-lg">{t('error-title')}</h3>
				<p className="py-4">{t('modal-error-body')}</p>
				<div className="relative">
					<textarea readOnly className="w-full rounded-lg p-3 max-h-20 textarea textarea-bordered" dir="ltr" value={state?.log} />
					<CopyIcon onMouseDown={() => navigator.clipboard.writeText(state?.log ?? '')} />
				</div>
				<div className="flex justify-center gap-3 mt-3">
					<button onClick={clearLogAndReset} className="btn btn-primary cursor-pointer">
						{t('reset-app')}
					</button>
					<button onMouseDown={reportIssue} className="btn btn-outline">
						{t('report-issue')}
					</button>
				</div>
				<div className="modal-action">
					<form method="dialog">
						<button onClick={() => setState?.({ log: '', open: false })} className="btn cursor-pointer">
							{t('modal-close')}
						</button>
					</form>
				</div>
			</div>
		</dialog>
	)
}
