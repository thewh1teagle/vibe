<script>
	import Github from '~/icons/Github.svelte'
	import { i18n } from '$lib/i18n'
	import { base } from '$app/paths'
	import PrivacyPolicy from './PrivacyPolicy.svelte'
	import KofiDialog from './KofiDialog.svelte'
	import Discord from '~/icons/Discord.svelte'

	const t = $i18n.t
</script>

<footer class="mt-36 rounded-xl border border-border bg-card/60 p-10 text-foreground">
	<PrivacyPolicy />
	<KofiDialog />

	<nav class="flex flex-row flex-wrap justify-center gap-4">
		<a class="v-link" href={base}>{t('home')}</a>
		<button
			on:click={() => {
				// @ts-ignore
				window?.['kofi-dialog'].showModal()
			}}
			class="v-link">{t('support-vibe')}</button>
		<button
			on:click={() => {
				// @ts-ignore
				window['privacy-policy-modal']?.showModal()
			}}
			class="v-link">{t('privacy-policy')}</button>
		<a class="v-link" href={`${base}/features`}>{t('features')}</a>

		<a class="v-link" href="/vibe/docs">{t('documentation')}</a>
	</nav>
	<nav class="mt-6">
		<div class="flex items-center gap-4">
			<a href="https://github.com/thewh1teagle/vibe" target="_blank">
				<Github width="24" height="24" />
			</a>
			<div class="h-6 w-px bg-border"></div>
			<a href={`https://discord.gg/EcxWSstQN8`} target="_blank">
				<Discord />
			</a>
		</div>
	</nav>
	<aside class="mt-4 text-center text-sm text-muted-foreground">
		<p>Vibe - {t('title')}</p>
	</aside>
</footer>
