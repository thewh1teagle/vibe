<script>
	import { base } from '$app/paths'
	import features from '~/lib/features.json'
	import Feature from './feature.svelte'
</script>

<div class="max-w-[81%] lg:max-w-[680px] m-auto" dir="ltr">
	<div class="text-4xl font-bold">Features</div>

	<div class="flex flex-col gap-28 mt-14">
		{#each features as feature}
			<Feature {...feature} />
		{/each}
	</div>
</div>
