import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import Layout from '~/components/layout'
import BatchPanel from './batch-panel'
import { viewModel } from './view-model'
import { Button } from '~/components/ui/button'
import FormatMultiSelect from '~/components/format-multi-select'

export default function BatchPage() {
	const vm = viewModel()

	return (
		<Layout>
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
				<div className="app-panel space-y-4">
					<div className="space-y-1">
					<p className="app-kicker">{m.batch()}</p>
						<h2 className="text-2xl font-semibold">{m.transcribe()} {m.files()}</h2>
					</div>
					<LanguageInput />
					<FormatMultiSelect setFormats={vm.setFormats} formats={vm.formats} />

					<div className="pt-2">
						<BatchPanel
							index={vm.currentIndex}
							inProgress={vm.inProgress}
							progress={vm.progress}
							onCancel={vm.cancel}
							isAborting={vm.isAborting}
							onStart={vm.start}
							files={vm.files}
							modelPath={vm.preference.modelPath}
						/>
						{!vm.preference.modelPath && (
							<p className="mt-2 text-center text-sm text-muted-foreground">{m.noModelSelected()}</p>
						)}
						{!vm.inProgress && !vm.isAborting && (
							<Button variant="link" onMouseDown={vm.selectFiles} className="mt-2 px-0 text-xs">
								{m.changeFiles()}
							</Button>
						)}
					</div>
				</div>
			</div>
		</Layout>
	)
}
