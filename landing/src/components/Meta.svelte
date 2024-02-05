<script lang="ts">
	import type { Metadata } from './metadata';

	export let metadata: Metadata = {
		title: '',
		description: '',
		image: '',
		imageAlt: '',
		url: ''
	};
</script>

<svelte:head>
	{#if metadata.title}
		<title>{metadata.title}</title>
		<meta name="title" content={metadata.title} />
		<meta property="og:title" content={metadata.title} />
		<meta property="twitter:title" content={metadata.title} />
	{/if}

	{#if metadata.description}
		<meta name="description" content="Page Description" />
		<meta property="og:description" content="Page Description" />
		<meta property="twitter:description" content="Page Description" />
	{/if}

	{#if metadata.image}
		<meta property="og:image" content={metadata.thumbnail} />
		<meta property="twitter:image" content={metadata.twitterImage} />
	{/if}

	{#if metadata.imageAlt}
		<meta property="og:image:alt" content={metadata.imageAlt} />
		<meta property="twitter:image:alt" content={metadata.imageAlt} />
	{/if}

	{#if metadata.url}
		<meta property="og:url" content={metadata.url} />
		<meta property="twitter:url" content={metadata.url} />
	{/if}

	{#if metadata.type}
		<meta property="og:type" content={metadata.type} />
	{/if}

	<meta property="twitter:card" content={metadata.twitterCard || 'summary_large_image'} />
</svelte:head>
