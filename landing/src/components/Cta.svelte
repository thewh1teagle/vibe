<script lang="ts">
	import latestRelease from '$lib/latest_release.json';
	import { onMount } from 'svelte';
	import LinuxIcon from './LinuxIcon.svelte';
	import WindowsIcon from './WindowsIcon.svelte';
	import MacIcon from './MacIcon.svelte';
	import GithubIcon from './GithubIcon.svelte';
	let isMobile: undefined | boolean = false;

	let asset = latestRelease.assets.find((a) => a.platform.toLowerCase() === 'macos'); // default to macos
	let ctaClicked = false;

	const windowsAsset = latestRelease.assets.find(
		(a) => a.platform.toLocaleLowerCase() === 'windows'
	);
	const linuxAsset = latestRelease.assets.find((a) => a.platform.toLowerCase() === 'linux');
	const macIntelAsset = latestRelease.assets.find(
		(a) => a.platform.toLocaleLowerCase() === 'macos' && a.arch === 'darwin-x86_64'
	);
	const macSiliconAsset = latestRelease.assets.find(
		(a) => a.platform.toLowerCase() === 'macos' && a.arch === 'darwin-aarch64'
	);

	function ctaClick() {
		const platform = asset?.platform.toLowerCase();
		if (platform == 'macos') {
			ctaClicked = true;
		} else if (platform == 'windows') {
			window.open(windowsAsset?.url, '_blank');
		} else if (platform === 'linux') {
			window.open(linuxAsset?.url, '_blank');
		}
	}

	function getOs() {
		const platform = navigator.platform?.toLowerCase();
		if (platform?.includes('win')) {
			return 'windows';
		}
		if (platform?.includes('linux')) {
			return 'linux';
		}
		return 'macos';
	}

	function onMacLogoClick() {
		ctaClicked = true;
		asset = macSiliconAsset;
	}

	onMount(async () => {
		const Device: Device = (await import('svelte-device-info')) as any;
		isMobile = Device?.isMobile;
		const currentOs = getOs();
		asset = latestRelease.assets.find((a) => a.platform.toLowerCase() === currentOs); // default to macos
	});
</script>

<div class="flex gap-3 flex-col lg:flex-row">
	{#if !isMobile}
		<button on:click={ctaClick} class="btn btn-primary">
			{#if asset?.platform.toLowerCase() === 'linux'}
				<LinuxIcon />
			{:else if asset?.platform.toLowerCase() === 'windows'}
				<WindowsIcon />
			{:else}
				<MacIcon />
			{/if}
			Download For {asset?.platform}
		</button>
	{/if}
	<a class="btn" href="https://github.com/thewh1teagle/vibe" target="_blank">
		<GithubIcon />
		Star On Github
	</a>
</div>
<!-- version -->
<div class="text-sm opacity-40 text-center mt-2">
	{latestRelease.version}
</div>
<!-- macos architectures -->
{#if asset?.platform.toLocaleLowerCase() == 'macos' && ctaClicked}
	<div class="flex gap-2 mt-3">
		<a class="btn btn-sm btn-outline" href={macIntelAsset?.url} target="_blank">Intel</a>
		<a class="btn btn-sm btn-outline" href={macSiliconAsset?.url} target="_blank">Apple Silicon</a>
	</div>
{/if}

<!-- platforms -->
<div class="flex gap-3 mt-4">
	<button on:click={onMacLogoClick}><MacIcon /></button>

	<a aria-label="Windows" rel="noopener" href={windowsAsset?.url} class=""><WindowsIcon /></a>

	<a aria-label="Linux" rel="noopener" href={linuxAsset?.url}><LinuxIcon /></a>
</div>
