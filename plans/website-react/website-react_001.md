# Plan: Replace SvelteKit landing with React + Vite + shadcn

## Context

The `landing/` folder is a SvelteKit static site for the Vibe project page (deployed to GitHub Pages at `/vibe/`). It has 3 routes (home, features, docs), 12 i18n languages, platform-specific download buttons, and markdown doc rendering. The desktop app already uses React + Vite + shadcn + Tailwind, so the landing should match.

**New folder name:** `website/`

---

## Scaffold Status

The following are **DONE** and should NOT be modified:

- `website/` project scaffolded with React + Vite + TypeScript
- `vite.config.ts` with `base: '/vibe/'`, React plugin, Tailwind plugin, `~` alias
- `package.json` with `packageManager`, build script with 404.html copy
- shadcn initialized with button, dialog, tooltip components
- `src/main.tsx` entry point importing i18n + globals.css + App
- `src/App.tsx` with BrowserRouter (basename="/vibe"), 3 routes (Home, Features, Docs), Layout wrapper
- `src/components/Layout.tsx` with Nav, Footer, Outlet, RTL dir support
- `src/lib/i18n.ts` with react-i18next config (12 languages)
- `src/lib/utils.ts` (cn function from shadcn)
- `src/lib/latestRelease.ts` (type definitions)
- `src/lib/features.json`, `latest_release.json`, `linux_install_options.json` (copied)
- `src/components/ui/button.tsx`, `dialog.tsx`, `tooltip.tsx` (shadcn)
- `public/` with all static assets copied from `landing/static/`
- `index.html` with OG tags, favicons, Google Analytics

---

## Remaining Work

### Step 1: Update `globals.css` with landing's theme

The current `globals.css` has shadcn's default neutral theme. Replace the color variables with the landing's blue-tinted theme.

**File:** `website/src/globals.css`

Replace the `:root` and `.dark` blocks with these values from the landing's `app.css`:

```css
:root {
	--radius: 0.625rem;
	--background: oklch(1 0 0);
	--foreground: oklch(0.129 0.042 264.695);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0.129 0.042 264.695);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.129 0.042 264.695);
	--primary: oklch(0.208 0.042 265.755);
	--primary-foreground: oklch(0.984 0.003 247.858);
	--secondary: oklch(0.968 0.007 247.896);
	--secondary-foreground: oklch(0.208 0.042 265.755);
	--muted: oklch(0.968 0.007 247.896);
	--muted-foreground: oklch(0.554 0.046 257.417);
	--accent: oklch(0.968 0.007 247.896);
	--accent-foreground: oklch(0.208 0.042 265.755);
	--destructive: oklch(0.577 0.245 27.325);
	--border: oklch(0.929 0.013 255.508);
	--input: oklch(0.929 0.013 255.508);
	--ring: oklch(0.704 0.04 256.788);
	--chart-1: oklch(0.646 0.222 41.116);
	--chart-2: oklch(0.6 0.118 184.704);
	--chart-3: oklch(0.398 0.07 227.392);
	--chart-4: oklch(0.828 0.189 84.429);
	--chart-5: oklch(0.769 0.188 70.08);
	--sidebar: oklch(0.984 0.003 247.858);
	--sidebar-foreground: oklch(0.129 0.042 264.695);
	--sidebar-primary: oklch(0.208 0.042 265.755);
	--sidebar-primary-foreground: oklch(0.984 0.003 247.858);
	--sidebar-accent: oklch(0.968 0.007 247.896);
	--sidebar-accent-foreground: oklch(0.208 0.042 265.755);
	--sidebar-border: oklch(0.929 0.013 255.508);
	--sidebar-ring: oklch(0.704 0.04 256.788);
}

.dark {
	--background: oklch(0.129 0.042 264.695);
	--foreground: oklch(0.984 0.003 247.858);
	--card: oklch(0.208 0.042 265.755);
	--card-foreground: oklch(0.984 0.003 247.858);
	--popover: oklch(0.208 0.042 265.755);
	--popover-foreground: oklch(0.984 0.003 247.858);
	--primary: oklch(0.929 0.013 255.508);
	--primary-foreground: oklch(0.208 0.042 265.755);
	--secondary: oklch(0.279 0.041 260.031);
	--secondary-foreground: oklch(0.984 0.003 247.858);
	--muted: oklch(0.279 0.041 260.031);
	--muted-foreground: oklch(0.704 0.04 256.788);
	--accent: oklch(0.279 0.041 260.031);
	--accent-foreground: oklch(0.984 0.003 247.858);
	--destructive: oklch(0.704 0.191 22.216);
	--border: oklch(1 0 0 / 10%);
	--input: oklch(1 0 0 / 15%);
	--ring: oklch(0.551 0.027 264.364);
	--chart-1: oklch(0.488 0.243 264.376);
	--chart-2: oklch(0.696 0.17 162.48);
	--chart-3: oklch(0.769 0.188 70.08);
	--chart-4: oklch(0.627 0.265 303.9);
	--chart-5: oklch(0.645 0.246 16.439);
	--sidebar: oklch(0.208 0.042 265.755);
	--sidebar-foreground: oklch(0.984 0.003 247.858);
	--sidebar-primary: oklch(0.488 0.243 264.376);
	--sidebar-primary-foreground: oklch(0.984 0.003 247.858);
	--sidebar-accent: oklch(0.279 0.041 260.031);
	--sidebar-accent-foreground: oklch(0.984 0.003 247.858);
	--sidebar-border: oklch(1 0 0 / 10%);
	--sidebar-ring: oklch(0.551 0.027 264.364);
}
```

Also add markdown viewer styles at the bottom of `globals.css` (after the `@layer base` block):

```css
@layer components {
	.markdown h1 {
		@apply text-4xl font-bold mb-4;
	}
	.markdown h2 {
		@apply text-3xl font-bold mb-3.5;
	}
	.markdown h3 {
		@apply text-2xl font-bold mb-3;
	}
	.markdown h4 {
		@apply text-xl font-bold mb-2.5;
	}
	.markdown h5 {
		@apply text-base font-bold mb-2;
	}
	.markdown h6 {
		@apply text-sm font-bold mb-1.5;
	}
	.markdown p {
		@apply text-base leading-relaxed mb-4;
	}
	.markdown ul,
	.markdown ol {
		@apply mb-4 pl-5;
	}
	.markdown li {
		@apply text-base leading-relaxed mb-2;
	}
	.markdown blockquote {
		@apply text-lg italic border-l-4 border-muted pl-4 mb-4 text-muted-foreground;
	}
	.markdown code,
	.markdown pre {
		@apply font-mono bg-[#272727] rounded px-1 py-0.5 text-foreground;
	}
	.markdown pre {
		@apply p-2 overflow-x-auto;
	}
	.markdown a {
		@apply text-blue-400 no-underline hover:underline;
	}
	.markdown img {
		@apply max-w-full h-auto block mx-auto;
	}
	.markdown strong {
		@apply font-bold;
	}
	.markdown em {
		@apply italic;
	}
}
```

---

### Step 2: Create icon components

Create `website/src/icons/` directory with these 8 files. Each is a direct SVG-to-React conversion.

**File:** `website/src/icons/Logo.tsx`

```tsx
export default function Logo() {
	return (
		<svg width="30" height="30" viewBox="0 0 169 169" fill="none" xmlns="http://www.w3.org/2000/svg">
			<circle cx="84.5006" cy="84.5006" r="84.5006" fill="white" />
			<circle cx="84.5007" cy="84.5007" r="75.437" fill="white" />
			<path
				d="M169.001 84.5007C169.001 131.169 131.169 169.001 84.5006 169.001C37.8322 169.001 0 131.169 0 84.5007C0 37.8323 37.8322 3.05176e-05 84.5006 3.05176e-05C131.169 3.05176e-05 169.001 37.8323 169.001 84.5007ZM4.29053 84.5007C4.29053 128.799 40.2018 164.711 84.5006 164.711C128.799 164.711 164.711 128.799 164.711 84.5007C164.711 40.2019 128.799 4.29056 84.5006 4.29056C40.2018 4.29056 4.29053 40.2019 4.29053 84.5007Z"
				fill="#2088FF"
			/>
			<path
				d="M119.652 67.8957C121.459 67.648 123.139 68.9128 123.232 70.7344C123.458 75.1399 122.93 79.56 121.664 83.8026C120.083 89.1021 117.386 94.0023 113.756 98.1741C110.125 102.346 105.644 105.693 100.613 107.991C95.5829 110.288 90.1191 111.484 84.5886 111.496C79.0582 111.509 73.589 110.338 68.5481 108.063C63.5072 105.789 59.0111 102.462 55.3615 98.3066C51.7119 94.1513 48.9933 89.2634 47.388 83.9711C46.1029 79.7343 45.5551 75.3167 45.7603 70.9102C45.8451 69.0882 47.5199 67.8158 49.3281 68.0553C51.1362 68.2948 52.39 69.9563 52.337 71.7794C52.2362 75.2486 52.6972 78.7188 53.7088 82.0539C55.0407 86.4449 57.2963 90.5002 60.3243 93.9478C63.3523 97.3955 67.0826 100.156 71.265 102.043C75.4474 103.93 79.9851 104.902 84.5737 104.891C89.1622 104.881 93.6954 103.889 97.8692 101.983C102.043 100.076 105.761 97.2992 108.773 93.8379C111.785 90.3766 114.023 86.311 115.335 81.914C116.331 78.5744 116.776 75.1022 116.66 71.6335C116.598 69.8106 117.845 68.1434 119.652 67.8957Z"
				fill="#2088FF"
			/>
			<rect x="80.6226" y="107.005" width="7.75611" height="47.3815" rx="3.87805" fill="#2088FF" />
			<rect x="62.4029" y="14.6147" width="44.1956" height="85.2479" rx="22.0978" fill="#2088FF" />
			<path
				d="M100.297 56.158L96.5972 54.9653C94.2305 54.1844 92.8439 52.2692 92.1931 49.8627L90.5649 41.9311C90.5224 41.7744 90.4188 41.5645 90.1 41.5645C89.8317 41.5645 89.6777 41.7744 89.6352 41.9311L88.0069 49.8653C87.3534 52.2719 85.9695 54.187 83.6028 54.968L79.9027 56.1606C79.3794 56.3306 79.3714 57.0691 79.892 57.247L83.6188 58.53C85.9775 59.3136 87.3534 61.2261 88.0069 63.622L89.6378 71.4659C89.6803 71.6227 89.768 71.9042 90.1027 71.9042C90.4559 71.9042 90.525 71.6227 90.5675 71.4659L92.1984 63.622C92.8519 61.2234 94.2278 59.3109 96.5866 58.53L100.313 57.247C100.829 57.0664 100.821 56.328 100.297 56.158Z"
				fill="#FDD835"
			/>
			<path
				d="M100.648 56.49C100.59 56.3439 100.475 56.2164 100.297 56.158L96.5972 54.9653C94.2305 54.1844 92.8439 52.2692 92.1931 49.8627L90.5649 41.9311C90.5409 41.8408 90.4559 41.6761 90.3577 41.6283L90.8836 49.5891C91.2741 53.2228 91.6088 54.9334 94.5094 55.4328C97.0009 55.8631 99.883 56.3572 100.648 56.49Z"
				fill="#FFEE58"
			/>
			<path
				d="M100.656 56.9044L94.2384 58.3759C91.978 58.9497 90.7322 60.2592 90.7322 63.6858L90.1027 71.9042C90.3178 71.883 90.4931 71.7661 90.5675 71.4659L92.1984 63.622C92.8519 61.2234 94.2278 59.3109 96.5866 58.53L100.313 57.247C100.489 57.1833 100.6 57.0531 100.656 56.9044Z"
				fill="#F4B400"
			/>
			<path
				d="M79.1058 63.0589C76.8931 62.3284 76.6913 61.505 76.3194 60.1158L75.3923 56.8645C75.3366 56.6547 74.7894 56.6547 74.7309 56.8645L74.1014 59.8688C73.7269 61.2527 72.93 62.3523 71.57 62.8013L69.4025 63.7416C69.1023 63.8398 69.097 64.2648 69.3972 64.3658L71.5806 65.1388C72.9353 65.5877 73.7269 66.6873 74.1041 68.0659L74.7336 70.94C74.792 71.1498 75.3366 71.1498 75.3923 70.94L76.1308 68.0792C76.5053 66.6927 77.0791 65.5903 78.9198 65.1388L80.9705 64.3658C81.2706 64.2622 81.268 63.8372 80.9652 63.7389L79.1058 63.0589Z"
				fill="#FDD835"
			/>
			<path
				d="M75.5677 60.068C75.7934 62.1558 75.9077 62.7348 77.5997 63.1678L81.1245 63.8558C81.0874 63.8053 81.0342 63.7628 80.9625 63.7416L79.1031 63.0589C77.1614 62.3948 76.6249 61.5502 76.2609 59.8608C75.897 58.1714 75.5092 57.0691 75.5092 57.0691C75.3738 56.7052 75.1799 56.7237 75.1799 56.7237L75.5677 60.068Z"
				fill="#FFEE58"
			/>
			<path
				d="M75.6314 67.3567C75.6314 65.3884 76.7072 64.4136 78.4178 64.4136L81.0794 64.3047C81.0794 64.3047 80.9253 64.5092 80.657 64.573L78.9198 65.1387C77.4456 65.7311 76.7736 66.0286 76.3167 68.0447C76.3167 68.0447 75.727 70.3901 75.6155 70.6372C75.4614 70.9825 75.2781 71.0542 75.2781 71.0542L75.6314 67.3567Z"
				fill="#F4B400"
			/>
			<path
				d="M83.8684 47.4747C84.0172 47.4242 84.0119 47.2117 83.8605 47.1692L81.8098 46.6167C81.3795 46.4998 81.0448 46.1678 80.9226 45.7402L80.1151 42.4066C80.0753 42.2445 79.8442 42.2445 79.8044 42.4092L79.0447 45.7295C78.9278 46.1705 78.5825 46.5105 78.1416 46.6247L76.1042 47.1533C75.9528 47.1931 75.9422 47.4056 76.0909 47.4588L78.2398 48.2025C78.625 48.3353 78.9225 48.6488 79.0394 49.0392L79.807 52.1178C79.8469 52.2772 80.0753 52.2798 80.1151 52.1178L80.9094 49.0286C81.0289 48.6381 81.3291 48.3273 81.7169 48.1972L83.8684 47.4747Z"
				fill="#F4B400"
				stroke="#F4B400"
				strokeWidth="0.894737"
				strokeMiterlimit="10"
			/>
		</svg>
	)
}
```

**File:** `website/src/icons/Chip.tsx`

```tsx
export default function Chip() {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z"
			/>
		</svg>
	)
}
```

**File:** `website/src/icons/Discord.tsx`

```tsx
export default function Discord() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width="1em"
			height="1em"
			className="size-6 opacity-100 duration-300 hover:opacity-50 fill-white">
			<path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0 13 13 0 0 0-.617-1.25.08.08 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.1.1 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13 13 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10 10 0 0 0 .372-.292.07.07 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028 19.8 19.8 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03M8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418" />
		</svg>
	)
}
```

**File:** `website/src/icons/Github.tsx`

```tsx
export default function Github({ width = '24', height = '24' }: { width?: string; height?: string }) {
	return (
		<svg width={width} height={height} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
		</svg>
	)
}
```

**File:** `website/src/icons/Heart.tsx`

```tsx
export default function Heart() {
	return (
		<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" strokeWidth="3" className="fill-white">
			<path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002ZM4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.58 20.58 0 0 0 8 13.393a20.58 20.58 0 0 0 3.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 0 1-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5Z" />
		</svg>
	)
}
```

**File:** `website/src/icons/Linux.tsx`

```tsx
export default function Linux() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			fill="currentColor"
			viewBox="0 0 256 256"
			className="h-[24px] w-[24px] text-white opacity-90">
			<path d="M161.22,217.74a4,4,0,0,1-3.31,6.26H98.1a4,4,0,0,1-3.31-6.26,40,40,0,0,1,66.43,0Zm68.93,3.37a8.29,8.29,0,0,1-6.43,2.89H184.56a4,4,0,0,1-3.76-2.65,56,56,0,0,0-105.59,0A4,4,0,0,1,71.45,224H32.23a8.2,8.2,0,0,1-6.42-2.93A8,8,0,0,1,25.75,211c.06-.07,7.64-9.78,15.12-28.72C47.77,164.8,56,135.64,56,96a72,72,0,0,1,144,0c0,39.64,8.23,68.8,15.13,86.28,7.48,18.94,15.06,28.65,15.13,28.74A8,8,0,0,1,230.15,221.11ZM88,108a12,12,0,1,0,12-12A12,12,0,0,0,88,108Zm79.16,32.42a8,8,0,0,0-10.73-3.58L128,151.06,99.58,136.84a8,8,0,0,0-7.15,14.32l32,16a8,8,0,0,0,7.15,0l32-16A8,8,0,0,0,167.16,140.42ZM168,108a12,12,0,1,0-12,12A12,12,0,0,0,168,108Z" />
		</svg>
	)
}
```

**File:** `website/src/icons/Mac.tsx`

```tsx
export default function Mac() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 384 512"
			width="1em"
			height="1em"
			fill="currentColor"
			className="h-[24px] w-[24px] text-white opacity-90">
			<path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
		</svg>
	)
}
```

**File:** `website/src/icons/Windows.tsx`

```tsx
export default function Windows() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			fill="currentColor"
			viewBox="0 0 256 256"
			className="h-[24px] w-[24px] text-white opacity-90">
			<path d="M112,144v51.64a8,8,0,0,1-8,8,8.54,8.54,0,0,1-1.43-.13l-64-11.64A8,8,0,0,1,32,184V144a8,8,0,0,1,8-8h64A8,8,0,0,1,112,144Zm-2.87-89.78a8,8,0,0,0-6.56-1.73l-64,11.64A8,8,0,0,0,32,72v40a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V60.36A8,8,0,0,0,109.13,54.22ZM216,136H136a8,8,0,0,0-8,8v57.45a8,8,0,0,0,6.57,7.88l80,14.54A7.61,7.61,0,0,0,216,224a8,8,0,0,0,8-8V144A8,8,0,0,0,216,136Zm5.13-102.14a8,8,0,0,0-6.56-1.73l-80,14.55A8,8,0,0,0,128,54.55V112a8,8,0,0,0,8,8h80a8,8,0,0,0,8-8V40A8,8,0,0,0,221.13,33.86Z" />
		</svg>
	)
}
```

---

### Step 3: Create `SupportButton` component

**File:** `website/src/components/SupportButton.tsx`

The Svelte version uses a Button that opens the Ko-fi dialog via `window['kofi-dialog'].showModal()`. In React, we use state passed via props.

```tsx
import { Button } from '~/components/ui/button'
import Heart from '~/icons/Heart'
import { useTranslation } from 'react-i18next'

interface SupportButtonProps {
	onOpenKofi: () => void
}

export default function SupportButton({ onOpenKofi }: SupportButtonProps) {
	const { t } = useTranslation()
	return (
		<Button className="bg-red-500 text-white hover:bg-red-700" onClick={onOpenKofi}>
			{t('support-project')}
			<Heart />
		</Button>
	)
}
```

---

### Step 4: Create `KofiDialog` component

**File:** `website/src/components/KofiDialog.tsx`

The Svelte version is a native `<dialog>` with id="kofi-dialog". Convert to shadcn Dialog with controlled open/onOpenChange state.

```tsx
import { Dialog, DialogContent } from '~/components/ui/dialog'

interface KofiDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function KofiDialog({ open, onOpenChange }: KofiDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="h-[75vh] w-[85vw] max-w-none border-white bg-white p-0 lg:h-[95vh] lg:w-[95vw]">
				<div className="h-full w-full rounded-xl bg-white p-0">
					<iframe
						src="https://ko-fi.com/thewh1teagle/?hidefeed=true&widget=true&embed=true&preview=true"
						style={{ border: 'none', width: '100%', padding: '4px', background: '#f9f9f9' }}
						height="712"
						title="thewh1teagle"
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
```

---

### Step 5: Create `PrivacyPolicy` component

**File:** `website/src/components/PrivacyPolicy.tsx`

```tsx
import { Dialog, DialogContent } from '~/components/ui/dialog'

interface PrivacyPolicyProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export default function PrivacyPolicy({ open, onOpenChange }: PrivacyPolicyProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="m-0 h-[90vh] w-[90vw] max-w-[800px] select-none overflow-y-auto p-0">
				<div className="h-full w-full overflow-y-auto p-0 m-0">
					<iframe src="/vibe/privacy_policy.pdf" className="w-full h-full p-0 m-0" title="Privacy Policy" />
				</div>
			</DialogContent>
		</Dialog>
	)
}
```

---

### Step 6: Create `PostDownload` component

**File:** `website/src/components/PostDownload.tsx`

```tsx
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import SupportButton from './SupportButton'

interface PostDownloadProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onOpenKofi: () => void
}

export default function PostDownload({ open, onOpenChange, onOpenKofi }: PostDownloadProps) {
	const { t } = useTranslation()
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[92vw] max-w-md p-6">
				<h3 className="text-xl font-semibold text-center">{t('your-download-is-starting')}</h3>
				<p className="py-2 text-sm text-center text-muted-foreground">{t('download-starting-description')}</p>
				<p className="text-center text-sm mt-5">{t('support-while-you-wait')}</p>
				<div className="flex justify-center mt-4">
					<SupportButton onOpenKofi={onOpenKofi} />
				</div>
			</DialogContent>
		</Dialog>
	)
}
```

---

### Step 7: Create `Cta` component (most complex)

**File:** `website/src/components/Cta.tsx`

This is the main download CTA. It has platform detection, multiple download paths, and 3 dialogs.

Key conversions from Svelte:

- `onMount` → `useEffect`
- `let x = ...` (reactive) → `useState`
- `$:` reactive blocks → `useEffect` with deps
- native `<dialog>` → shadcn `<Dialog>`
- `on:click` / `on:mousedown` → `onClick` / `onMouseDown`

```tsx
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '~/components/ui/dialog'
import Linux from '~/icons/Linux'
import Windows from '~/icons/Windows'
import Mac from '~/icons/Mac'
import Github from '~/icons/Github'
import Chip from '~/icons/Chip'
import latestRelease from '~/lib/latest_release.json'
import linuxInstallOptions from '~/lib/linux_install_options.json'
import mobile from 'is-mobile'
import SupportButton from './SupportButton'
import PostDownload from './PostDownload'

type Platform = 'macos' | 'windows' | 'linux'

const windowsAsset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === 'windows')
const linuxAsset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === 'linux')
const macIntelAsset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === 'macos' && a.arch === 'darwin-x86_64')
const macSiliconAsset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === 'macos' && a.arch === 'darwin-aarch64')

function getOS(): Platform {
	const platform = navigator.platform?.toLowerCase()
	if (platform?.includes('win')) return 'windows'
	if (platform?.includes('linux')) return 'linux'
	return 'macos'
}

interface CtaProps {
	onOpenKofi: () => void
}

export default function Cta({ onOpenKofi }: CtaProps) {
	const { t } = useTranslation()
	const [currentPlatform, setCurrentPlatform] = useState<Platform>('macos')
	const [ctaClicked, setCtaClicked] = useState(false)
	const [mobileModalOpen, setMobileModalOpen] = useState(false)
	const [linuxModalOpen, setLinuxModalOpen] = useState(false)
	const [postDownloadOpen, setPostDownloadOpen] = useState(false)
	const [isMobile, setIsMobile] = useState(false)
	const [currentURL, setCurrentURL] = useState('')

	const asset = latestRelease.assets.find((a) => a.platform?.toLowerCase() === currentPlatform)

	useEffect(() => {
		setCurrentPlatform(getOS())
		setIsMobile(mobile() || window.screen.width < 480)
	}, [])

	function ctaClick() {
		if (isMobile) {
			setCurrentURL(location.href)
			setMobileModalOpen(true)
		} else {
			if (currentPlatform === 'macos') {
				setCtaClicked(true)
			} else if (currentPlatform === 'windows') {
				window.open(windowsAsset?.url, '_blank')
				setPostDownloadOpen(true)
			} else if (currentPlatform === 'linux') {
				setLinuxModalOpen(true)
			}
		}
	}

	function changePlatform(p: Platform) {
		setCurrentPlatform(p)
		setCtaClicked(false)
		setCurrentURL(location.href)
	}

	return (
		<>
			<div className="flex gap-3 flex-col lg:flex-row">
				{/* Mobile CTA */}
				{isMobile ? (
					<Button onMouseDown={ctaClick}>{t('download')}</Button>
				) : currentPlatform === 'macos' ? (
					<Button className="hidden lg:flex" onMouseDown={ctaClick}>
						<Mac />
						{t('download-for')}
						{asset?.platform}
					</Button>
				) : currentPlatform === 'windows' ? (
					<Button className="hidden md:flex" asChild>
						<a href={asset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Windows />
							{t('download-for')}
							{asset?.platform}
						</a>
					</Button>
				) : currentPlatform === 'linux' ? (
					<Button className="hidden md:flex" onClick={() => setLinuxModalOpen(true)}>
						<Linux />
						{t('download-for')}
						{asset?.platform}
					</Button>
				) : null}

				<Button variant="outline" asChild>
					<a href="https://github.com/thewh1teagle/vibe" target="_blank">
						<Github width="18" height="18" />
						{t('star-on-github')}
					</a>
				</Button>
			</div>

			{/* Version */}
			<div className="mt-2 text-center text-sm text-muted-foreground">{latestRelease.version}</div>

			{/* macOS architecture selection */}
			{currentPlatform === 'macos' && ctaClicked && (
				<div className="flex gap-2 mt-3">
					<Button variant="outline" size="sm" asChild>
						<a href={macIntelAsset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Chip />
							{t('intel')}
						</a>
					</Button>
					<Button variant="outline" size="sm" asChild>
						<a href={macSiliconAsset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Chip />
							{t('apple-silicon')}
						</a>
					</Button>
				</div>
			)}

			{/* Platform switcher */}
			<div className="flex gap-3 mt-4">
				<Button variant="ghost" size="icon" onMouseDown={() => changePlatform('macos')}>
					<Mac />
				</Button>
				<Button variant="ghost" size="icon" onClick={() => changePlatform('windows')}>
					<Windows />
				</Button>
				<Button variant="ghost" size="icon" onClick={() => changePlatform('linux')}>
					<Linux />
				</Button>
			</div>

			{/* Mobile dialog */}
			<Dialog open={mobileModalOpen} onOpenChange={setMobileModalOpen}>
				<DialogContent className="w-[92vw] max-w-md p-6">
					<h3 className="font-bold text-lg text-center">{t('download-on-pc')}</h3>
					<p className="py-4 text-center">{t('available-for')} macOS / Windows / Linux</p>
					<div className="flex justify-center">
						<Button onClick={() => navigator.clipboard.writeText(currentURL)}>{t('copy-download-link')}</Button>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setMobileModalOpen(false)}>
							{t('cancel')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Linux install options dialog */}
			<Dialog open={linuxModalOpen} onOpenChange={setLinuxModalOpen}>
				<DialogContent className="w-11/12 max-w-5xl p-6">
					<h3 className="text-3xl font-bold">{t('install-on-linux')}</h3>
					{linuxInstallOptions.map((opt) => (
						<div key={opt.title} className="mt-5" dir="ltr">
							<div className="mb-2 text-3xl text-primary opacity-80">{opt.title}</div>
							<code className="min-w-[700px] flex bg-[#2b2b2b] p-2 rounded-sm">{opt.command.replace('{tag}', latestRelease.version)}</code>
						</div>
					))}
					<div className="flex items-center justify-center mt-10">
						<SupportButton onOpenKofi={onOpenKofi} />
					</div>
					<DialogFooter showCloseButton />
				</DialogContent>
			</Dialog>

			{/* Post-download dialog */}
			<PostDownload open={postDownloadOpen} onOpenChange={setPostDownloadOpen} onOpenKofi={onOpenKofi} />
		</>
	)
}
```

---

### Step 8: Create `Nav` component

**File:** `website/src/components/Nav.tsx` (replace existing stub)

```tsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '~/icons/Logo'
import Github from '~/icons/Github'
import { Button } from '~/components/ui/button'

export default function Nav() {
	const { t } = useTranslation()
	return (
		<div className="mx-auto mt-3 flex w-full items-center justify-between rounded-xl border border-border bg-card/70 px-3 py-2 lg:max-w-[1065px]">
			<div className="flex-1">
				<Button variant="ghost" asChild className="text-sm lg:text-xl">
					<Link to="/">
						<Logo />
						<span className="opacity-95">Vibe</span>
					</Link>
				</Button>
			</div>
			<ul className="flex-none px-1" dir="ltr">
				<a href="https://github.com/thewh1teagle/vibe" target="_blank">
					<Github width="28" height="28" />
				</a>
			</ul>
		</div>
	)
}
```

---

### Step 9: Create `Footer` component

**File:** `website/src/components/Footer.tsx` (replace existing stub)

The Footer in Svelte renders `<PrivacyPolicy />` and `<KofiDialog />` directly as hidden dialogs. In React, these are controlled from the parent. The Footer needs callbacks for opening them.

```tsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Github from '~/icons/Github'
import Discord from '~/icons/Discord'

interface FooterProps {
	onOpenKofi: () => void
	onOpenPrivacyPolicy: () => void
}

export default function Footer({ onOpenKofi, onOpenPrivacyPolicy }: FooterProps) {
	const { t } = useTranslation()
	return (
		<footer className="mt-36 rounded-xl border border-border bg-card/60 p-10 text-foreground">
			<nav className="flex flex-row flex-wrap justify-center gap-4">
				<Link className="underline-offset-4 hover:underline" to="/">
					{t('home')}
				</Link>
				<button className="underline-offset-4 hover:underline" onClick={onOpenKofi}>
					{t('support-vibe')}
				</button>
				<button className="underline-offset-4 hover:underline" onClick={onOpenPrivacyPolicy}>
					{t('privacy-policy')}
				</button>
				<Link className="underline-offset-4 hover:underline" to="/features">
					{t('features')}
				</Link>
				<Link className="underline-offset-4 hover:underline" to="/docs">
					{t('documentation')}
				</Link>
			</nav>
			<nav className="mt-6">
				<div className="flex items-center gap-4">
					<a href="https://github.com/thewh1teagle/vibe" target="_blank">
						<Github width="24" height="24" />
					</a>
					<div className="h-6 w-px bg-border" />
					<a href="https://discord.gg/EcxWSstQN8" target="_blank">
						<Discord />
					</a>
				</div>
			</nav>
			<aside className="mt-4 text-center text-sm text-muted-foreground">
				<p>Vibe - {t('title')}</p>
			</aside>
		</footer>
	)
}
```

---

### Step 10: Update `Layout` component

**File:** `website/src/components/Layout.tsx` (replace existing)

The Layout now holds the shared dialog state (kofi, privacy policy) and passes callbacks to children.

```tsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Nav from './Nav'
import Footer from './Footer'
import KofiDialog from './KofiDialog'
import PrivacyPolicy from './PrivacyPolicy'

export default function Layout() {
	const { i18n } = useTranslation()
	const [kofiOpen, setKofiOpen] = useState(false)
	const [privacyOpen, setPrivacyOpen] = useState(false)

	return (
		<div dir={i18n.dir()}>
			<Nav />
			<Outlet context={{ onOpenKofi: () => setKofiOpen(true) }} />
			<Footer onOpenKofi={() => setKofiOpen(true)} onOpenPrivacyPolicy={() => setPrivacyOpen(true)} />
			<KofiDialog open={kofiOpen} onOpenChange={setKofiOpen} />
			<PrivacyPolicy open={privacyOpen} onOpenChange={setPrivacyOpen} />
		</div>
	)
}
```

Note: `Outlet` passes `onOpenKofi` via context so pages like Home can access it. Use `useOutletContext` in pages:

```tsx
import { useOutletContext } from 'react-router-dom'
interface LayoutContext {
	onOpenKofi: () => void
}
const { onOpenKofi } = useOutletContext<LayoutContext>()
```

---

### Step 11: Create `Home` page

**File:** `website/src/pages/Home.tsx` (replace existing stub)

```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext } from 'react-router-dom'
import Cta from '~/components/Cta'

interface LayoutContext {
	onOpenKofi: () => void
}

export default function Home() {
	const { t } = useTranslation()
	const { onOpenKofi } = useOutletContext<LayoutContext>()

	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search)
		const action = urlParams.get('action')
		if (action === 'support-vibe') {
			onOpenKofi()
		}
	}, [onOpenKofi])

	return (
		<>
			<h1 className="text-3xl lg:text-6xl text-center capitalize">{t('title')}</h1>
			<p className="mt-5 m-auto max-w-[78%] text-center text-base leading-8 text-muted-foreground lg:max-w-[600px]">{t('description')}</p>
			<div className="flex flex-col items-center mt-10">
				<Cta onOpenKofi={onOpenKofi} />
			</div>
			<div className="m-auto mt-16 w-[95%] lg:w-[1000px] h-auto">
				<img
					className="rounded-2xl object-cover w-full h-auto transition-transform duration-500 ease-in-out hover:scale-[1.03] hover:-translate-y-1"
					alt="preview"
					src="/vibe/preview.png"
				/>
			</div>
		</>
	)
}
```

---

### Step 12: Create `FeatureCard` component

**File:** `website/src/components/FeatureCard.tsx`

```tsx
import { cn } from '~/lib/utils'

interface FeatureCardProps {
	title: string
	description: string
	videoURL?: string
	imageURL?: string
	align?: string
}

const alignMap: Record<string, string> = {
	start: 'justify-start',
	center: 'justify-center',
	end: 'justify-end',
}

export default function FeatureCard({ title, description, videoURL, imageURL, align = 'start' }: FeatureCardProps) {
	return (
		<div>
			<div className="text-2xl font-medium">{title}</div>
			<div className="text-lg opacity-80 mt-6 mb-6">{description}</div>

			{imageURL && (
				<div className={cn('flex', alignMap[align] || 'justify-start')}>
					<img src={`/vibe${imageURL}`} alt="Image" className="rounded-lg transition-transform duration-500 ease-in-out hover:scale-105 hover:z-10" />
				</div>
			)}

			{videoURL && (
				<div className={cn('flex items-center', alignMap[align] || 'justify-start')}>
					<video src={`/vibe${videoURL}`} controls className="rounded-lg" />
				</div>
			)}
		</div>
	)
}
```

---

### Step 13: Create `Features` page

**File:** `website/src/pages/Features.tsx` (replace existing stub)

```tsx
import features from '~/lib/features.json'
import FeatureCard from '~/components/FeatureCard'

export default function Features() {
	return (
		<div className="max-w-[81%] lg:max-w-[680px] m-auto" dir="ltr">
			<div className="text-4xl font-bold">Features</div>
			<div className="flex flex-col gap-28 mt-14">
				{features.map((feature) => (
					<FeatureCard key={feature.title} {...feature} />
				))}
			</div>
		</div>
	)
}
```

---

### Step 14: Create `DocViewer` component

**File:** `website/src/components/DocViewer.tsx`

```tsx
import { useState, useEffect } from 'react'
import { marked } from 'marked'

interface DocViewerProps {
	url: string
}

export default function DocViewer({ url }: DocViewerProps) {
	const [html, setHtml] = useState('Loading...')

	useEffect(() => {
		if (!url) {
			setHtml('No document selected.')
			return
		}

		let cancelled = false
		setHtml('Loading...')

		fetch(url)
			.then((res) => {
				if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`)
				return res.text()
			})
			.then((text) => marked(text))
			.then((result) => {
				if (!cancelled) setHtml(typeof result === 'string' ? result : '')
			})
			.catch((err) => {
				console.error('Error loading document:', err)
				if (!cancelled) setHtml('Failed to load document.')
			})

		return () => {
			cancelled = true
		}
	}, [url])

	return (
		<div className="min-h-screen">
			<div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	)
}
```

Note: Uses the `.markdown` class styles defined in `globals.css` (Step 1).

---

### Step 15: Create `Docs` page

**File:** `website/src/pages/Docs.tsx` (replace existing stub)

```tsx
import { useState, useEffect } from 'react'
import { Button } from '~/components/ui/button'
import DocViewer from '~/components/DocViewer'

const docs = [
	{ name: 'Install', url: '/vibe/docs/install.md' },
	{ name: 'Models', url: '/vibe/docs/models.md' },
	{ name: 'Debug', url: '/vibe/docs/debug.md' },
	{ name: 'Build', url: '/vibe/docs/building.md' },
]

function getDocUrl(hash: string) {
	const docName = hash.replace('#', '')
	const doc = docs.find((d) => d.name.toLowerCase() === docName.toLowerCase())
	return doc ? doc.url : docs[0].url
}

export default function Docs() {
	const [url, setUrl] = useState(docs[0].url)

	useEffect(() => {
		if (window.location.hash) {
			setUrl(getDocUrl(window.location.hash))
		}

		const onHashChange = () => setUrl(getDocUrl(window.location.hash))
		window.addEventListener('hashchange', onHashChange)
		return () => window.removeEventListener('hashchange', onHashChange)
	}, [])

	return (
		<div className="max-w-[81%] lg:max-w-[680px] m-auto" dir="ltr">
			<h1 className="text-4xl font-bold mb-6">Vibe Documentation</h1>

			<div className="mb-8 flex flex-wrap justify-center gap-2 rounded-xl border border-border bg-card/60 p-2">
				{docs.map((doc) => (
					<Button
						key={doc.name}
						variant={url === doc.url ? 'default' : 'ghost'}
						size="sm"
						onClick={() => {
							setUrl(doc.url)
							window.location.hash = doc.name.toLowerCase()
						}}>
						{doc.name}
					</Button>
				))}
			</div>

			<DocViewer url={url} />
		</div>
	)
}
```

---

### Step 16: Update CI workflow

**File:** `.github/workflows/landing.yml`

Update these values:

1. **Trigger paths:** `landing/**` → `website/**`
2. **pnpm setup:** `package_json_file: landing/package.json` → `package_json_file: website/package.json`
3. **Build working-directory:** `landing` → `website`
4. **Upload artifact path:** `landing/build` → `website/dist`
5. **Remove** `static_site_generator: sveltekit` from `actions/configure-pages` if present
6. **Cache dependency path:** `landing/pnpm-lock.yaml` → `website/pnpm-lock.yaml`

**File:** `scripts/landing_links.py` (line ~19)

Update path:

```python
RELEASES_PATH = Path(__file__).resolve().parent.parent / "website/src/lib/latest_release.json"
```

---

### Step 17: Delete `landing/` folder

After verifying the website builds and deploys correctly:

```bash
rm -rf landing/
```

---

## Conversion Cheat Sheet

| Svelte                            | React                                            |
| --------------------------------- | ------------------------------------------------ |
| `$i18n.t('key')` / `$i18n.t`      | `const { t } = useTranslation(); t('key')`       |
| `onMount(() => {...})`            | `useEffect(() => {...}, [])`                     |
| `let x = $state(0)`               | `const [x, setX] = useState(0)`                  |
| `{#if cond}...{/if}`              | `{cond && (...)}` or ternary                     |
| `{#each items as item}...{/each}` | `{items.map(item => (...))}`                     |
| `on:click={fn}`                   | `onClick={fn}`                                   |
| `on:mousedown={fn}`               | `onMouseDown={fn}`                               |
| `bind:value={x}`                  | `value={x} onChange={e => setX(e.target.value)}` |
| `{@html content}`                 | `dangerouslySetInnerHTML={{ __html: content }}`  |
| `class="..."`                     | `className="..."`                                |
| `<a href={base}>`                 | `<Link to="/">` (react-router-dom)               |
| `<dialog>` with `showModal()`     | shadcn `<Dialog open={x} onOpenChange={setX}>`   |
| `export let prop`                 | Component props interface                        |
| `$: reactive`                     | `useEffect` with dependencies or derived `const` |
| Svelte `stroke-width`             | React `strokeWidth` (camelCase SVG attributes)   |
| Svelte `stroke-linecap`           | React `strokeLinecap`                            |
| Svelte `stroke-linejoin`          | React `strokeLinejoin`                           |
| Svelte `stroke-miterlimit`        | React `strokeMiterlimit`                         |

## File Dependency Order

Create files in this order to avoid import errors:

1. `globals.css` (update theme)
2. `src/icons/*` (8 files, no deps)
3. `src/components/SupportButton.tsx`
4. `src/components/KofiDialog.tsx`
5. `src/components/PrivacyPolicy.tsx`
6. `src/components/PostDownload.tsx`
7. `src/components/Cta.tsx` (depends on icons, SupportButton, PostDownload)
8. `src/components/Nav.tsx` (depends on icons)
9. `src/components/Footer.tsx` (depends on icons)
10. `src/components/Layout.tsx` (depends on Nav, Footer, KofiDialog, PrivacyPolicy)
11. `src/pages/Home.tsx` (depends on Cta)
12. `src/components/FeatureCard.tsx`
13. `src/pages/Features.tsx` (depends on FeatureCard)
14. `src/components/DocViewer.tsx`
15. `src/pages/Docs.tsx` (depends on DocViewer)

## Validation

After all conversions, run:

```bash
cd website && pnpm build
```

The build should succeed with zero TypeScript errors. Then run `pnpm dev` and visually verify:

- Home page shows title, description, download buttons, preview image
- Platform detection works (shows correct OS download button)
- macOS shows Intel/Silicon choice after clicking download
- Features page shows feature grid with images
- Docs page shows tab navigation and renders markdown
- Footer links work (home, features, docs, support, privacy policy)
- Ko-fi dialog opens from footer and support buttons
- Privacy policy dialog opens and shows PDF
- RTL languages render correctly (test with `?lng=he-IL`)
