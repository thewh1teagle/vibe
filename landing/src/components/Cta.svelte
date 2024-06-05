<script lang="ts">
	import { onMount } from 'svelte'
	import { i18n } from '$lib/i18n'
	import LinuxIcon from '~/icons/Linux.svelte'
	import WindowsIcon from '~/icons/Windows.svelte'
	import MacIcon from '~/icons/Mac.svelte'
	import GithubIcon from '~/icons/Github.svelte'
	import ChipIcon from '~/icons/Chip.svelte'
	import latestRelease from '$lib/latest_release.json'
	import mobile from 'is-mobile'

	let asset = latestRelease.assets.find((a) => a.platform.toLowerCase() === 'macos') // default to macos
	let ctaClicked = false

	const windowsAsset = latestRelease.assets.find((a) => a.platform.toLocaleLowerCase() === 'windows')
	const linuxAsset = latestRelease.assets.find((a) => a.platform.toLowerCase() === 'linux')
	const macIntelAsset = latestRelease.assets.find((a) => a.platform.toLocaleLowerCase() === 'macos' && a.arch === 'darwin-x86_64')
	const macSiliconAsset = latestRelease.assets.find((a) => a.platform.toLowerCase() === 'macos' && a.arch === 'darwin-aarch64')
	let mobileModalOpen = false

	let isMobile = false

	function ctaClick() {
		if (isMobile) {
			// is mobile
			mobileModalOpen = true
		} else {
			const platform = asset?.platform.toLowerCase()
			if (platform == 'macos') {
				ctaClicked = true
			} else if (platform == 'windows') {
				window.open(windowsAsset?.url, '_blank')
			} else if (platform === 'linux') {
				window.open(linuxAsset?.url, '_blank')
			}
		}
	}

	function getOS() {
		const platform = navigator.platform?.toLowerCase()
		if (platform?.includes('win')) {
			return 'windows'
		}
		if (platform?.includes('linux')) {
			return 'linux'
		}
		return 'macos'
	}

	function onMacLogoClick() {
		ctaClicked = true
		asset = macSiliconAsset
	}

	let currentURL = ''

	onMount(async () => {
		const currentOs = getOS()
		asset = latestRelease.assets.find((a) => a.platform.toLowerCase() === currentOs) // default to macos
		currentURL = location.href
	})

	onMount(() => {
		isMobile = mobile() || window.screen.width < 480
	})

	const t = $i18n.t
</script>

<div class="flex gap-3 flex-col lg:flex-row">
	<!-- mobile cta open modal -->
	{#if isMobile}
		<button on:mousedown={ctaClick} class="btn btn-primary">
			{t('download')}
		</button>
		<!-- macOS cta -->
	{:else if asset?.platform.toLowerCase() === 'macos'}
		<button on:mousedown={ctaClick} class="btn btn-primary hidden lg:flex">
			<MacIcon />
			{t('download-for')}{asset?.platform}
		</button>
		<!-- linux / windows -->
	{:else}
		<a href={asset?.url} class="btn btn-primary hidden md:flex">
			{#if asset?.platform.toLowerCase() === 'linux'}
				<LinuxIcon />
			{:else if asset?.platform.toLowerCase() === 'windows'}
				<WindowsIcon />
			{/if}
			{t('download-for')}{asset?.platform}
		</a>
	{/if}

	<a class="btn" href="https://github.com/thewh1teagle/vibe" target="_blank">
		<GithubIcon width="18" height="18" />
		{t('star-on-github')}
	</a>
</div>
<!-- version -->
<div class="text-sm opacity-40 text-center mt-2">
	{latestRelease.version}
</div>
<!-- macos architectures -->
{#if asset?.platform.toLocaleLowerCase() == 'macos' && ctaClicked}
	<div class="flex gap-2 mt-3">
		<a class="btn btn-sm btn-outline" href={macIntelAsset?.url}>
			<ChipIcon />
			{t('intel')}
		</a>
		<a class="btn btn-sm btn-outline" href={macSiliconAsset?.url}>
			<ChipIcon />
			{t('apple-silicon')}
		</a>
	</div>
{/if}

<!-- platforms -->
<div class="flex gap-3 mt-4">
	<button on:mousedown={onMacLogoClick}><MacIcon /></button>

	<a aria-label="Windows" rel="noopener" href={windowsAsset?.url} class=""><WindowsIcon /></a>

	<a aria-label="Linux" rel="noopener" href={linuxAsset?.url}><LinuxIcon /></a>
</div>

<dialog class="modal" class:modal-open={mobileModalOpen}>
	<div class="modal-box">
		<h3 class="font-bold text-lg text-center">{t('download-on-pc')}</h3>
		<p class="py-4 text-center">{t('available-for')} macOS / Windows / Linux</p>
		<div class="flex justify-center">
			<button on:click={() => navigator.clipboard.writeText(currentURL)} class="btn btn-primary">{t('copy-download-link')}</button>
		</div>

		<div class="modal-action">
			<form method="dialog">
				<button on:click={() => (mobileModalOpen = false)} class="btn btn-ghost">{t('cancel')}</button>
			</form>
		</div>
	</div>
</dialog>
