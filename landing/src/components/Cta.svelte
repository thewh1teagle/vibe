<script lang="ts">
	import { onMount } from 'svelte'
	import { i18n } from '$lib/i18n'
	import LinuxIcon from '~/icons/Linux.svelte'
	import WindowsIcon from '~/icons/Windows.svelte'
	import MacIcon from '~/icons/Mac.svelte'
	import GithubIcon from '~/icons/Github.svelte'
	import ChipIcon from '~/icons/Chip.svelte'
	import latestRelease from '$lib/latest_release.json'
	import linuxInstallOptions from '$lib/linux_install_options.json'
	import mobile from 'is-mobile'

	let asset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === 'macos') // default to macos
	let ctaClicked = false

	const windowsAsset = latestRelease.assets.find((a) => a.platform?.toLocaleLowerCase() === 'windows')
	const linuxAsset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === 'linux')
	const macIntelAsset = latestRelease.assets.find((a) => a.platform?.toLocaleLowerCase() === 'macos' && a.arch === 'darwin-x86_64')
	const macSiliconAsset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === 'macos' && a.arch === 'darwin-aarch64')
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

	function changePlatform(newPlatform: 'linux' | 'windows' | 'macos') {
		asset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === newPlatform) // default to macos
		currentURL = location.href
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
		changePlatform(currentOs)
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

		<!--  windows -->
	{:else if asset?.platform.toLowerCase() === 'windows'}
		<a href={asset?.url} class="btn btn-primary hidden md:flex">
			<WindowsIcon />

			{t('download-for')}{asset?.platform}
		</a>

		<!-- linux -->
	{:else if asset?.platform.toLowerCase() === 'linux'}
		<button
			on:click={() => {
				// @ts-ignore
				window?.linux_download_model.showModal()
			}}
			class="btn btn-primary hidden md:flex">
			<LinuxIcon />
			{t('download-for')}{asset?.platform}
		</button>

		<dialog id="linux_download_model" class="modal">
			<div class="modal-box w-11/12 max-w-5xl">
				<h3 class="text-3xl font-bold">Install Vibe on Linux</h3>
				{#each linuxInstallOptions as installOption}
					<div class="mt-5">
						<div class="mb-2 text-3xl text-primary opacity-80">{installOption.title}</div>
						<code class="min-w-[700px] flex bg-[#2b2b2b] p-2 rounded-sm">{installOption.command.replace('{tag}', latestRelease.version)}</code>
					</div>
				{/each}
			</div>
			<form method="dialog" class="modal-backdrop">
				<button>close</button>
			</form>
		</dialog>
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
	<button on:mousedown={() => changePlatform('macos')}><MacIcon /></button>

	<button
		aria-label="Windows"
		on:click={() => {
			changePlatform('windows')
		}}
		class="">
		<WindowsIcon />
	</button>

	<button
		on:click={() => {
			changePlatform('linux')
		}}>
		<LinuxIcon />
	</button>
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
