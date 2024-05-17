<script lang="ts">
	import '~/app.css';
	import { i18n } from '$lib/i18n';
	import { isLoading } from 'svelte-i18next';
</script>

<div dir={$i18n.dir()}>
	<div class="mt-24 pb-16">
		{#if $isLoading}
			<div></div>
		{:else}
			<slot />
		{/if}
	</div>
</div>
