"""Coverage, staleness and stamping for the translated Markdown content.

Two sets of files, both laid out the same way — English at the top, a
translation under a locale directory, carrying a `source` hash of the English
file it was made from:

    i18n/changelog/<version>.md       i18n/changelog/<locale>/<version>.md
    i18n/docs/en-US/<slug>.md         i18n/docs/<locale>/<slug>.md

Only the newest RECENT releases are worth translating; anything older stays
English and nobody is asked about it. Both docs pages are expected everywhere.

    uv run scripts/content_i18n.py          report coverage and staleness
    uv run scripts/content_i18n.py stamp    refresh every `source` hash

`stamp` is the step after translating: write the files, then stamp them, so a
later edit to the English original shows up as stale instead of silently
drifting. A release note carries the hash in its frontmatter, a docs page in an
HTML comment on the first line, which the site strips before rendering.
"""

import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CHANGELOG = ROOT / "i18n/changelog"
DOCS = ROOT / "i18n/docs"
# How many of the newest releases are expected in every website locale.
RECENT = 75
# The pages shown on /docs, expected in every website locale.
DOC_SLUGS = ("install", "models")
DOC_STAMP = re.compile(r"^<!--\s*source:\s*([0-9a-f]+)\s*-->\n*")


def website_locales() -> list[str]:
	registry = json.loads((ROOT / "i18n/locales.json").read_text())
	return [item["code"] for item in registry if item["website"] and item["code"] != "en-US"]


def version_key(version: str) -> tuple[int, ...]:
	return tuple(int(part) for part in version.split("."))


def english_releases() -> list[Path]:
	"""Every English entry, newest first."""
	return sorted(CHANGELOG.glob("*.md"), key=lambda path: version_key(path.stem), reverse=True)


def source_hash(path: Path) -> str:
	return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def frontmatter(path: Path) -> dict[str, str]:
	match = re.match(r"^---\n(.*?)\n---\n", path.read_text(), re.DOTALL)
	if not match:
		return {}
	meta = {}
	for line in match.group(1).split("\n"):
		key, sep, value = line.partition(":")
		if sep:
			meta[key.strip()] = value.strip().strip('"')
	return meta


def changelog_audit() -> tuple[list[str], list[str]]:
	"""Returns (issues, warnings). A missing translation is only ever a warning."""
	issues: list[str] = []
	warnings: list[str] = []
	recent = english_releases()[:RECENT]
	expected = {path.stem: path for path in recent}

	for locale in website_locales():
		directory = CHANGELOG / locale
		translated = sorted(directory.glob("*.md")) if directory.is_dir() else []
		stale = []
		for path in translated:
			english = CHANGELOG / path.name
			if not english.exists():
				issues.append(f"changelog: {locale}/{path.name} translates a release that does not exist")
				continue
			meta = frontmatter(path)
			english_meta = frontmatter(english)
			if not meta.get("title"):
				issues.append(f"changelog: {locale}/{path.name} has no title in its frontmatter")
			for field in ("version", "date"):
				if meta.get(field) != english_meta.get(field):
					issues.append(f"changelog: {locale}/{path.name} {field} does not match the English entry")
			if meta.get("source") != source_hash(english):
				stale.append(path.stem)
		missing = [version for version in expected if not (directory / f"{version}.md").exists()]
		if missing:
			warnings.append(f"changelog {locale}: {len(expected) - len(missing)} of the {len(expected)} newest releases translated, using fallback")
		if stale:
			warnings.append(f"changelog {locale}: {', '.join(sorted(stale, key=version_key))} translated from older English notes")
	return issues, warnings


def docs_audit() -> tuple[list[str], list[str]]:
	"""Same contract as changelog_audit: only structural breakage is an issue."""
	issues: list[str] = []
	warnings: list[str] = []
	for slug in DOC_SLUGS:
		if not (DOCS / "en-US" / f"{slug}.md").exists():
			issues.append(f"docs: i18n/docs/en-US/{slug}.md is missing")

	for locale in website_locales():
		directory = DOCS / locale
		missing = [slug for slug in DOC_SLUGS if not (directory / f"{slug}.md").exists()]
		stale = []
		for path in sorted(directory.glob("*.md")) if directory.is_dir() else []:
			if path.stem not in DOC_SLUGS:
				issues.append(f"docs: {locale}/{path.name} is not a page the site shows")
				continue
			english = DOCS / "en-US" / path.name
			match = DOC_STAMP.match(path.read_text())
			if not match or match.group(1) != source_hash(english):
				stale.append(path.stem)
		if missing:
			warnings.append(f"docs {locale}: {', '.join(missing)} not translated, using fallback")
		if stale:
			warnings.append(f"docs {locale}: {', '.join(sorted(stale))} translated from an older English page")
	return issues, warnings


def audit() -> tuple[list[str], list[str]]:
	changelog_issues, changelog_warnings = changelog_audit()
	docs_issues, docs_warnings = docs_audit()
	return changelog_issues + docs_issues, changelog_warnings + docs_warnings


def stamp() -> int:
	stamped = 0
	for locale in website_locales():
		for path in sorted((CHANGELOG / locale).glob("*.md")) if (CHANGELOG / locale).is_dir() else []:
			english = CHANGELOG / path.name
			if not english.exists():
				continue
			text = path.read_text()
			match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
			if not match:
				print(f"  skipped {locale}/{path.name}: no frontmatter")
				continue
			body = match.group(1)
			line = f"source: {source_hash(english)}"
			body = re.sub(r"^source:.*$", line, body, flags=re.MULTILINE) if re.search(r"^source:", body, re.MULTILINE) else f"{body}\n{line}"
			updated = f"---\n{body}\n---\n" + text[match.end() :]
			if updated != text:
				path.write_text(updated)
				stamped += 1
	for locale in website_locales():
		for path in sorted((DOCS / locale).glob("*.md")) if (DOCS / locale).is_dir() else []:
			english = DOCS / "en-US" / path.name
			if not english.exists():
				continue
			text = path.read_text()
			updated = f"<!-- source: {source_hash(english)} -->\n\n{DOC_STAMP.sub('', text).lstrip()}"
			if updated != text:
				path.write_text(updated)
				stamped += 1
	return stamped


if __name__ == "__main__":
	if len(sys.argv) > 1 and sys.argv[1] == "stamp":
		print(f"stamped {stamp()} translated files")
		raise SystemExit(0)
	issues, warnings = audit()
	for warning in warnings:
		print(warning)
	if issues:
		print(f"\ncontent i18n failed with {len(issues)} issue(s):\n")
		print("\n".join(issues))
		raise SystemExit(1)
	print("content i18n passed" if not warnings else "\ncontent i18n passed with fallback warnings")
