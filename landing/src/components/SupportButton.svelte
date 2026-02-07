<script>
	import Heart from '~/icons/Heart.svelte'
	import { Button } from '$lib/components/ui/button'

	import { i18n } from '$lib/i18n'

	const t = $i18n.t
</script>

<Button
	class="v-btn bg-red-500 text-white hover:bg-red-700"
	on:click={() => {
		// @ts-ignore
		window?.['kofi-dialog'].showModal()
	}}>
	{t('support-project')}
	<Heart />
</Button>
