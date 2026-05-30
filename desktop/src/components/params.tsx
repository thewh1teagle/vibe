import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModifyState } from '~/lib/types'
import { InfoTooltip } from './info-tooltip'
import { SlidersHorizontal } from 'lucide-react'
import { ModelOptions as IModelOptions } from '~/providers/preference'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface ParamsProps {
	options: IModelOptions
	setOptions: ModifyState<IModelOptions>
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="space-y-1 w-full">
			<Label className="flex items-center gap-1 text-sm">{label}</Label>
			{children}
		</div>
	)
}

function parseIntOr(value: string, fallback: number) {
	const n = parseInt(value, 10)
	return Number.isNaN(n) ? fallback : n
}

export default function ModelOptions({ options, setOptions }: ParamsProps) {
	const [open, setOpen] = useState(false)
	const { t } = useTranslation()

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					className="h-9 w-9 rounded-md border border-border/65 text-muted-foreground hover:bg-accent/45 hover:text-foreground"
					aria-label={t('common.more-options')}>
					<SlidersHorizontal className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="fixed inset-0 left-0 top-0 flex !h-screen !w-screen !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none !border-0 !bg-background !p-0 !shadow-none !max-h-screen">
				<div className="flex items-center justify-between px-6 pt-6 pb-2">
					<DialogTitle className="text-lg font-semibold">{t('common.model-options')}</DialogTitle>
				</div>
				<ScrollArea className="min-h-0 flex-1 px-6 pb-6">
					<div className="space-y-3">
						<div className="space-y-3">

							<Field
								label={
									<>
										<InfoTooltip text={t('common.info-prompt')} />
										{t('common.prompt')} ({t('common.leftover')} {1024 - (options?.init_prompt?.length ?? 0)} {t('common.characters')})
									</>
								}>
								<Textarea
									value={options?.init_prompt}
									onChange={(e) => setOptions({ ...options, init_prompt: e.target.value.slice(0, 1024) })}
									className="min-h-[80px]"
								/>
							</Field>

							<div className="grid grid-cols-2 gap-4">
								<Field
									label={
										<>
											<InfoTooltip text={t('common.info-max-sentence-len')} />
											{t('common.max-sentence-len')}
										</>
									}>
									<Input
										type="number"
										value={options.max_sentence_len}
										onChange={(e) => {
											setOptions({ ...options, max_sentence_len: parseIntOr(e.target.value, 1) })
										}}
									/>
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={t('common.info-threads')} />
											{t('common.threads')}
										</>
									}>
									<Input type="number" value={options.n_threads} onChange={(e) => setOptions({ ...options, n_threads: parseIntOr(e.target.value, 1) })} />
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={t('common.info-temperature')} />
											{t('common.temperature')}
										</>
									}>
									<Input
										type="number"
										step={0.1}
										value={options.temperature}
										onChange={(e) => setOptions({ ...options, temperature: parseFloat(e.target.value) || 0 })}
									/>
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={t('common.info-max-text-ctx')} />
											{t('common.max-text-ctx')}
										</>
									}>
									<Input
										type="number"
										step={1}
										value={options.max_text_ctx ?? 0}
										onChange={(e) => setOptions({ ...options, max_text_ctx: parseIntOr(e.target.value, 0) })}
									/>
								</Field>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<Field
									label={
										<>
											<InfoTooltip text="Greedy vs Beam Search: Default is Beam Search (Size 5, Patience -1), which evaluates 5 possible sequences at each step for more accurate results, but is slower. Greedy, on the other hand, selects the best token from the top 5 at each step, making it faster but potentially less accurate." />
											{t('common.sampling-strategy')}
										</>
									}>
								<Select
									value={options.sampling_strategy}
									onValueChange={(value) =>
										setOptions({ ...options, sampling_strategy: value as 'greedy' | 'beam search' })
									}>
										<SelectTrigger className="capitalize">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{['beam search', 'greedy'].map((name) => (
												<SelectItem key={name} value={name} className="capitalize">
													{name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={options.sampling_strategy === 'greedy'
												? "Top candidates in Greedy mode (default: 5) — higher = better accuracy, slower."
												: "Paths explored in Beam Search (default: 5) — higher = better accuracy, slower."} />
											{options.sampling_strategy === 'greedy' ? 'Best of' : 'Beam size'}
										</>
									}>
									<Input
										type="number"
										step={1}
										value={options.sampling_strategy === 'greedy'
											? (options.best_of ?? 5)
											: (options.beam_size ?? 5)}
										onChange={(e) => {
											const val = parseIntOr(e.target.value, 5)
											if (options.sampling_strategy === 'greedy') {
												setOptions({ ...options, best_of: val })
											} else {
												setOptions({ ...options, beam_size: val })
											}
										}}
									/>
								</Field>
							</div>
						</div>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	)
}
