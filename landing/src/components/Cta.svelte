<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n';
	import LinuxIcon from '~/icons/Linux.svelte';
	import WindowsIcon from '~/icons/Windows.svelte';
	import MacIcon from '~/icons/Mac.svelte';
	import GithubIcon from '~/icons/Github.svelte';
	import ChipIcon from '~/icons/Chip.svelte';
	import latestRelease from '$lib/latest_release.json';

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

	function getOS() {
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
		const currentOs = getOS();
		asset = latestRelease.assets.find((a) => a.platform.toLowerCase() === currentOs); // default to macos
	});
</script>

<div class="flex gap-3 flex-col lg:flex-row">
	{#if asset?.platform.toLowerCase() === 'macos'}
		<button on:mousedown={ctaClick} class="btn btn-primary hidden md:flex">
			<MacIcon />
			{$i18n.t('download-for')}{asset?.platform}
		</button>
	{:else}
		<a href={asset?.url} class="btn btn-primary hidden md:flex">
			{#if asset?.platform.toLowerCase() === 'linux'}
				<LinuxIcon />
			{:else if asset?.platform.toLowerCase() === 'windows'}
				<WindowsIcon />
			{/if}
			{$i18n.t('download-for')}{asset?.platform}
		</a>
	{/if}
	<a class="btn" href="https://github.com/thewh1teagle/vibe" target="_blank">
		<GithubIcon />
		{$i18n.t('star-on-github')}
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
			{$i18n.t('intel')}
		</a>
		<a class="btn btn-sm btn-outline" href={macSiliconAsset?.url}>
			<ChipIcon />
			{$i18n.t('apple-silicon')}
		</a>
	</div>
{/if}

<!-- platforms -->
<div class="flex gap-3 mt-4">
	<button on:mousedown={onMacLogoClick}><MacIcon /></button>

	<a aria-label="Windows" rel="noopener" href={windowsAsset?.url} class=""><WindowsIcon /></a>

	<a aria-label="Linux" rel="noopener" href={linuxAsset?.url}><LinuxIcon /></a>
</div>
