<script lang="ts">
	import Cta from '../components/Cta.svelte';
	import Meta from '../components/Meta.svelte';
	import type { Metadata } from '../components/metadata';

	const metadata: Metadata = {
		title: 'Vibe',
		description: 'Transcribe on your own!',
		image: '/og.png',
		imageAlt: 'Vibe transcriber',
		url: 'https://thewh1teagle.github.io/vibe/',
		twitterCard: '/og.png',
		twitterImage: '/og.png',
		thumbnail: '/og.png'
	};
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
	<img class="rounded-2xl object-cover w-full h-auto" alt="preview" src="preview.png" />
</div>

<Meta {metadata} />
