import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// Full list of ISO alpha-2 codes we want to fetch from Canada's API
const COUNTRY_CODES = [
  "AF","AL","DZ","AD","AO","AG","AR","AM","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ",
  "BJ","BT","BO","BA","BW","BR","BN","BG","BF","BI","CV","KH","CM","CA","CF","TD","CL","CN",
  "CO","KM","CD","CG","CR","CI","HR","CU","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ",
  "ER","EE","SZ","ET","FJ","FI","FR","GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY",
  "HT","HN","HU","IS","IN","ID","IR","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KP",
  "KR","XK","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MG","MW","MY","MV","ML",
  "MT","MH","MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM","NA","NR","NP","NL","NZ",
  "NI","NE","NG","MK","NO","OM","PK","PW","PA","PG","PY","PE","PH","PL","PT","QA","RO","RU",
  "RW","KN","LC","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","SB","SO","ZA",
  "SS","ES","LK","SD","SR","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TO","TT","TN","TR",
  "TM","TV","UG","UA","AE","GB","US","UY","UZ","VU","VE","VN","YE","ZM","ZW","PS",
];

interface CanadaAdvisory {
  iso: string;
  eng: {
    title?: string;
    recommendations?: { risk_level?: string };
    security_status?: string;
    url?: string;
    date_published?: string;
    advisory_text?: string;
  };
}

function extractRisks(text: string): string[] {
  const keywords = [
    "terrorism", "crime", "kidnapping", "civil unrest", "health",
    "natural disasters", "landmines", "piracy", "demonstrations",
  ];
  return keywords.filter((k) => text.toLowerCase().includes(k));
}

export const canadaScraper: Scraper = async () => {
  const scrapedAt = new Date();
  const advisories: RawAdvisory[] = [];

  // Canada's API has one endpoint per country
  const BATCH = 10;
  for (let i = 0; i < COUNTRY_CODES.length; i += BATCH) {
    const batch = COUNTRY_CODES.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (iso2) => {
        try {
          const res = await fetch(
            `https://data.international.gc.ca/travel-voyage/countries/cta-cap-${iso2.toLowerCase()}.json`,
            { signal: AbortSignal.timeout(15_000) }
          );
          if (!res.ok) return; // country may not exist in their system

          const data: CanadaAdvisory = await res.json();
          const eng = data.eng ?? {};

          // Risk level comes from security_status field
          const rawLevel = eng.security_status ?? eng.recommendations?.risk_level ?? "";
          if (!rawLevel) return;

          const normalizedLevel = normalizeLevel("canada", rawLevel);
          const text = eng.advisory_text ?? "";
          const summary = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
          const risks = extractRisks(text);

          advisories.push({
            destIso2: iso2,
            rawLevel,
            normalizedLevel,
            summary,
            risks,
            officialUpdatedAt: eng.date_published ? new Date(eng.date_published) : null,
            sourceUrl: eng.url ?? `https://travel.gc.ca/destinations/${iso2.toLowerCase()}`,
          });
        } catch {
          // Skip individual country failures silently
        }
      })
    );
  }

  return { sourceId: "canada", advisories, scrapedAt };
};
