<script lang="ts">
	import { base } from '$app/paths'

	export let title: string
	export let description: string
	export let videoURL = ''
	export let imageURL = ''
	export let align: string = 'start'
</script>

<div>
	<div class="text-2xl font-medium">{title}</div>
	<div class="text-lg opacity-80 mt-6 mb-6">{description}</div>

	{#if imageURL}
		<div class="flex {align}">
			<img src={`${base}${imageURL}`} alt="Image" class="rounded-lg" />
		</div>
	{/if}

	{#if videoURL}
		<div class="flex items-center {align}">
			<video src={`${base}${videoURL}`} controls class="rounded-lg"></video>
		</div>
	{/if}
</div>

<style>
	.start {
		justify-content: flex-start;
	}
	.center {
		justify-content: center;
	}
	.end {
		justify-content: flex-end;
	}
</style>
