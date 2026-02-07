# Plan: Replace SvelteKit landing with React + Vite + shadcn

## Context

The `landing/` folder is a SvelteKit static site for the Vibe project page (deployed to GitHub Pages at `/vibe/`). It has 3 routes (home, features, docs), 12 i18n languages, platform-specific download buttons, and markdown doc rendering. Since the desktop app already uses React + Vite + shadcn + Tailwind, the landing should use the same stack to share knowledge and components.

**New folder name:** `website/` (cleaner than "landing", matches common conventions)

---

## Step 1: Scaffold the project via CLI

```bash
cd /Users/yqbqwlny/Documents/audio/vibe
pnpm create vite website -- --template react-ts
cd website
pnpm install
pnpm add react-router-dom i18next react-i18next i18next-browser-languagedetector i18next-http-backend marked is-mobile lucide-react sonner
pnpm add -D tailwindcss @tailwindcss/vite
pnpx shadcn@latest init
```

shadcn init will ask:
- Style: Default
- Base color: Neutral (or match the desktop theme)
- CSS variables: Yes

Then add shadcn components:

```bash
pnpx shadcn@latest add button dialog tooltip
```

### vite.config.ts

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/vibe/',
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
})
```

Key: `base: '/vibe/'` matches the current GitHub Pages path.

### Add `"packageManager": "pnpm@10.4.1"` to `website/package.json`

---

## Step 2: Copy static assets as-is

Copy the entire `static/` folder contents into `website/public/`:

```bash
cp -r landing/static/* website/public/
```

This includes:
- All favicon variants (19 files)
- Feature images (11 PNGs)
- `logo.png`, `og.png`, `preview.png`
- `locales/` directory (12 language JSON files)
- `privacy_policy.pdf`, `privacy_policy.md`
- `installer.sh`
- `browserconfig.xml`

---

## Step 3: Copy reusable TypeScript/JSON files

These files are framework-agnostic and copy directly:

| Source | Destination | Notes |
|-|-|-|
| `landing/src/lib/utils.ts` | `website/src/lib/utils.ts` | `cn()` function — already exists in shadcn init, merge |
| `landing/src/lib/latestRelease.ts` | `website/src/lib/latestRelease.ts` | Type definitions — copy as-is |
| `landing/src/lib/features.json` | `website/src/lib/features.json` | Data — copy as-is |
| `landing/src/lib/latest_release.json` | `website/src/lib/latest_release.json` | Data — copy as-is |
| `landing/src/lib/linux_install_options.json` | `website/src/lib/linux_install_options.json` | Data — copy as-is |

The `utils.ts` from shadcn init already has `cn()`. The Svelte-specific type helpers (`WithoutChild`, etc.) are not needed.

---

## Step 4: Set up i18n

**File:** `website/src/lib/i18n.ts`

```ts
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'

i18next
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    detection: {
      order: ['localStorage', 'querystring', 'navigator'],
      caches: ['localStorage'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: 'locale',
    },
    fallbackLng: 'en-US',
    supportedLngs: [
      'en-US', 'es-MX', 'fr-FR', 'he-IL', 'ja-JP', 'ko-KR',
      'no-NO', 'pl-PL', 'pt-BR', 'ru-RU', 'zh-CN', 'zh-HK',
    ],
    ns: 'translation',
    backend: {
      loadPath: '/vibe/locales/{{lng}}.json',
    },
  })

export default i18next
```

Almost identical to the Svelte version — swap `svelte-i18next` / `createI18nStore` for `react-i18next` / `initReactI18next`. The `loadPath` adds the `/vibe/` base prefix since files are in `public/locales/`.

---

## Step 5: Set up routing

**File:** `website/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '~/components/Layout'
import Home from '~/pages/Home'
import Features from '~/pages/Features'
import Docs from '~/pages/Docs'

export default function App() {
  return (
    <BrowserRouter basename="/vibe">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="features" element={<Features />} />
          <Route path="docs" element={<Docs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

`basename="/vibe"` matches the GitHub Pages deployment path.

**File:** `website/src/components/Layout.tsx`

```tsx
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Nav from './Nav'
import Footer from './Footer'

export default function Layout() {
  const { i18n } = useTranslation()
  return (
    <div dir={i18n.dir()}>
      <Nav />
      <Outlet />
      <Footer />
    </div>
  )
}
```

---

## Step 6: Convert Svelte components → React

Each `.svelte` file becomes a `.tsx` file. The conversion is mostly mechanical:

| Svelte component | React component | Notes |
|-|-|-|
| `Nav.svelte` | `components/Nav.tsx` | Replace `$i18n.t()` → `useTranslation().t()` |
| `Footer.svelte` | `components/Footer.tsx` | Same pattern |
| `Cta.svelte` | `components/Cta.tsx` | Platform detection, download logic. Replace `onMount` → `useEffect` |
| `Meta.svelte` | `components/Meta.tsx` | Use `react-helmet-async` or `useEffect` for `<head>` |
| `PostDownload.svelte` | `components/PostDownload.tsx` | Dialog → shadcn `<Dialog>` |
| `KofiDialog.svelte` | `components/KofiDialog.tsx` | Dialog → shadcn `<Dialog>` |
| `PrivacyPolicy.svelte` | `components/PrivacyPolicy.tsx` | Dialog → shadcn `<Dialog>` |
| `SupportButton.svelte` | `components/SupportButton.tsx` | Simple button |
| `+page.svelte` (home) | `pages/Home.tsx` | Main page |
| `features/+page.svelte` | `pages/Features.tsx` | Feature grid |
| `features/feature.svelte` | `components/FeatureCard.tsx` | Feature card |
| `docs/+page.svelte` | `pages/Docs.tsx` | Tab-based docs |
| `docs/DocViewer.svelte` | `components/DocViewer.tsx` | Markdown fetcher/renderer |

### Conversion patterns

**Svelte → React cheat sheet:**

| Svelte | React |
|-|-|
| `$i18n.t('key')` | `const { t } = useTranslation(); t('key')` |
| `onMount(() => {...})` | `useEffect(() => {...}, [])` |
| `let x = $state(0)` | `const [x, setX] = useState(0)` |
| `{#if cond}...{/if}` | `{cond && ...}` |
| `{#each items as item}...{/each}` | `{items.map(item => ...)}` |
| `on:click={fn}` | `onClick={fn}` |
| `bind:value={x}` | `value={x} onChange={e => setX(e.target.value)}` |
| `<slot />` | `{children}` |
| `<dialog bind:this={el}>` | shadcn `<Dialog>` |
| `class:active={cond}` | `className={cn('base', cond && 'active')}` |

### SVG icons

Replace `@lucide/svelte` imports with `lucide-react`:
```tsx
// Svelte: import { Heart } from '@lucide/svelte'
// React:
import { Heart } from 'lucide-react'
```

Custom SVG icons (`Logo.svelte`, `Chip.svelte`, etc.) → convert to React components or inline SVG. Pattern:

```tsx
// website/src/icons/Logo.tsx
export default function Logo({ className }: { className?: string }) {
  return <svg className={className} ...>...</svg>
}
```

---

## Step 7: Static site generation for GitHub Pages

SvelteKit used `adapter-static` to pre-render pages. For React + Vite, use **`vite-plugin-prerender`** (or just deploy as an SPA with a `404.html` fallback):

**Option A (recommended): SPA with 404 fallback**

GitHub Pages serves `index.html` for unknown paths if a `404.html` exists. After `vite build`, copy `dist/index.html` to `dist/404.html`:

```json
// package.json scripts
"build": "vite build && cp dist/index.html dist/404.html"
```

This is simpler and works perfectly for a 3-page site with client-side routing.

**Option B: Pre-render**

Use `vite-ssg` or `@prerenderer/vite` to generate static HTML for each route. Only needed for SEO — and this landing page already has Google Analytics and meta tags that work fine with SPA mode.

---

## Step 8: Copy and adapt `app.css` → `globals.css`

The current `landing/src/app.css` has:
- Tailwind imports
- Custom CSS variables (oklch color theme for light/dark)
- Custom component classes (`.v-btn`, `.v-dialog`, `.v-link`)
- Markdown viewer styles

Copy the CSS variables and custom classes to `website/src/globals.css`. The `.v-btn` / `.v-dialog` classes should be replaced with shadcn components where possible, but the markdown viewer styles (`[data-md-viewer]`) should be kept as-is for the docs page.

---

## Step 9: Update `app.html` → `index.html`

**File:** `website/index.html`

Copy from the SvelteKit `app.html`:
- All favicon `<link>` tags
- OG meta tags
- Google Analytics `<script>`
- The `<div id="root">` for React

---

## Step 10: Update CI workflow

**File:** `.github/workflows/landing.yml`

Update paths and build commands:

```yaml
on:
  push:
    branches: [main]
    paths:
      - "website/**"
      - "scripts/landing_links.py"

# ...

- name: Build
  run: |
    pnpm install
    uv run ../scripts/landing_links.py
    cp -rf ../docs public/
    pnpm build
  working-directory: website

# ...

- name: Setup Pages
  uses: actions/configure-pages@v5
  # Remove: static_site_generator: sveltekit

- name: Upload Artifacts
  uses: actions/upload-pages-artifact@v3
  with:
    path: website/dist  # Vite outputs to dist/, not build/
```

Also update `scripts/landing_links.py` line 19:
```python
RELEASES_PATH = Path(__file__).resolve().parent.parent / "website/src/lib/latest_release.json"
```

Also update `package_json_file` in the pnpm setup step:
```yaml
package_json_file: website/package.json
```

And `cache-dependency-path`:
```yaml
cache-dependency-path: website/pnpm-lock.yaml
```

---

## Step 11: Delete `landing/` folder

After the new `website/` is working:

```bash
rm -rf landing/
```

---

## File structure

```
website/
├── public/
│   ├── locales/          # 12 language JSONs (copied from static/)
│   ├── favicon-*.png     # Favicons (copied)
│   ├── feature-*.png     # Feature images (copied)
│   ├── logo.png, og.png, preview.png
│   ├── privacy_policy.pdf, privacy_policy.md
│   ├── installer.sh
│   └── browserconfig.xml
├── src/
│   ├── main.tsx          # Entry point, imports i18n
│   ├── App.tsx           # Router setup
│   ├── globals.css       # Tailwind + theme variables
│   ├── components/
│   │   ├── ui/           # shadcn components (button, dialog, tooltip)
│   │   ├── Layout.tsx
│   │   ├── Nav.tsx
│   │   ├── Footer.tsx
│   │   ├── Cta.tsx
│   │   ├── Meta.tsx
│   │   ├── PostDownload.tsx
│   │   ├── KofiDialog.tsx
│   │   ├── PrivacyPolicy.tsx
│   │   ├── SupportButton.tsx
│   │   ├── FeatureCard.tsx
│   │   └── DocViewer.tsx
│   ├── icons/
│   │   ├── Logo.tsx
│   │   ├── Chip.tsx
│   │   ├── Discord.tsx
│   │   ├── Github.tsx
│   │   ├── Heart.tsx
│   │   ├── Linux.tsx
│   │   ├── Mac.tsx
│   │   └── Windows.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Features.tsx
│   │   └── Docs.tsx
│   └── lib/
│       ├── i18n.ts
│       ├── utils.ts       # cn() from shadcn
│       ├── latestRelease.ts  # copied
│       ├── features.json     # copied
│       ├── latest_release.json  # copied
│       └── linux_install_options.json  # copied
├── index.html
├── vite.config.ts
├── tsconfig.json
├── components.json       # shadcn config
├── package.json
└── pnpm-lock.yaml
```

---

## Summary

| Step | What |
|-|-|
| 1 | Scaffold with `pnpm create vite`, install deps, `pnpx shadcn@latest init` |
| 2 | Copy `static/*` → `public/` |
| 3 | Copy JSON data files + TypeScript types |
| 4 | Set up i18n with `react-i18next` (near-identical config) |
| 5 | Set up `react-router-dom` with 3 routes + layout |
| 6 | Convert 12 Svelte components → React TSX (mechanical translation) |
| 7 | SPA build with `404.html` fallback for GitHub Pages |
| 8 | Copy CSS theme variables, replace `.v-*` classes with shadcn |
| 9 | Copy meta tags, favicons, GA script to `index.html` |
| 10 | Update CI workflow paths (`landing/` → `website/`, `build/` → `dist/`) |
| 11 | Delete `landing/` |

### Files copied directly (no changes)
- All static assets (images, favicons, locales, PDFs)
- `features.json`, `latest_release.json`, `linux_install_options.json`
- `latestRelease.ts` (type definitions)

### Files requiring Svelte→React conversion
- 7 components, 3 pages, 1 layout, 8 icon components
