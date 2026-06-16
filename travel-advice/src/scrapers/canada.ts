import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const BASE_JSON = "https://data.international.gc.ca/travel-voyage/countries";
const BASE_HTML = "https://travel.gc.ca/destinations";
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 20_000;

// Advisory level patterns on travel.gc.ca HTML pages
const LEVEL_PATTERNS: Array<{ pattern: RegExp; rawLevel: string }> = [
  { pattern: /avoid all travel/i, rawLevel: "Avoid all travel" },
  { pattern: /avoid non-essential travel/i, rawLevel: "Avoid non-essential travel" },
  { pattern: /exercise a high degree of caution/i, rawLevel: "Exercise a high degree of caution" },
  { pattern: /take normal security precautions/i, rawLevel: "Take normal security precautions" },
  { pattern: /exercise normal security precautions/i, rawLevel: "Exercise normal security precautions" },
];

const ALL_ISO2 = [
  "AF","AL","DZ","AD","AO","AG","AR","AM","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ",
  "BJ","BT","BO","BA","BW","BR","BN","BG","BF","BI","CV","KH","CM","CF","TD","CL","CN","CO",
  "KM","CD","CG","CR","CI","HR","CU","CY","CZ","DJ","DM","DO","EC","EG","SV","GQ","ER","EE",
  "SZ","ET","FJ","FI","FR","GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY","HT","HN",
  "HU","IS","IN","ID","IR","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KP","KR","XK",
  "KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MG","MW","MY","MV","ML","MT","MH",
  "MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM","NA","NR","NP","NL","NZ","NI","NE",
  "NG","MK","NO","OM","PK","PW","PA","PG","PY","PE","PH","PL","PT","QA","RO","RU","RW","KN",
  "LC","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","SB","SO","ZA","SS","ES",
  "LK","SD","SR","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TO","TT","TN","TR","TM","TV",
  "UG","UA","AE","GB","US","UY","UZ","VU","VE","VN","YE","ZM","ZW","PS",
];

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

function extractSummaryFromHtml(html: string, levelText: string): string {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const idx = plain.toLowerCase().indexOf(levelText.toLowerCase());
  if (idx >= 0) return plain.slice(idx, idx + 350).trim().slice(0, 300);
  return plain.slice(0, 300);
}

function extractDateFromHtml(html: string): Date | null {
  const match = html.match(/<time[^>]+datetime="([^"]+)"/i)
    ?? html.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const d = new Date(match[1]);
  return isNaN(d.getTime()) ? null : d;
}

async function fetchCountry(iso2: string): Promise<RawAdvisory | null> {
  // First get slug from JSON API (fast, just need url-slug field)
  let slug = iso2.toLowerCase();
  try {
    const jsonRes = await fetch(`${BASE_JSON}/cta-cap-${iso2.toLowerCase()}.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (jsonRes.ok) {
      const json = await jsonRes.json();
      slug = json?.data?.eng?.["url-slug"] ?? slug;
    }
  } catch { /* use default slug */ }

  // Fetch HTML page for actual current advisory level
  const htmlUrl = `${BASE_HTML}/${slug}`;
  const res = await fetch(htmlUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const html = await res.text();
  const rawLevel = extractLevelFromHtml(html);
  if (!rawLevel) return null;

  const normalizedLevel = normalizeLevel("canada", rawLevel);
  const summary = extractSummaryFromHtml(html, rawLevel);
  const officialUpdatedAt = extractDateFromHtml(html);

  return {
    destIso2: iso2.toUpperCase(),
    rawLevel,
    normalizedLevel,
    summary,
    risks: [],
    officialUpdatedAt,
    sourceUrl: htmlUrl,
  };
}

export const canadaScraper: Scraper = async () => {
  const scrapedAt = new Date();
  const advisories: RawAdvisory[] = [];

  for (let i = 0; i < ALL_ISO2.length; i += BATCH_SIZE) {
    const batch = ALL_ISO2.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchCountry));

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        advisories.push(result.value);
      }
    }

    if (i + BATCH_SIZE < ALL_ISO2.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { sourceId: "canada", advisories, scrapedAt };
};
