<script lang="ts">
	export let title: string
	export let description: string
	export let videoURL = ''
	export let imageURL = ''
</script>

<div>
	<div class="text-3xl font-medium">{title}</div>
	<div class="text-lg opacity-80 mt-6 mb-6">{description}</div>

	{#if imageURL}
		<img src={imageURL} alt="Image" class="rounded-lg" />
	{/if}

	{#if videoURL}
		<video src={videoURL} controls class="rounded-lg"></video>
	{/if}
</div>
