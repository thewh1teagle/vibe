/**
 * Canada — Global Affairs Canada Travel Advice Scraper
 *
 * API-structuur:
 *   GET https://data.international.gc.ca/travel-voyage/countries/cta-cap-{iso2}.json
 *
 *   Voorbeeld voor Thailand (iso2 = "th"):
 *   {
 *     "iso": "TH",
 *     "eng": {
 *       "country":          "Thailand",
 *       "date_published":   "2024-10-31",
 *       "security_status":  "Exercise a high degree of caution",
 *       "url":              "https://travel.gc.ca/destinations/thailand",
 *       "advisory_text":    "<p>Exercise a high degree of caution...</p>",
 *       "risk":             ["crime", "terrorism"]
 *     },
 *     "fra": { ... }   ← Franse vertaling, negeren
 *   }
 *
 * Niveaus (security_status veld):
 *   "Take normal security precautions"     → green
 *   "Exercise a high degree of caution"    → yellow
 *   "Avoid non-essential travel"           → orange
 *   "Avoid all travel"                     → red
 *
 * Strategie:
 *   Per land één HTTP-verzoek. We halen ~190 landen parallel op in
 *   batches van 10. Landen zonder pagina geven een 404 terug → overslaan.
 */

import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// --- Type-definities ---

interface CanadaCountryResponse {
  iso: string;
  eng: {
    country?: string;
    date_published?: string;
    security_status?: string;
    url?: string;
    advisory_text?: string;
    risk?: string[];
  };
}

// --- Constanten ---

const BASE_URL = "https://data.international.gc.ca/travel-voyage/countries";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 150;
const REQUEST_TIMEOUT_MS = 15_000;

// Alle landen waarvoor we een verzoek sturen.
// Canada heeft niet voor elk ISO-2 land een pagina; ontbrekende geven 404.
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

// --- Hulpfuncties ---

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRisks(riskArray: string[] | undefined, text: string): string[] {
  // Canada geeft soms een expliciet risk-array mee; anders uit tekst halen
  if (riskArray && riskArray.length > 0) return riskArray;

  const KEYWORDS: Record<string, string> = {
    terrorism: "terrorisme",
    crime: "criminaliteit",
    kidnapping: "ontvoering",
    "civil unrest": "onrust",
    "political instability": "politieke instabiliteit",
    "natural disasters": "natuurrampen",
    flooding: "overstromingen",
    landmines: "landmijnen",
    piracy: "piraterij",
  };
  const lower = text.toLowerCase();
  return Object.entries(KEYWORDS)
    .filter(([kw]) => lower.includes(kw))
    .map(([, label]) => label);
}

async function fetchCountry(iso2: string): Promise<RawAdvisory | null> {
  const res = await fetch(
    `${BASE_URL}/cta-cap-${iso2.toLowerCase()}.json`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
  );
  if (!res.ok) return null; // 404 = geen advies voor dit land

  const data: CanadaCountryResponse = await res.json();
  const eng = data.eng;

  const rawLevel = eng.security_status?.trim() ?? "";
  if (!rawLevel) return null;

  const normalizedLevel = normalizeLevel("canada", rawLevel);
  const plainText = stripHtml(eng.advisory_text ?? "");
  const summary = plainText.slice(0, 400);
  const risks = extractRisks(eng.risk, plainText);

  return {
    destIso2: iso2.toUpperCase(),
    rawLevel,
    normalizedLevel,
    summary,
    risks,
    officialUpdatedAt: eng.date_published ? new Date(eng.date_published) : null,
    sourceUrl: eng.url ?? `https://travel.gc.ca/destinations/${iso2.toLowerCase()}`,
  };
}

// --- Hoofd-scraper ---

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
