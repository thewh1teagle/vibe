import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// Danish Ministry of Foreign Affairs (um.dk) — HTML scraping
// URL pattern: https://um.dk/rejse-og-ophold/rejse-til-udlandet/rejsevejledninger/{slug}

const LEVEL_PATTERNS: Array<{ pattern: RegExp; rawLevel: string; severity: number }> = [
  { pattern: /rejse frarådes/i, rawLevel: "Rejse frarådes", severity: 4 },
  { pattern: /fraråder?\s+ikke.nødvendige/i, rawLevel: "Fraråd ikke-nødvendige rejser", severity: 3 },
  { pattern: /undgå ikke.nødvendige/i, rawLevel: "Fraråd ikke-nødvendige rejser", severity: 3 },
  { pattern: /vær ekstra opmærksom/i, rawLevel: "Vær ekstra opmærksom", severity: 2 },
  { pattern: /vær forsigtig/i, rawLevel: "Vær forsigtig", severity: 2 },
  { pattern: /vær opmærksom/i, rawLevel: "Vær opmærksom", severity: 1 },
  { pattern: /ingen særlige/i, rawLevel: "Ingen særlige advarsler", severity: 0 },
];

const KNOWN_ISO_SLUGS: Record<string, string> = {
  "afghanistan": "AF", "albanien": "AL", "algeriet": "DZ", "angola": "AO",
  "argentina": "AR", "armenien": "AM", "australien": "AU", "azerbajdsjan": "AZ",
  "bahrain": "BH", "bangladesh": "BD", "belgien": "BE", "belize": "BZ",
  "benin": "BJ", "bhutan": "BT", "bolivia": "BO", "bosnien-hercegovina": "BA",
  "botswana": "BW", "brasilien": "BR", "brunei": "BN", "bulgarien": "BG",
  "burkina-faso": "BF", "burundi": "BI", "cambodja": "KH", "cameroun": "CM",
  "canada": "CA", "cape-verde": "CV", "chile": "CL", "kina": "CN",
  "colombia": "CO", "congo-brazzaville": "CG", "congo-kinshasa": "CD",
  "costa-rica": "CR", "cote-divoire": "CI", "kroatien": "HR", "cuba": "CU",
  "cypern": "CY", "tjekkiet": "CZ", "djibouti": "DJ", "dominica": "DM",
  "den-dominikanske-republik": "DO", "ecuador": "EC", "egypten": "EG",
  "el-salvador": "SV", "eritrea": "ER", "estland": "EE", "etiopien": "ET",
  "fiji": "FJ", "finland": "FI", "frankrig": "FR", "gabon": "GA",
  "georgien": "GE", "ghana": "GH", "graekenland": "GR", "guatemala": "GT",
  "guinea": "GN", "guinea-bissau": "GW", "guyana": "GY", "haiti": "HT",
  "honduras": "HN", "ungarn": "HU", "indien": "IN", "indonesien": "ID",
  "irak": "IQ", "iran": "IR", "irland": "IE", "israel": "IL",
  "italien": "IT", "jamaica": "JM", "japan": "JP", "jordan": "JO",
  "kasakhstan": "KZ", "kenya": "KE", "kirgisistan": "KG", "kuwait": "KW",
  "laos": "LA", "letland": "LV", "libanon": "LB", "liberia": "LR",
  "libyen": "LY", "litauen": "LT", "luxembourg": "LU", "madagascar": "MG",
  "malawi": "MW", "malaysia": "MY", "maldiverne": "MV", "mali": "ML",
  "malta": "MT", "marokko": "MA", "mauritanien": "MR", "mauritius": "MU",
  "mexico": "MX", "moldova": "MD", "mongoliet": "MN", "montenegro": "ME",
  "mozambique": "MZ", "myanmar": "MM", "namibia": "NA", "nepal": "NP",
  "new-zealand": "NZ", "nicaragua": "NI", "niger": "NE", "nigeria": "NG",
  "nordkorea": "KP", "nordmakedonien": "MK", "norge": "NO", "oman": "OM",
  "pakistan": "PK", "panama": "PA", "papua-new-guinea": "PG", "paraguay": "PY",
  "peru": "PE", "filippinerne": "PH", "polen": "PL", "portugal": "PT",
  "qatar": "QA", "roemien": "RO", "rusland": "RU", "rwanda": "RW",
  "saudi-arabien": "SA", "senegal": "SN", "serbien": "RS", "sierra-leone": "SL",
  "singapore": "SG", "slovakiet": "SK", "slovenien": "SI", "somalia": "SO",
  "sydafrika": "ZA", "sydkorea": "KR", "sydsudan": "SS", "spanien": "ES",
  "sri-lanka": "LK", "sudan": "SD", "surinam": "SR", "sverige": "SE",
  "schweiz": "CH", "syrien": "SY", "tadsjikistan": "TJ", "taiwan": "TW",
  "tanzania": "TZ", "thailand": "TH", "togo": "TG", "tonga": "TO",
  "trinidad-og-tobago": "TT", "tunesien": "TN", "tyrkiet": "TR",
  "turkmenistan": "TM", "uganda": "UG", "ukraine": "UA",
  "de-forenede-arabiske-emirater": "AE", "forenede-arabiske-emirater": "AE", "usa": "US", "uruguay": "UY",
  "usbekistan": "UZ", "vanuatu": "VU", "venezuela": "VE", "vietnam": "VN",
  "yemen": "YE", "zambia": "ZM", "zimbabwe": "ZW",
};

const NO_ADVISORY_PATTERNS = [
  /vi har ingen rejsevejledning/i,
  /ingen rejsevejledning for/i,
  /der er ikke udarbejdet.*rejsevejledning/i,
];

function hasNoAdvisory(html: string): boolean {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  return NO_ADVISORY_PATTERNS.some((p) => p.test(text));
}

function extractLevel(html: string): string {
  let minMatch: { rawLevel: string; severity: number } | null = null;
  for (const { pattern, rawLevel, severity } of LEVEL_PATTERNS) {
    if (pattern.test(html)) {
      if (!minMatch || severity < minMatch.severity) minMatch = { rawLevel, severity };
    }
  }
  return minMatch?.rawLevel ?? "Ingen særlige advarsler";
}

function extractSummary(html: string): string {
  const clean = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const match = clean.match(/<div[^>]*class="[^"]*field--name-body[^"]*"[^>]*>([\s\S]{0,3000})/i)
    ?? clean.match(/<main[^>]*>([\s\S]{0,3000})/i);
  const text = (match?.[1] ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(Del på?|Facebook|Twitter|LinkedIn|X \(Twitter\)|Del med)\b.*$/i, "")
    .trim();

  // Find the first sentence containing a travel-related Danish keyword
  const TRAVEL_KEYWORDS = /rejse|risiko|sikkerhed|anbefaler|fraråd/i;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const firstRelevant = sentences.findIndex((s) => TRAVEL_KEYWORDS.test(s));
  if (firstRelevant >= 0) {
    return sentences.slice(firstRelevant).join(" ").slice(0, 300);
  }
  return text.slice(0, 300);
}

export const denmarkScraper: Scraper = async () => {
  const scrapedAt = new Date();
  const advisories: RawAdvisory[] = [];

  const slugEntries = Object.entries(KNOWN_ISO_SLUGS);
  const BATCH = 3;

  for (let i = 0; i < slugEntries.length; i += BATCH) {
    const batch = slugEntries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ([slug, iso2]) => {
        try {
          const url = `https://um.dk/rejse-og-ophold/rejse-til-udlandet/rejsevejledninger/${slug}`;
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)",
              Accept: "text/html",
            },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) return;

          const html = await res.text();

          const noAdvisory = hasNoAdvisory(html);
          const rawLevel = noAdvisory ? "Geen reisadvies beschikbaar" : extractLevel(html);
          const normalizedLevel = noAdvisory ? "unknown" : normalizeLevel("denmark", rawLevel);
          const summary = noAdvisory ? "" : extractSummary(html);

          if (!noAdvisory && /ingen rejsevejledning/i.test(summary)) {
            advisories.push({
              destIso2: iso2,
              rawLevel: "Geen reisadvies beschikbaar",
              normalizedLevel: "unknown",
              summary: "",
              risks: [],
              officialUpdatedAt: null,
              sourceUrl: url,
            });
            return;
          }

          const dateMatch = html.match(/<time[^>]+datetime="([^"]+)"/i)
            ?? html.match(/(?:Senest\s+opdateret|Opdateret)[:\s]*(\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/i)
            ?? html.match(/(?:Senest\s+opdateret|Opdateret)[:\s]*(\d{4}-\d{2}-\d{2})/i)
            ?? html.match(/(?:Senest\s+opdateret|Opdateret)[:\s]*(\d{1,2}\.\s*\w+\s+\d{4})/i);
          let officialUpdatedAt: Date | null = null;
          if (dateMatch) {
            let dateStr = dateMatch[1];
            // Convert dd-mm-yyyy or dd.mm.yyyy to yyyy-mm-dd
            const dmy = dateStr.match(/^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})$/);
            if (dmy) {
              dateStr = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
            }
            officialUpdatedAt = new Date(dateStr);
          }

          advisories.push({
            destIso2: iso2,
            rawLevel,
            normalizedLevel,
            summary,
            risks: [],
            officialUpdatedAt: officialUpdatedAt && !isNaN(officialUpdatedAt.getTime()) ? officialUpdatedAt : null,
            sourceUrl: url,
          });
        } catch {
          // Skip individual country failures
        }
      })
    );
    if (i + BATCH < slugEntries.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { sourceId: "denmark", advisories, scrapedAt };
};
