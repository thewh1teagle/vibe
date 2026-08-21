# Vibe UI Redesign — Design Contract

Premium, calm, editorial. Reference: ElevenLabs product pages. The product promise is
**drop a file → get text**; everything else recedes.

## Principles

- One hero action per screen. Secondary actions are quiet pills or ghost buttons.
- Generous whitespace, hairline borders (1px, low-contrast), big radii (cards 1.25rem, buttons pill).
- Exactly one expressive element per screen: the **aurora** surface (soft multi-hue gradient with
  subtle grain) used for the hero dropzone and progress accents. Everything else is monochrome ink/paper.
- Motion: framer-motion, 150–250ms ease-out, translate+fade only. No bouncy springs.

## Tokens (globals.css, shadcn-style vars — keep every existing var name working)

Light (default): background #FAFAF8, foreground #111110, card #FFFFFF, muted #F1F1EE,
muted-foreground #6F6F6A, border #E7E7E2, primary = ink #111110 (primary-foreground #FFFFFF),
ring #111110/20.
Dark: background #0E0E0D, card #161615, foreground #F4F4F1, muted #1E1E1C,
muted-foreground #9A9A94, border #262624, primary #F4F4F1 (primary-foreground #111110).
Destructive/success: keep hues, desaturate slightly to match.

Aurora gradient (both themes): conic/radial blend of #5B8DEF, #B98DE3, #E8A87C, #7CC5A0 at low
saturation, heavy blur, optional grain via inline SVG noise; always behind a card or as a thin
progress fill, never behind body text.

Typography: 'Inter Variable' (@fontsource-variable/inter, already installed — import in globals.css)
as --font-sans. Headlines: font-semibold, tracking -0.03em. Body 14px, headlines 28–40px.
Eyebrow labels: 11px, uppercase, tracking +0.08em, muted-foreground.

## Architecture (single flow replaces home + batch)

New `src/pages/main/` — one page, three states, one session store:

1. **Idle** — full-window hero: aurora dropzone card centered, "Drop audio or video" headline,
   Browse button (primary pill), quiet pills: Record · From link · Folder. Below, a single quiet
   row: language select + model name (opens settings model section). Drag-anywhere on window
   highlights the zone.
2. **Working** — dropping file(s) starts transcription immediately (no confirm). Left: file queue
   (each row: name, duration, thin aurora progress bar, per-file state check/spinner/error).
   Right (or full width for single file): live transcript streaming in as segments arrive,
   auto-scroll, timestamps in muted ink. Cancel per file + Cancel all.
3. **Done** — transcript reading view: serif-free editorial text blocks with muted timestamps,
   sticky toolbar: Copy, Export (format dropdown: srt/vtt/txt/html/pdf/json/docx), Search,
   New transcription (resets to Idle). Batch: file list stays left, click to switch transcript.

Topbar (all states): wordmark "Vibe" left (text, tight tracking); right: ghost icon buttons —
New, Settings (gear). No "..." menu.

`/batch` route redirects to `/`. `/setup` keeps its logic but restyled with the same tokens.
Settings modal: keep as-is (it inherits new tokens automatically).

## Code rules

- Reuse existing invoke/event logic — hooks in src/pages/home/hooks and batch view-model show all
  wiring (load_model → transcribe, events transcribe_progress / new_segment, abort_transcribe).
- Reuse src/components/ui primitives; restyle via tokens, not forks.
- i18n: use existing `m.*` messages from ~/paraglide/messages.js where a fitting key exists;
  otherwise plain English (keys added later).
- Preserve: drag-drop via tauri://drag-drop events (webview) AND browser dnd fallback, deep links,
  record + from-URL flows, advanced options reachable (small "Options" ghost button on the quiet row).
