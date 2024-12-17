<script>
	import Heart from '~/icons/Heart.svelte'

	import { i18n } from '$lib/i18n'

	const t = $i18n.t
</script>

<button
	class="btn btn-primary bg-red-500 hover:bg-red-800"
	on:click={() => {
		// @ts-ignore
		window?.['kofi-dialog'].showModal()
	}}>
	{t('support-project')}
	<Heart />
</button>
