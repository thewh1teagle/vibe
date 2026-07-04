import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LEVEL_PATTERNS: Array<{ pattern: RegExp; rawLevel: string; severity: number }> = [
  { pattern: /teilreisewarnung/i, rawLevel: "Teilreisewarnung", severity: 3 },
  { pattern: /reisewarnung/i, rawLevel: "Reisewarnung", severity: 4 },
  { pattern: /von nicht notwendigen reisen|nicht notwendige reisen/i, rawLevel: "Von nicht notwendigen Reisen abraten", severity: 2 },
  { pattern: /erh.hte vorsicht|besondere vorsicht|sicherheitshinweise beachten/i, rawLevel: "Erhöhte Vorsicht", severity: 1 },
];

function flagsToRaw(warning: boolean, partialWarning: boolean, situationWarning: boolean, situationPartWarning: boolean, contentHtml?: string): string {
  // Return the LOWEST applicable level — compound detection in page.tsx will show
  // higher regional zones from the summary keywords.
  if (situationWarning) return "Erhöhte Vorsicht";
  if (situationPartWarning) return "Von nicht notwendigen Reisen abraten";
  if (partialWarning) return "Teilreisewarnung";
  if (warning) return "Reisewarnung";

  if (contentHtml) {
    const text = contentHtml.replace(/<[^>]+>/g, " ").toLowerCase();
    let minMatch: { severity: number; rawLevel: string } | null = null;
    for (const { pattern, rawLevel, severity } of LEVEL_PATTERNS) {
      if (pattern.test(text) && (minMatch === null || severity < minMatch.severity)) {
        minMatch = { severity, rawLevel };
      }
    }
    if (minMatch) return minMatch.rawLevel;
  }

  return "Keine besonderen Sicherheitshinweise";
}

function extractLevelFromHtml(html: string): string | null {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  // Use minimum non-zero severity: the lowest level found = the general country advisory.
  // Higher levels in the same page are regional zones shown via compound detection.
  let minMatch: { severity: number; rawLevel: string } | null = null;
  for (const { pattern, rawLevel, severity } of LEVEL_PATTERNS) {
    if (pattern.test(plain) && (minMatch === null || severity < minMatch.severity)) {
      minMatch = { severity, rawLevel };
    }
  }
  return minMatch?.rawLevel ?? null;
}

function extractSummaryFromHtml(html: string): string {
  // Try to find the actual advisory content section — German pages have a TOC header before content
  // The real content starts after the TOC, typically at the "Aktuell" / "Sicherheit" heading
  const contentMatch = html.match(/<h[23][^>]*>\s*(?:Aktuell|Sicherheit|Reise-?\s*und\s*Sicherheitshinweise)\s*<\/h[23]>/i)
    ?? html.match(/id="[^"]*(?:aktuell|sicherheit)[^"]*"/i);
  const htmlSlice = contentMatch?.index !== undefined
    ? html.slice(contentMatch.index)
    : html;

  const plain = htmlSlice
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Skip past any remaining TOC-like preamble (short items before first real paragraph)
  // Real content has sentences ending with periods; TOC items are short
  const paragraphStart = plain.search(/[A-ZÄÖÜ][^.!?]{40,}[.!?]/);
  const text = paragraphStart > 0 && paragraphStart < 500 ? plain.slice(paragraphStart) : plain;

  for (const { pattern } of LEVEL_PATTERNS) {
    const match = text.match(pattern);
    if (match?.index !== undefined) {
      return text.slice(match.index, match.index + 3000).trim().slice(0, 2000);
    }
  }
  return text.slice(0, 2000);
}

interface AACountry {
  countryCode: string;
  iso3CountryCode?: string;
  countryName?: string;
  warning: boolean;
  partialWarning: boolean;
  situationWarning: boolean;
  situationPartWarning?: boolean;
  content?: { text?: { value?: string } };
  lastModified?: number;
  reportUrl?: string;
}

const KNOWN_ADVISORY_URLS: Record<string, string> = {
  AE: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/vereinigtearabischeemiratesicherheit-202332",
  IL: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/israelsicherheit-203814",
  RU: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/russischefoedsicherheit-201536",
  UA: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/ukrainesicherheit-201946",
  CN: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/chinasicherheit-200466",
  IR: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/iransicherheit-202396",
  IQ: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/iraksicherheit-202738",
  SY: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/syriensicherheit-204278",
  AF: "https://www.auswaertiges-amt.de/de/reiseundsicherheit/afghanistansicherheit-204692",
  TH: "https://www.auswaertiges-amt.de/de/service/laender/thailand-node/thailandsicherheit-201558",
  TR: "https://www.auswaertiges-amt.de/de/service/laender/tuerkei-node/tuerkeisicherheit-201962",
  ID: "https://www.auswaertiges-amt.de/de/service/laender/indonesien-node/indonesiensicherheit-212396",
};

function getSourceUrl(c: AACountry, iso2: string): string {
  if (KNOWN_ADVISORY_URLS[iso2]) return KNOWN_ADVISORY_URLS[iso2];
  if (c.reportUrl) return c.reportUrl;
  const name = c.countryName;
  if (name) {
    const slug = name.toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `https://www.auswaertiges-amt.de/de/service/laender/${slug}-node`;
  }
  return `https://www.auswaertiges-amt.de/de/service/laender/${iso2.toLowerCase()}-node`;
}

export const germanyScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    const res = await fetch(
      "https://www.auswaertiges-amt.de/opendata/travelwarning",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as { response: Record<string, AACountry> };
    const entries = Object.values(json.response ?? {}).filter(
      (v): v is AACountry => typeof v === "object" && v !== null && "countryCode" in v
    );

    const advisories: RawAdvisory[] = [];
    const needsHtmlVerification: Array<{ idx: number; url: string }> = [];

    for (const c of entries) {
      const iso2 = c.countryCode?.toUpperCase();
      if (!iso2 || iso2.length !== 2) continue;

      const htmlText = c.content?.text?.value ?? "";
      const rawLevel = flagsToRaw(c.warning, c.partialWarning, c.situationWarning, c.situationPartWarning ?? false, htmlText);
      const normalizedLevel = normalizeLevel("germany", rawLevel);
      const summary = htmlText ? extractSummaryFromHtml(htmlText) : "";

      const sourceUrl = getSourceUrl(c, iso2);

      const idx = advisories.length;
      advisories.push({
        destIso2: iso2,
        rawLevel,
        normalizedLevel,
        summary,
        risks: [],
        officialUpdatedAt: c.lastModified ? new Date(c.lastModified * 1000) : null,
        sourceUrl,
      });

      // Always verify via HTML for known URLs — the opendata API sometimes misses partial warnings
      if (KNOWN_ADVISORY_URLS[iso2]) {
        needsHtmlVerification.push({ idx, url: KNOWN_ADVISORY_URLS[iso2] });
      }
    }

    const BATCH = 5;
    for (let i = 0; i < needsHtmlVerification.length; i += BATCH) {
      const batch = needsHtmlVerification.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async ({ idx, url }) => {
          try {
            const pageRes = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)", Accept: "text/html" },
              signal: AbortSignal.timeout(15_000),
            });
            if (!pageRes.ok) return;
            const pageHtml = await pageRes.text();
            const htmlLevel = extractLevelFromHtml(pageHtml);
            if (htmlLevel) {
              advisories[idx].rawLevel = htmlLevel;
              advisories[idx].normalizedLevel = normalizeLevel("germany", htmlLevel);
              advisories[idx].summary = extractSummaryFromHtml(pageHtml);
            }
          } catch { /* skip */ }
        })
      );
      if (i + BATCH < needsHtmlVerification.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Supplement compound-zone countries with static data.
    // The Auswärtiges Amt API sometimes reports a full Reisewarnung for the whole country
    // even when only specific provinces are affected. The static JSON provides the correct
    // base level and a summary with compound-zone keywords for known countries.
    try {
      const staticUrl = "https://raw.githubusercontent.com/MvdB-123/vibe/main/travel-advice/data/germany-advisories.json";
      const sRes = await fetch(staticUrl, { signal: AbortSignal.timeout(10_000) });
      if (sRes.ok) {
        const staticData: Array<{ iso2: string; rawLevel: string; summary: string; url: string; updatedAt?: string }> = await sRes.json();
        for (const entry of staticData) {
          const idx = advisories.findIndex((a) => a.destIso2 === entry.iso2);
          if (idx >= 0) {
            advisories[idx] = {
              ...advisories[idx],
              summary: entry.summary,
              rawLevel: entry.rawLevel,
              normalizedLevel: normalizeLevel("germany", entry.rawLevel),
            };
          } else {
            advisories.push({
              destIso2: entry.iso2,
              rawLevel: entry.rawLevel,
              normalizedLevel: normalizeLevel("germany", entry.rawLevel),
              summary: entry.summary,
              risks: [],
              officialUpdatedAt: entry.updatedAt ? new Date(entry.updatedAt) : null,
              sourceUrl: entry.url,
            });
          }
        }
      }
    } catch { /* skip */ }

    return { sourceId: "germany", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "germany", advisories: [], scrapedAt, error: String(err) };
  }
};
