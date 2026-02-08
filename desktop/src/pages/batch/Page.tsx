import { useTranslation } from 'react-i18next'
import LanguageInput from '~/components/LanguageInput'
import Layout from '~/components/Layout'
import ModelOptions from '~/components/Params'
import BatchPanel from './BatchPanel'
import { viewModel } from './viewModel'
import { Button } from '~/components/ui/button'
import FormatMultiSelect from '~/components/FormatMultiSelect'

export default function BatchPage() {
	const vm = viewModel()
	const { t } = useTranslation()

	return (
		<Layout>
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
				<div className="app-panel space-y-4">
					<div className="space-y-1">
						<p className="app-kicker">{t('common.batch-transcribe', { defaultValue: 'Batch' })}</p>
						<h2 className="text-2xl font-semibold">{t('common.transcribe')} {t('common.files')}</h2>
					</div>
					<LanguageInput />
					<FormatMultiSelect setFormats={vm.setFormats} formats={vm.formats} />
					<ModelOptions options={vm.preference.modelOptions} setOptions={vm.preference.setModelOptions} />

					<div className="pt-2">
						<BatchPanel
							index={vm.currentIndex}
							inProgress={vm.inProgress}
							progress={vm.progress}
							onCancel={vm.cancel}
							isAborting={vm.isAborting}
							onStart={vm.start}
							files={vm.files}
						/>
						{!vm.inProgress && !vm.isAborting && (
							<Button variant="link" onMouseDown={vm.selectFiles} className="mt-2 px-0 text-xs">
								{t('common.change-files')}
							</Button>
						)}
					</div>
				</div>
			</div>
		</Layout>
	)
}
