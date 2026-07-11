# Translations 🌐

Translation catalogs are stored in `i18n/translations`:

```text
i18n/translations/{locale}/desktop.json
i18n/translations/{locale}/website.json
```

To add a language:

1. Use a [BCP 47 locale code](https://gist.github.com/thewh1teagle/c8877e5c4c5e2780754ddd065ae2592e), such as `pt-BR`.
2. Copy the English files from `i18n/translations/en-US/` into a new locale directory.
3. Translate the values and keep the keys unchanged.
4. Add the locale to `i18n/locales.json` and the relevant Inlang settings file(s).
5. Run `uv run scripts/check_i18n.py` from the repository root to check translation coverage. The same check is also available as `pnpm check:i18n`.

You can translate the desktop app, the website, or both. Missing translations fall back to English.
