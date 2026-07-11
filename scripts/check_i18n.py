import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
issues: list[str] = []
warnings: list[str] = []


def read_json(path: Path):
	return json.loads(path.read_text())


def leaf_keys(value, prefix=""):
	keys = []
	for key, child in value.items():
		full_key = f"{prefix}.{key}" if prefix else key
		if isinstance(child, dict):
			keys.extend(leaf_keys(child, full_key))
		else:
			keys.append(full_key)
	return keys


def compare_keys(reference: Path, candidate: Path):
	reference_keys = set(leaf_keys(read_json(reference)))
	candidate_keys = set(leaf_keys(read_json(candidate)))
	missing = sorted(reference_keys - candidate_keys)
	extra = sorted(candidate_keys - reference_keys)
	if missing or extra:
		message = f"{candidate.relative_to(ROOT)} differs from {reference.relative_to(ROOT)}"
		if missing:
			warnings.append(f"{message}: {len(missing)} missing key(s), using fallback")
		if extra:
			issues.append(message)
			issues.append(f"  extra: {', '.join(extra)}")


def compare_desktop_locales():
	directory = ROOT / "i18n/translations"
	locales = sorted(path.parent.name for path in directory.glob("*/desktop.json"))
	if "en-US" not in locales:
		issues.append("desktop: missing reference locale en-US")
		return

	for locale in locales:
		candidate = directory / locale / "desktop.json"
		reference = directory / "en-US" / "desktop.json"
		if locale != "en-US":
			compare_keys(reference, candidate)

	configured = sorted(read_json(ROOT / "desktop/project.inlang/settings.json")["locales"])
	if configured != locales:
		issues.append("desktop: Inlang locales differ from locale directories")


def compare_website_locales():
	directory = ROOT / "i18n/translations"
	reference = directory / "en-US" / "website.json"
	locales = sorted(path.parent.name for path in directory.glob("*/website.json"))
	if "en-US" not in locales:
		issues.append("website: missing reference locale en-US")
		return

	for locale in locales:
		candidate = directory / locale / "website.json"
		if locale != "en-US":
			compare_keys(reference, candidate)


def compare_locale_registry():
	registry = read_json(ROOT / "i18n/locales.json")
	registry_desktop = sorted(item["code"] for item in registry if item["desktop"])
	registry_website = sorted(item["code"] for item in registry if item["website"])
	desktop_config = sorted(read_json(ROOT / "desktop/project.inlang/settings.json")["locales"])
	website_config = sorted(read_json(ROOT / "website/project.inlang/settings.json")["locales"])
	if registry_desktop != desktop_config:
		issues.append("locale registry: desktop Inlang locales differ from i18n/locales.json")
	if registry_website != website_config:
		issues.append("locale registry: website Inlang locales differ from i18n/locales.json")


compare_desktop_locales()
compare_website_locales()
compare_locale_registry()

if warnings:
	print(f"i18n audit warnings ({len(warnings)}):")
	print("\n".join(warnings))
if issues:
	print(f"\ni18n audit failed with {len(issues)} issue(s):\n")
	print("\n".join(issues))
	sys.exit(1)

print("i18n audit passed" if not warnings else "\ni18n audit passed with fallback warnings")
