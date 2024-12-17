<script>
	import Heart from '~/icons/Heart.svelte'

	import { i18n } from '$lib/i18n'
	import { base } from '$app/paths'
	import SupportButton from './SupportButton.svelte'

	const t = $i18n.t
</script>

<dialog id="post-download-modal" class="modal">
	<div class="modal-box max-w-md mx-auto p-6">
		<form method="dialog">
			<button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
		</form>
		<h3 class="text-xl font-semibold text-center">{t('your-download-is-starting')}</h3>
		<p class="py-2 opacity-50 text-sm text-center">{t('download-starting-description')}</p>
		<p class="text-center text-sm mt-5">{t('support-while-you-wait')}</p>
		<div class="flex justify-center mt-4">
			<SupportButton />
		</div>
	</div>
</dialog>
