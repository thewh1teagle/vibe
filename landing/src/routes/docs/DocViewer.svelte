<script lang="ts">
	import { marked } from 'marked'

	import { onMount } from 'svelte'

	let markdown = 'Loading...' // Initial loading message
	export let url: string

	$: if (url) {
		loadContent(url)
	}

	async function loadContent(url: string) {
		if (!url) {
			markdown = 'No document selected.'
			return
		}
		try {
			markdown = 'Loading...' // Show loading state
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
			}
			markdown = await marked(await response.text())
		} catch (error) {
			console.error('Error loading document:', error)
			markdown = 'Failed to load document.'
		}
	}
</script>

<div class="h-100vh">
	<div class="markdown">{@html marked(markdown)}</div>
</div>

<style lang="scss">
	.markdown {
		:global(h1) {
			font-size: 36px !important;
			font-weight: bold;
			margin-bottom: 16px;

			@media (max-width: 768px) {
				font-size: 28px !important;
				margin-bottom: 14px;
			}

			@media (max-width: 480px) {
				font-size: 24px !important;
				margin-bottom: 12px;
			}
		}

		:global(h2) {
			font-size: 30px !important;
			font-weight: bold;
			margin-bottom: 14px;

			@media (max-width: 768px) {
				font-size: 24px !important;
				margin-bottom: 12px;
			}

			@media (max-width: 480px) {
				font-size: 20px !important;
				margin-bottom: 10px;
			}
		}

		:global(h3) {
			font-size: 24px !important;
			font-weight: bold;
			margin-bottom: 12px;

			@media (max-width: 768px) {
				font-size: 20px !important;
				margin-bottom: 10px;
			}

			@media (max-width: 480px) {
				font-size: 18px !important;
				margin-bottom: 8px;
			}
		}

		:global(h4) {
			font-size: 20px !important;
			font-weight: bold;
			margin-bottom: 10px;

			@media (max-width: 768px) {
				font-size: 18px !important;
				margin-bottom: 8px;
			}

			@media (max-width: 480px) {
				font-size: 16px !important;
				margin-bottom: 6px;
			}
		}

		:global(h5) {
			font-size: 16px !important;
			font-weight: bold;
			margin-bottom: 8px;

			@media (max-width: 768px) {
				font-size: 14px !important;
				margin-bottom: 6px;
			}

			@media (max-width: 480px) {
				font-size: 13px !important;
				margin-bottom: 4px;
			}
		}

		:global(h6) {
			font-size: 14px !important;
			font-weight: bold;
			margin-bottom: 6px;

			@media (max-width: 768px) {
				font-size: 13px !important;
				margin-bottom: 4px;
			}

			@media (max-width: 480px) {
				font-size: 12px !important;
				margin-bottom: 2px;
			}
		}

		:global(p) {
			font-size: 16px;
			line-height: 1.6;
			margin-bottom: 16px;

			@media (max-width: 768px) {
				font-size: 14px;
				line-height: 1.5;
				margin-bottom: 14px;
			}

			@media (max-width: 480px) {
				font-size: 13px;
				line-height: 1.4;
				margin-bottom: 12px;
			}
		}

		:global(ul),
		:global(ol) {
			margin-bottom: 16px;
			padding-left: 20px;
		}

		:global(li) {
			font-size: 16px;
			line-height: 1.6;
			margin-bottom: 8px;
		}

		:global(blockquote) {
			font-size: 18px;
			font-style: italic;
			border-left: 4px solid #ccc;
			padding-left: 16px;
			margin-bottom: 16px;
			color: #555;
		}

		:global(code),
		:global(pre) {
			font-family: 'Courier New', monospace;
			background-color: #272727;
			border-radius: 4px;
			padding: 2px 5px;
		}

		/* Dark mode */
		@media (prefers-color-scheme: dark) {
			:global(pre),
			:global(code) {
				background-color: #272727;
				color: #f4f4f4;
			}
		}

		/* Light mode */
		@media (prefers-color-scheme: light) {
			:global(pre),
			:global(code) {
				background-color: #ffffff;
				color: #333333;
			}
		}

		:global(pre) {
			padding: 8px;
			overflow-x: auto;
		}

		:global(a) {
			color: #1e90ff;
			text-decoration: none;
		}

		:global(a:hover) {
			text-decoration: underline;
		}

		:global(img) {
			max-width: 100%;
			height: auto;
			display: block;
			margin: 0 auto;
		}

		:global(strong) {
			font-weight: bold;
		}

		:global(em) {
			font-style: italic;
		}
	}
</style>
