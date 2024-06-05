<script lang="ts">
	import '~/app.css'
	import { i18n } from '$lib/i18n'
	import { isLoading } from 'svelte-i18next'
	import Nav from '~/components/Nav.svelte'
</script>

<div dir={$i18n.dir()}>
	<div>
		{#if $isLoading}
			<div></div>
		{:else}
			<Nav />
			<div class="mt-4 lg:mt-10 pb-16">
				<slot />
			</div>
		{/if}
	</div>
</div>
