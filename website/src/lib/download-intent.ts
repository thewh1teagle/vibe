/**
 * "Download" means the same thing wherever it is clicked: the header button, the
 * closing band, the hero. The CTA owns the platform logic (Windows downloads at
 * once, Linux opens its install options, macOS reveals the two builds), so the
 * other buttons hand the click to it through this event instead of scrolling
 * to a spot the visitor may already be looking at.
 */
const EVENT = 'vibe:download'

export function requestDownload() {
	window.dispatchEvent(new Event(EVENT))
}

/** Keep asking until the CTA is mounted: after a route change it is not there yet. */
export function requestDownloadWhenReady(attempts = 30) {
	if (document.getElementById('download')) {
		requestDownload()
		return
	}
	if (attempts > 0) requestAnimationFrame(() => requestDownloadWhenReady(attempts - 1))
}

export function onDownloadRequest(handler: () => void) {
	window.addEventListener(EVENT, handler)
	return () => window.removeEventListener(EVENT, handler)
}
