<script lang="ts">
	import { onMount } from 'svelte'
	import DocViewer from './DocViewer.svelte'

	// List of available documentation files
	const docs = [
		{ name: 'Install', url: '/vibe/docs/install.md' },
		{ name: 'Models', url: '/vibe/docs/models.md' },
		{ name: 'Debug', url: '/vibe/docs/debug.md' },
		{ name: 'Build', url: '/vibe/docs/building.md' },
	]

	// Set default selected document based on hash or default to the first doc
	let url: string
	onMount(() => {
		url = window.location.hash ? getDocUrl(window.location.hash) : docs[0].url
		// Watch for hash changes
		window.addEventListener('hashchange', () => {
			url = getDocUrl(window.location.hash)
		})
	})

	// Helper function to get the corresponding URL for a hash
	function getDocUrl(hash: string) {
		const docName = hash.replace('#', '') // Remove '#' from the hash
		const doc = docs.find((d) => d.name.toLowerCase() === docName.toLowerCase())
		return doc ? doc.url : docs[0].url // Default to the first doc if not found
	}
</script>

<div class="max-w-[81%] lg:max-w-[680px] m-auto" dir="ltr">
	<h1 class="text-4xl font-bold mb-6">Vibe Documentation</h1>

	<!-- Navigation -->
	<div class="tabs tabs-boxed mb-8">
		{#each docs as doc}
			<button
				class="tab {url === doc.url ? 'tab-active' : ''}"
				on:click={() => {
					url = doc.url
					window.location.hash = doc.name.toLowerCase() // Update hash
				}}>
				{doc.name}
			</button>
		{/each}
	</div>

	<!-- Content Area -->
	<div>
		<DocViewer {url} />
	</div>
</div>

<style>
	.tabs {
		justify-content: center;
	}
</style>
