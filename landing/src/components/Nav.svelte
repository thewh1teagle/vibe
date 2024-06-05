<script>
	import { base } from '$app/paths'
	import Logo from '~/icons/Logo.svelte'
	import { i18n } from '~/lib/i18n'
	const t = $i18n.t
</script>

<div class="navbar bg-base-100 lg:flex lg:max-w-[1065px] mt-3 m-auto">
	<div class="flex-1">
		<a href={base} class="btn btn-ghost text-sm sm:btn-xs lg:btn-md lg:text-xl">
			<Logo />
			<span class="opacity-95">Vibe</span>
		</a>
	</div>
	<!-- links -->
	<ul class="flex-none menu menu-horizontal px-1" dir="ltr">
		<li>
			<a href={`${base}/features`}>{t('features')}</a>
		</li>
		<li>
			<a href="https://github.com/thewh1teagle/vibe" target="_blank">Github</a>
		</li>
	</ul>
</div>
