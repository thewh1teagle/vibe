<script>
	import Github from '~/icons/Github.svelte'
	import { i18n } from '$lib/i18n'
	import { base } from '$app/paths'

	const t = $i18n.t
</script>

<footer class="footer footer-center mt-36 p-10 bg-base-200 text-base-content rounded">
	<nav class="grid grid-flow-col gap-4">
		<a class="link link-hover" href={base}>{t('home')}</a>
		<a class="link link-hover" href={`${base}/features`}>{t('features')}</a>
		<a class="link link-hover" href="https://github.com/thewh1teagle/vibe" target="_blank">Github</a>
		<a class="link link-hover" href="https://github.com/sponsors/thewh1teagle" target="_blank">{t('support-vibe')}</a>
	</nav>
	<nav>
		<div class="grid grid-flow-col gap-4">
			<a href="https://github.com/thewh1teagle/vibe" target="_blank">
				<Github width="24" height="24" />
			</a>
		</div>
	</nav>
	<aside>
		<p>Vibe - {t('title')}</p>
	</aside>
</footer>
