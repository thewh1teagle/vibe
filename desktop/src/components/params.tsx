import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModifyState } from '~/lib/types'
import { InfoTooltip } from './info-tooltip'
import { ModelOptions as IModelOptions, usePreferenceProvider } from '~/providers/preference'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface ParamsProps {
	options: IModelOptions
	setOptions: ModifyState<IModelOptions>
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="space-y-2 w-full">
			<Label className="flex items-center gap-1">{label}</Label>
			{children}
		</div>
	)
}

export default function ModelOptions({ options, setOptions }: ParamsProps) {
	const [open, setOpen] = useState(false)
	const preference = usePreferenceProvider()
	const { t } = useTranslation()

	function parseIntOr(value: string, fallback: number) {
		const n = parseInt(value, 10)
		return Number.isNaN(n) ? fallback : n
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					className="mt-1 h-9 rounded-md border border-border/65 px-3 text-sm font-medium text-muted-foreground hover:bg-accent/45 hover:text-foreground">
					{t('common.more-options')}
				</Button>
			</DialogTrigger>
			<DialogContent className="flex h-[85vh] max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-border/60 bg-card/95 p-0 shadow-xl">
				<DialogHeader className="px-6 pb-3 pt-5">
					<p className="app-kicker">{t('common.more-options')}</p>
					<DialogTitle className="mt-1 text-2xl font-semibold">{t('common.more-options')}</DialogTitle>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1 px-6 pb-5 pt-2">
					<div className="space-y-6 pb-6">
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">{t('common.model-options')}</h3>

							<div className="flex items-center justify-between">
								<span className="text-sm font-medium flex items-center gap-1">
									<InfoTooltip text={t('common.info-translate-to-english')} />
									{t('common.translate-to-english')}
								</span>
								<Switch checked={Boolean(options.translate)} onCheckedChange={(checked) => setOptions({ ...options, translate: checked })} />
							</div>

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

							<div className="flex items-center justify-between">
								<span className="text-sm font-medium flex items-center gap-1">
									<InfoTooltip text={t('common.info-use-word-timestamps')} />
									{t('common.use-word-timestamps')}
								</span>
								<Switch checked={Boolean(options.word_timestamps)} onCheckedChange={(checked) => setOptions({ ...options, word_timestamps: checked })} />
							</div>

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
										value={preference.modelOptions.sampling_strategy}
										onValueChange={(value) =>
											preference.setModelOptions({ ...preference.modelOptions, sampling_strategy: value as 'greedy' | 'beam search' })
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
											<InfoTooltip text={preference.modelOptions.sampling_strategy === 'greedy'
												? "Top candidates in Greedy mode (default: 5) — higher = better accuracy, slower."
												: "Paths explored in Beam Search (default: 5) — higher = better accuracy, slower."} />
											{preference.modelOptions.sampling_strategy === 'greedy' ? 'Best of' : 'Beam size'}
										</>
									}>
									<Input
										type="number"
										step={1}
										value={preference.modelOptions.sampling_strategy === 'greedy'
											? (preference.modelOptions.best_of ?? 5)
											: (preference.modelOptions.beam_size ?? 5)}
										onChange={(e) => {
											const val = parseIntOr(e.target.value, 5)
											if (preference.modelOptions.sampling_strategy === 'greedy') {
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
