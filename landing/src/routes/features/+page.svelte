<script>
	import Feature from './feature.svelte'
	import features from '~/lib/features.json'
</script>

<div class="max-w-[78%] lg:max-w-[600px] m-auto" dir="ltr">
	<div class="text-4xl font-bold">Features</div>

	<div class="flex flex-col gap-32 mt-14">
		{#each features as feature}
			<div>
				<h2 class="text-2xl font-bold">{feature.title}</h2>
				<p class="mt-2">{feature.description}</p>
				{#if feature.imageURL}
					<img src={feature.imageURL} alt={feature.title} class="mt-4 rounded-lg" />
				{/if}
				<!-- {#if feature.videoURL}
					<video src={feature.videoURL} class="mt-4 rounded-lg" />
				{/if} -->
			</div>
		{/each}
	</div>
</div>
