// Minimal service worker. Vite serves `public/` verbatim, so this stays a plain
// classic script with no imports and no build step — which also means nothing
// here is rewritten for the deploy base. Every path is therefore resolved
// against `self.location`, i.e. the directory this worker is served from.
//
// The app is deployed under a subpath (`/vibe/phone/` on GitHub Pages), and a
// worker's default scope is its own directory: a worker at `/vibe/phone/sw.js`
// controls `/vibe/phone/` and below, and nothing of the website around it.
//
// It exists for one reason: make the app installable to the iOS/Android home
// screen and survive a flaky network. It deliberately NEVER cache-firsts the
// handoff wasm, which is rebuilt constantly during development.

const CACHE = 'vibe-phone-v1'

/** Directory this worker was served from — `/` in dev, `/vibe/phone/` in production. */
const BASE = new URL('./', self.location).href

const at = (path) => new URL(path, BASE).href

// Hashed Vite assets are cached on demand; only the entry document is precached.
const SHELL = [at('.'), at('index.html'), at('manifest.webmanifest'), at('icons/icon-192.png'), at('icons/icon-512.png')]

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(SHELL))
			.catch(() => undefined)
			.then(() => self.skipWaiting())
	)
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	)
})

self.addEventListener('fetch', (event) => {
	const req = event.request
	if (req.method !== 'GET') return

	const url = new URL(req.url)
	if (url.origin !== self.location.origin) return

	// Always network for the wasm bundle so a rebuild is picked up immediately.
	if (url.pathname.includes('/wasm/') || url.pathname.endsWith('.wasm')) {
		event.respondWith(fetch(req, { cache: 'no-store' }))
		return
	}

	// Navigations: network first, cached shell as the offline fallback. The
	// fallback is this app's own index.html, not the site root's.
	if (req.mode === 'navigate') {
		event.respondWith(fetch(req).catch(() => caches.match(at('index.html')).then((r) => r || Response.error())))
		return
	}

	// Everything else (hashed JS/CSS, icons): cache first, refresh in background.
	event.respondWith(
		caches.match(req).then((hit) => {
			const network = fetch(req)
				.then((res) => {
					if (res && res.ok) {
						const copy = res.clone()
						caches
							.open(CACHE)
							.then((c) => c.put(req, copy))
							.catch(() => {})
					}
					return res
				})
				.catch((err) => {
					if (hit) return hit
					throw err
				})
			return hit || network
		})
	)
})
