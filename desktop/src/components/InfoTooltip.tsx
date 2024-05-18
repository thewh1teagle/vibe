import { ReactComponent as InfoIcon } from '~/icons/info.svg'

export function InfoTooltip({ text }: { text: string }) {
	return (
		<div className="tooltip" data-tip={text}>
			<InfoIcon className="w-5 h-5" data-tooltip-place="top" />
		</div>
	)
}
