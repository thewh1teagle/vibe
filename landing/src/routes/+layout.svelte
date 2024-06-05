<script lang="ts">
	import '~/app.css'
	import { i18n } from '$lib/i18n'
	import { isLoading } from 'svelte-i18next'
	import Nav from '~/components/Nav.svelte'
	import Footer from '~/components/Footer.svelte'
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
			<Footer />
		{/if}
	</div>
</div>
