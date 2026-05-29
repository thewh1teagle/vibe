# Vibe — Fejl og forbedringer

Fundet ved kodegennemgang d. 29. maj 2026.

---

## Kritiske — Fejl i produktion

### 1. `logs.ts` kalder slettede Tauri commands ✅
- **Fil:** `desktop/src/lib/logs.ts:19,33,52`
- **Fix:** Fjernet `get_commit_hash`, `get_cargo_features`, `get_logs` kald

### 2. `app.ts` bruger forkert localStorage nøgle ✅
- **Fil:** `desktop/src/lib/app.ts:8`
- **Fix:** Skiftet fra `'model_path'` til `'prefs_model_path'`

---

## Høj — Performance og pålidelighed

### 3. `preference.tsx` context genskabes ved hvert render ✅
- **Fil:** `desktop/src/providers/preference.tsx:126-150`
- **Fix:** Wrap i `useMemo`

### 4. `hotkey.tsx` context genskabes ved hvert render ✅
- **Fil:** `desktop/src/providers/hotkey.tsx:195-205`
- **Fix:** Wrap i `useMemo`

### 5. `sona.rs` NDJSON stream kan splitte linjer ✅
- **Fil:** `desktop/src-tauri/src/sona.rs:365-383`
- **Fix:** Bruger nu `scan` med line-buffer til at akkumulere partial lines på tværs af chunks

### 6. Ingen loading-indikator for model preload ✅
- **Fil:** `desktop/src/pages/home/view-model.ts`
- **Fix:** Tilføjet `isModelPreloading` state + "Loading model..." tekst i UI

---

## Medium — Død kode og oprydning

### 7. 11 Tauri commands registreret men aldrig kaldt ✅
- **Fil:** `desktop/src-tauri/src/main.rs:61-87`
- **Fix:** Fjernet fra invoke handler (funktionerne er stadig i koden men utilgængelige)

### 8. `@fontsource/roboto` importeret men ikke brugt ✅
- **Fil:** `desktop/src/pages/home/view-model.ts:1`
- **Fix:** Fjernet import

### 9. `load_model` og `preload_model` duplikerer ~80% kode ✅
- **Fil:** `desktop/src-tauri/src/cmd/sona_cmd.rs:88-268`
- **Fix:** Ekstraheret til delt `ensure_model_loaded()` og `ensure_model_loaded_with_fallback()` helper

### 10. `FfmpegOptions` struct er død kode ✅
- **Fil:** `desktop/src-tauri/src/cmd/transcribe.rs:18-32`
- **Fix:** Fjernet struct + Default impl

### 11. `use-single-instance.tsx` er død kode ✅
- **Fil:** `desktop/src/lib/use-single-instance.tsx`
- **Fix:** Slettet filen + fjernet `videoExtensions`/`audioExtensions` fra `config.ts`

### 12. `setup/view-model.ts` returnerer ubrugt state ✅
- **Fil:** `desktop/src/pages/setup/view-model.ts:108-118`
- **Fix:** Fjernet `navigate`, `setErrorModal`, `setDownloadProgress`, `downloadProgressRef` fra return

### 13. `logs.ts` kalder `os.version()` to gange ✅
- **Fil:** `desktop/src/lib/logs.ts:23,25`
- **Fix:** Sammenlagt til en enkelt variabel (fikset sammen med #1)

### 14. `logs.ts` kalder `is_avx2_enabled` to gange ✅
- **Fil:** `desktop/src/lib/logs.ts:10,20`
- **Fix:** Fjernet duplikat fra `getAppInfo()` (fikset sammen med #1)

---

## Lav — Mindre forbedringer

### 15. `ffmpeg.rs` kalder `get_vibe_temp_folder()` gentagne gange ✅
- **Fil:** `desktop/src-tauri/src/ffmpeg.rs:31-39`
- **Fix:** Cache med `OnceLock` — returnerer nu `&'static PathBuf`

### 16. `params.tsx` `parseIntOr` defineres inde i component ✅
- **Fil:** `desktop/src/components/params.tsx:33-36`
- **Fix:** Flyt uden for component

### 17. `setup.rs` `STATIC_APP` bruger `std::sync::Mutex` (kan poison)
- **Fil:** `desktop/src-tauri/src/setup.rs:9`
- **Status:** Ikke fikset — kræver større refaktorering af crash handler
- **Fix:** Brug `OnceLock` (sættes præcis én gang)

### 18. Hotkey shortcut input har ingen validering
- **Fil:** `desktop/src/pages/home/page.tsx:96-101`
- **Status:** Ikke fikset — kræver UI-arbejde
- **Fix:** Validering eller dedikeret shortcut-capture komponent

### 19. Hardcodede engelske strings omgår i18n
- **Filer:** `layout.tsx:17`, `settings-modal.tsx:15`, `home/page.tsx:108`, `setup/page.tsx:26`, `params.tsx:133,158-160`
- **Status:** Ikke fikset — kun relevant når der tilføjes flere sprog
- **Fix:** Brug `t()` for konsistens

### 20. `download.rs` bruger blocking fil-I/O i async kontekst
- **Fil:** `desktop/src-tauri/src/cmd/download.rs:19,31`
- **Status:** Ikke fikset — lav risiko i praksis (kun ét download ad gangen)
- **Fix:** Brug `tokio::fs::File` eller `spawn_blocking`
