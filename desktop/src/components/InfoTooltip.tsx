import InfoIcon from "../icons/Info";

export function InfoTooltip({ text }: { text: string }) {
    return (
        <div className="tooltip" data-tip={text}>
            <InfoIcon data-tooltip-place="top" className="w-5 h-5" />
        </div>
    )
}