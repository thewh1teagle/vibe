<script>
	import Heart from '~/icons/Heart.svelte'

	import { i18n } from '$lib/i18n'
	import { base } from '$app/paths'
	import SupportButton from './SupportButton.svelte'

	const t = $i18n.t
</script>

<dialog id="post-download-modal" class="v-dialog w-[92vw] max-w-md p-0">
	<div class="relative mx-auto p-6">
		<form method="dialog">
			<button class="v-btn v-btn-ghost v-btn-icon absolute right-2 top-2">✕</button>
		</form>
		<h3 class="text-xl font-semibold text-center">{t('your-download-is-starting')}</h3>
		<p class="py-2 text-sm text-center text-muted-foreground">{t('download-starting-description')}</p>
		<p class="text-center text-sm mt-5">{t('support-while-you-wait')}</p>
		<div class="flex justify-center mt-4">
			<SupportButton />
		</div>
	</div>
</dialog>
