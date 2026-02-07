<script>
	import { base } from '$app/paths'
	import Discord from '~/icons/Discord.svelte'
	import Github from '~/icons/Github.svelte'
	import Logo from '~/icons/Logo.svelte'
	import { i18n } from '~/lib/i18n'
	const t = $i18n.t
</script>

<div class="mx-auto mt-3 flex w-full items-center justify-between rounded-xl border border-border bg-card/70 px-3 py-2 lg:max-w-[1065px]">
	<div class="flex-1">
		<a href={base} class="v-btn v-btn-ghost text-sm lg:text-xl">
			<Logo />
			<span class="opacity-95">Vibe</span>
		</a>
	</div>
	<!-- links -->
	<ul class="flex-none px-1" dir="ltr">
		<a href={`https://github.com/thewh1teagle/vibe`} target="_blank">
			<Github width="28" height="28" />
		</a>
	</ul>
</div>
