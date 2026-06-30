import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// Sweden's Ministry for Foreign Affairs — swedenabroad.se — HTML scraping
// Tries multiple URL patterns with fallback

const URL_PATTERNS = [
  (slug: string) => `https://www.swedenabroad.se/sv/om-utlandet-f%C3%B6r-svenska-medborgare/${slug}/reseinformation/ambassadens-reseinformation/`,
  (slug: string) => `https://www.swedenabroad.se/sv/om-utlandet-f%C3%B6r-svenska-medborgare/${slug}/reseinformation/`,
  (slug: string) => `https://www.swedenabroad.se/sv/om-utlandet-f%C3%B6r-svenska-medborgare/${slug}/`,
  (slug: string) => `https://www.swedenabroad.se/sv/om-utlandet-för-svenska-medborgare/${slug}/reseinformation/ambassadens-reseinformation/`,
  (slug: string) => `https://www.swedenabroad.se/sv/om-utlandet-för-svenska-medborgare/${slug}/reseinformation/`,
  (slug: string) => `https://www.swedenabroad.se/sv/om-utlandet-för-svenska-medborgare/${slug}/`,
];

const PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
];

async function fetchWithProxyFallback(url: string, timeoutMs = 15_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)", Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 100) return text;
    }
  } catch { /* fall through */ }
  for (const buildProxyUrl of PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(url), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 100) return text;
    } catch { /* try next */ }
  }
  return null;
}

const LEVEL_PATTERNS: Array<{ pattern: RegExp; rawLevel: string; severity: number }> = [
  { pattern: /avråder?\s+från\s+alla\s+resor|avråder?\s+från\s+resor\b/i, rawLevel: "Avråd från resor", severity: 4 },
  { pattern: /avråder?\s+från\s+icke\s+nödvändiga/i, rawLevel: "Avråd från icke nödvändiga resor", severity: 3 },
  { pattern: /var\s+försiktig/i, rawLevel: "Var försiktig", severity: 2 },
  { pattern: /inga\s+särskilda/i, rawLevel: "Inga särskilda restriktioner", severity: 0 },
];

const KNOWN_ISO_SLUGS: Record<string, string> = {
  "afghanistan": "AF", "albanien": "AL", "algeriet": "DZ", "angola": "AO",
  "argentina": "AR", "armenien": "AM", "australien": "AU", "azerbajdzjan": "AZ",
  "bahrain": "BH", "bangladesh": "BD", "belgien": "BE", "belize": "BZ",
  "benin": "BJ", "bhutan": "BT", "bolivia": "BO", "bosnien-hercegovina": "BA",
  "botswana": "BW", "brasilien": "BR", "brunei": "BN", "bulgarien": "BG",
  "burkina-faso": "BF", "burundi": "BI", "kambodja": "KH", "kamerun": "CM",
  "kanada": "CA", "kap-verde": "CV", "chile": "CL", "kina": "CN",
  "colombia": "CO", "kongo-brazzaville": "CG", "kongo-kinshasa": "CD",
  "costa-rica": "CR", "elfenbenskusten": "CI", "kroatien": "HR", "kuba": "CU",
  "cypern": "CY", "tjeckien": "CZ", "djibouti": "DJ", "dominica": "DM",
  "dominikanska-republiken": "DO", "ecuador": "EC", "egypten": "EG",
  "el-salvador": "SV", "eritrea": "ER", "estland": "EE", "etiopien": "ET",
  "fiji": "FJ", "finland": "FI", "frankrike": "FR", "gabon": "GA",
  "georgien": "GE", "ghana": "GH", "grekland": "GR", "guatemala": "GT",
  "guinea": "GN", "guinea-bissau": "GW", "guyana": "GY", "haiti": "HT",
  "honduras": "HN", "ungern": "HU", "indien": "IN", "indonesien": "ID",
  "irak": "IQ", "iran": "IR", "irland": "IE", "israel": "IL",
  "italien": "IT", "jamaica": "JM", "japan": "JP", "jordanien": "JO",
  "kazakstan": "KZ", "kenya": "KE", "kirgizistan": "KG", "kuwait": "KW",
  "laos": "LA", "lettland": "LV", "libanon": "LB", "liberia": "LR",
  "libyen": "LY", "litauen": "LT", "luxemburg": "LU", "madagaskar": "MG",
  "malawi": "MW", "malaysia": "MY", "maldiverna": "MV", "mali": "ML",
  "malta": "MT", "marocko": "MA", "mauretanien": "MR", "mauritius": "MU",
  "mexiko": "MX", "moldavien": "MD", "mongoliet": "MN", "montenegro": "ME",
  "moçambique": "MZ", "myanmar": "MM", "namibia": "NA", "nepal": "NP",
  "nya-zeeland": "NZ", "nicaragua": "NI", "niger": "NE", "nigeria": "NG",
  "nordkorea": "KP", "nordmakedonien": "MK", "norge": "NO", "oman": "OM",
  "pakistan": "PK", "panama": "PA", "papua-nya-guinea": "PG", "paraguay": "PY",
  "peru": "PE", "filippinerna": "PH", "polen": "PL", "portugal": "PT",
  "qatar": "QA", "rumänien": "RO", "ryssland": "RU", "rwanda": "RW",
  "saudiarabien": "SA", "senegal": "SN", "serbien": "RS", "sierra-leone": "SL",
  "singapore": "SG", "slovakien": "SK", "slovenien": "SI", "somalia": "SO",
  "sydafrika": "ZA", "sydkorea": "KR", "sydsudan": "SS", "spanien": "ES",
  "sri-lanka": "LK", "sudan": "SD", "surinam": "SR", "schweiz": "CH",
  "syrien": "SY", "tadzjikistan": "TJ", "taiwan": "TW", "tanzania": "TZ",
  "thailand": "TH", "togo": "TG", "tonga": "TO", "trinidad-och-tobago": "TT",
  "tunisien": "TN", "turkmenistan": "TM", "turkiet": "TR", "uganda": "UG",
  "ukraina": "UA", "uae": "AE", "usa": "US", "uruguay": "UY",
  "uzbekistan": "UZ", "vanuatu": "VU", "venezuela": "VE", "vietnam": "VN",
  "jemen": "YE", "zambia": "ZM", "zimbabwe": "ZW",
};

function extractLevel(html: string): string {
  let minMatch: { rawLevel: string; severity: number } | null = null;
  for (const { pattern, rawLevel, severity } of LEVEL_PATTERNS) {
    if (pattern.test(html)) {
      if (!minMatch || severity < minMatch.severity) minMatch = { rawLevel, severity };
    }
  }
  return minMatch?.rawLevel ?? "Inga särskilda restriktioner";
}

const SWEDISH_MONTHS: Record<string, number> = {
  januari: 0, februari: 1, mars: 2, april: 3, maj: 4, juni: 5,
  juli: 6, augusti: 7, september: 8, oktober: 9, november: 10, december: 11,
};

function parseSwedishDate(raw: string): Date | null {
  const swedishMatch = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (swedishMatch) {
    const month = SWEDISH_MONTHS[swedishMatch[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(Date.UTC(Number(swedishMatch[3]), month, Number(swedishMatch[1])));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const dmyMatch = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmyMatch) {
    const d = new Date(Date.UTC(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1])));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function extractSummary(html: string): string {
  const clean = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const match = clean.match(/<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]{0,3000})/i)
    ?? clean.match(/<article[^>]*>([\s\S]{0,3000})/i)
    ?? clean.match(/<main[^>]*>([\s\S]{0,3000})/i);
  const text = (match?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Find the first sentence containing a travel-related Swedish keyword
  const TRAVEL_KEYWORDS = /resa|risk|säkerhet|rekommend|avråd|varning/i;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const firstRelevant = sentences.findIndex((s) => TRAVEL_KEYWORDS.test(s));
  if (firstRelevant >= 0) {
    return sentences.slice(firstRelevant).join(" ").slice(0, 300);
  }
  return text.slice(0, 300);
}

export const swedenScraper: Scraper = async () => {
  const scrapedAt = new Date();
  const advisories: RawAdvisory[] = [];

  const slugEntries = Object.entries(KNOWN_ISO_SLUGS);
  const BATCH = 3;

  for (let i = 0; i < slugEntries.length; i += BATCH) {
    const batch = slugEntries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ([slug, iso2]) => {
        try {
          let html: string | null = null;
          let url = "";

          for (const buildUrl of URL_PATTERNS) {
            url = buildUrl(slug);
            try {
              const text = await fetchWithProxyFallback(url, 15_000);
              if (text) {
                html = text;
                break;
              }
            } catch {
              // Try next URL pattern
            }
          }
          if (!html) return;
          const rawLevel = extractLevel(html);
          const normalizedLevel = normalizeLevel("sweden", rawLevel);
          const summary = extractSummary(html);

          const dateMatch = html.match(/<time[^>]+datetime="([^"]+)"/i)
            ?? html.match(/(?:Senast\s+uppdaterad|Uppdaterad|Publicerad)[:\s]*(\d{4}-\d{2}-\d{2})/i)
            ?? html.match(/(?:Senast\s+uppdaterad|Uppdaterad|Publicerad)[:\s]*(\d{1,2}\s+\w+\s+\d{4})/i)
            ?? html.match(/(?:Senast\s+uppdaterad|Uppdaterad|Publicerad)[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})/i)
            ?? html.match(/class="[^"]*(?:date|updated|published)[^"]*"[^>]*>[\s\S]{0,40}?(\d{4}-\d{2}-\d{2})/i)
            ?? html.match(/class="[^"]*(?:date|updated|published)[^"]*"[^>]*>[\s\S]{0,40}?(\d{1,2}\s+\w+\s+\d{4})/i)
            ?? html.match(/"dateModified"\s*:\s*"([^"]+)"/i)
            ?? html.match(/"datePublished"\s*:\s*"([^"]+)"/i)
            ?? html.match(/<meta[^>]+(?:date|modified)[^>]*content="([^"]+)"/i)
            ?? html.match(/\b(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})\b/i)
            ?? html.match(/(\d{4}-\d{2}-\d{2})/);

          const officialUpdatedAt = dateMatch ? parseSwedishDate(dateMatch[1]) : null;

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

  return { sourceId: "sweden", advisories, scrapedAt };
};
