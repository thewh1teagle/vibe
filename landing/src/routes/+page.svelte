<script lang="ts">
	import Cta from '~/components/Cta.svelte'
	import Meta from '~/components/Meta.svelte'
	import { i18n } from '$lib/i18n'
</script>

<h1 class="text-3xl lg:text-6xl text-center capitalize">{$i18n.t('title')}</h1>
<p class="mt-5 m-auto text-center max-w-[78%] lg:max-w-[600px] text-md leading-8 text-content opacity-50">
	{$i18n.t('description')}
</p>
<div class="flex flex-col items-center mt-10">
	<Cta />
</div>
<div class="m-auto mt-16 w-[95%] lg:w-[1000px] h-auto">
	<img class="preview-hover-image rounded-2xl object-cover w-full h-auto" alt="preview" src="preview.png" />
</div>

<Meta />

<style lang="postcss">
	.preview-hover-image {
		transition:
			transform 0.55s ease-in-out,
			translateY 0.53s ease-in-out;
	}

	.preview-hover-image:hover {
		transform: scale(1.03) translateY(-4px);
	}

	.preview-hover-image:not(:hover) {
		transform: scale(1) translateY(0);
	}
</style>
