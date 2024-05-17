import { ReactComponent as InfoIcon } from '~/icons/info.svg'

export function InfoTooltip({ text }: { text: string }) {
	return (
		<div className="tooltip" data-tip={text}>
			<InfoIcon data-tooltip-place="top" />
		</div>
	)
}
