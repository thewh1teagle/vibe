<script lang="ts">
	import Cta from '../components/Cta.svelte';
	import Meta from '../components/Meta.svelte';
</script>

<h1 class="text-3xl lg:text-6xl text-center capitalize">Transcribe. on Your Own.</h1>
<p
	class="mt-5 m-auto text-center max-w-[60%] lg:max-w-[600px] text-md leading-8 text-content opacity-50"
>
	Experience seamless language transcription with Vibe - your all-in-one solution for effortless
	audio and video transcription.
</p>
<div class="flex flex-col items-center mt-10">
	<Cta />
</div>
<div class="m-auto mt-16 w-[95%] lg:w-[1000px] h-auto">
	<img
		class="preview-hover-image rounded-2xl object-cover w-full h-auto"
		alt="preview"
		src="preview.png"
	/>
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
