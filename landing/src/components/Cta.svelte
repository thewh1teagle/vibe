<script lang="ts">
	import latestRelease from '$lib/latest_release.json';
	import { onMount } from 'svelte';

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
			return 'macos';
		}
		if (platform?.includes('linux')) {
			return 'linux';
		}
		return 'macos';
	}

	onMount(() => {
		const currentOs = getOs();
		asset = latestRelease.assets.find((a) => a.platform.toLowerCase() === currentOs); // default to macos
	});
</script>

<div class="flex gap-3 flex-col lg:flex-row">
	<button on:click={ctaClick} class="btn btn-primary">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 384 512"
			width="1rem"
			height="1rem"
			fill="currentColor"
			><path
				d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
			></path></svg
		>
		Download For {asset?.platform}
	</button>
	<a class="btn" href="https://github.com/thewh1teagle/vibe" target="_blank">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width="1em"
			height="1em"
			fill="currentColor"
			><path
				d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
			></path></svg
		> Star On Github
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
	<button on:click={ctaClick}
		><svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 384 512"
			width="1em"
			height="1em"
			fill="currentColor"
			class="h-[24px] w-[24px] text-white opacity-90"
			><path
				d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
			></path></svg
		></button
	>

	<a aria-label="Windows" rel="noopener" href={windowsAsset?.url} class=""
		><svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			fill="currentColor"
			viewBox="0 0 256 256"
			class="h-[24px] w-[24px] text-white opacity-90"
			><path
				d="M112,144v51.64a8,8,0,0,1-8,8,8.54,8.54,0,0,1-1.43-.13l-64-11.64A8,8,0,0,1,32,184V144a8,8,0,0,1,8-8h64A8,8,0,0,1,112,144Zm-2.87-89.78a8,8,0,0,0-6.56-1.73l-64,11.64A8,8,0,0,0,32,72v40a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V60.36A8,8,0,0,0,109.13,54.22ZM216,136H136a8,8,0,0,0-8,8v57.45a8,8,0,0,0,6.57,7.88l80,14.54A7.61,7.61,0,0,0,216,224a8,8,0,0,0,8-8V144A8,8,0,0,0,216,136Zm5.13-102.14a8,8,0,0,0-6.56-1.73l-80,14.55A8,8,0,0,0,128,54.55V112a8,8,0,0,0,8,8h80a8,8,0,0,0,8-8V40A8,8,0,0,0,221.13,33.86Z"
			></path></svg
		></a
	>

	<a aria-label="Linux" rel="noopener" href={linuxAsset?.url} class=""
		><svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			fill="currentColor"
			viewBox="0 0 256 256"
			class="h-[24px] w-[24px] text-white opacity-90"
			><path
				d="M161.22,217.74a4,4,0,0,1-3.31,6.26H98.1a4,4,0,0,1-3.31-6.26,40,40,0,0,1,66.43,0Zm68.93,3.37a8.29,8.29,0,0,1-6.43,2.89H184.56a4,4,0,0,1-3.76-2.65,56,56,0,0,0-105.59,0A4,4,0,0,1,71.45,224H32.23a8.2,8.2,0,0,1-6.42-2.93A8,8,0,0,1,25.75,211c.06-.07,7.64-9.78,15.12-28.72C47.77,164.8,56,135.64,56,96a72,72,0,0,1,144,0c0,39.64,8.23,68.8,15.13,86.28,7.48,18.94,15.06,28.65,15.13,28.74A8,8,0,0,1,230.15,221.11ZM88,108a12,12,0,1,0,12-12A12,12,0,0,0,88,108Zm79.16,32.42a8,8,0,0,0-10.73-3.58L128,151.06,99.58,136.84a8,8,0,0,0-7.15,14.32l32,16a8,8,0,0,0,7.15,0l32-16A8,8,0,0,0,167.16,140.42ZM168,108a12,12,0,1,0-12,12A12,12,0,0,0,168,108Z"
			></path></svg
		></a
	>
</div>
