import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

interface CanadaResponse {
  data: {
    "country-iso": string;
    "advisory-state": number; // 1=normal, 2=caution, 3=avoid non-essential, 4=avoid all
    "has-content": number;
    eng?: {
      name?: string;
      "url-slug"?: string;
      "friendly-date"?: string;
      "advisory-text"?: string;
      risks?: string[];
    };
  };
}

const STATE_TO_RAW: Record<number, string> = {
  1: "Take normal security precautions",
  2: "Exercise a high degree of caution",
  3: "Avoid non-essential travel",
  4: "Avoid all travel",
};

const BASE_URL = "https://data.international.gc.ca/travel-voyage/countries";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;
const REQUEST_TIMEOUT_MS = 15_000;

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

async function fetchCountry(iso2: string): Promise<RawAdvisory | null> {
  const res = await fetch(
    `${BASE_URL}/cta-cap-${iso2.toLowerCase()}.json`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
  );
  if (!res.ok) return null;

  const json: CanadaResponse = await res.json();
  const data = json.data;
  if (!data) return null;

  const state = data["advisory-state"];
  const eng = data.eng;
  const slug = eng?.["url-slug"] ?? iso2.toLowerCase();
  const advisoryText = eng?.["advisory-text"] ?? "";
  const summary = advisoryText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);

  // Use advisory-text to detect level if it starts with a known phrase (more reliable than state number)
  const TEXT_LEVELS: Array<{ phrase: string; rawLevel: string }> = [
    { phrase: "avoid all travel", rawLevel: "Avoid all travel" },
    { phrase: "avoid non-essential travel", rawLevel: "Avoid non-essential travel" },
    { phrase: "exercise a high degree of caution", rawLevel: "Exercise a high degree of caution" },
    { phrase: "take normal security precautions", rawLevel: "Take normal security precautions" },
  ];
  const summaryLower = summary.toLowerCase();
  const textDetected = TEXT_LEVELS.find(({ phrase }) => summaryLower.startsWith(phrase));
  const stateRaw = STATE_TO_RAW[state];
  if (!stateRaw) return null;
  const rawLevel = textDetected?.rawLevel ?? stateRaw;

  const normalizedLevel = normalizeLevel("canada", rawLevel);
  const risks = eng?.risks ?? [];

  const friendlyDate = eng?.["friendly-date"];
  const officialUpdatedAt = friendlyDate ? new Date(friendlyDate) : null;

  return {
    destIso2: iso2.toUpperCase(),
    rawLevel,
    normalizedLevel,
    summary,
    risks,
    officialUpdatedAt: officialUpdatedAt && !isNaN(officialUpdatedAt.getTime()) ? officialUpdatedAt : null,
    sourceUrl: `https://travel.gc.ca/destinations/${slug}`,
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
