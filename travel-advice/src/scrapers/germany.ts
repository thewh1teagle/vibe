import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LEVEL_PATTERNS: Array<{ pattern: RegExp; rawLevel: string }> = [
  { pattern: /teilreisewarnung/i, rawLevel: "Teilreisewarnung" },
  { pattern: /reisewarnung/i, rawLevel: "Reisewarnung" },
  { pattern: /von nicht notwendigen reisen|nicht notwendige reisen/i, rawLevel: "Von nicht notwendigen Reisen abraten" },
  { pattern: /erh.hte vorsicht|besondere vorsicht|sicherheitshinweise beachten/i, rawLevel: "Erhöhte Vorsicht" },
];

function flagsToRaw(warning: boolean, partialWarning: boolean, situationWarning: boolean, situationPartWarning: boolean, contentHtml?: string): string {
  if (warning) return "Reisewarnung";
  if (partialWarning) return "Teilreisewarnung";
  if (situationPartWarning) return "Von nicht notwendigen Reisen abraten";
  if (situationWarning) return "Erhöhte Vorsicht";

  if (contentHtml) {
    const text = contentHtml.replace(/<[^>]+>/g, " ").toLowerCase();
    for (const { pattern, rawLevel } of LEVEL_PATTERNS) {
      if (pattern.test(text)) return rawLevel;
    }
  }

  return "Keine besonderen Sicherheitshinweise";
}

function extractLevelFromHtml(html: string): string | null {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  for (const { pattern, rawLevel } of LEVEL_PATTERNS) {
    if (pattern.test(plain)) return rawLevel;
  }
  return null;
}

function extractSummaryFromHtml(html: string): string {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const { pattern } of LEVEL_PATTERNS) {
    const match = plain.match(pattern);
    if (match?.index !== undefined) {
      return plain.slice(match.index, match.index + 350).trim().slice(0, 300);
    }
  }
  return plain.slice(0, 300);
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
      const summary = htmlText
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300) || "";

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

      if (normalizedLevel === "green" && !htmlText && KNOWN_ADVISORY_URLS[iso2]) {
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

    return { sourceId: "germany", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "germany", advisories: [], scrapedAt, error: String(err) };
  }
};
