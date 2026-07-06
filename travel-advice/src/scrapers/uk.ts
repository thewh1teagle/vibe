import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";
import type { NormalizedLevel } from "@/types";

// Fallback for countries where FCDO API returns iso2: null
const SLUG_TO_ISO2: Record<string, string> = {
  "united-arab-emirates": "AE", "saudi-arabia": "SA", "qatar": "QA",
  "bahrain": "BH", "kuwait": "KW", "oman": "OM", "jordan": "JO",
  "lebanon": "LB", "iraq": "IQ", "iran": "IR", "syria": "SY",
  "yemen": "YE", "israel": "IL", "egypt": "EG", "libya": "LY",
  "tunisia": "TN", "algeria": "DZ", "morocco": "MA", "sudan": "SD",
  "south-sudan": "SS", "ethiopia": "ET", "somalia": "SO", "kenya": "KE",
  "nigeria": "NG", "ghana": "GH", "senegal": "SN", "ivory-coast": "CI",
  "cameroon": "CM", "democratic-republic-congo": "CD", "angola": "AO",
  "mozambique": "MZ", "zimbabwe": "ZW", "zambia": "ZM", "tanzania": "TZ",
  "uganda": "UG", "rwanda": "RW", "madagascar": "MG", "south-africa": "ZA",
  "pakistan": "PK", "india": "IN", "bangladesh": "BD", "sri-lanka": "LK",
  "nepal": "NP", "afghanistan": "AF", "myanmar": "MM",
  "cambodia": "KH", "laos": "LA", "vietnam": "VN", "philippines": "PH",
  "indonesia": "ID", "malaysia": "MY", "thailand": "TH", "china": "CN",
  "north-korea": "KP", "russia": "RU", "ukraine": "UA", "belarus": "BY",
  "turkey": "TR", "georgia": "GE", "armenia": "AM", "azerbaijan": "AZ",
  "kazakhstan": "KZ", "uzbekistan": "UZ", "turkmenistan": "TM",
  "tajikistan": "TJ", "kyrgyzstan": "KG", "mongolia": "MN",
  "venezuela": "VE", "colombia": "CO", "ecuador": "EC", "peru": "PE",
  "bolivia": "BO", "brazil": "BR", "argentina": "AR", "chile": "CL",
  "mexico": "MX", "cuba": "CU", "haiti": "HT", "jamaica": "JM",
};

interface FCDOContentResponse {
  base_path: string;
  updated_at?: string;
  details?: {
    alert_status?: string[];
    summary?: string;
    country?: {
      iso2?: string;
      name?: string;
    };
  };
}

const SEVERITY: Record<NormalizedLevel, number> = {
  unknown: 0,
  green: 1,
  yellow: 2,
  orange: 3,
  red: 4,
};

function pickWorstLevel(alertStatuses: string[]): { rawLevel: string; normalizedLevel: NormalizedLevel } {
  if (alertStatuses.length === 0) {
    return { rawLevel: "No advice against travel", normalizedLevel: "green" };
  }

  // FCDO uses underscore slugs; map to normalized levels and human-readable labels
  const SLUG_MAP: Record<string, { level: NormalizedLevel; label: string }> = {
    "no_travel_advice": { level: "green", label: "No advice against travel" },
    "avoid_all_but_essential_travel_to_parts_of_country": { level: "yellow", label: "Advise against all but essential travel to parts" },
    "avoid_all_but_essential_travel_to_parts": { level: "yellow", label: "Advise against all but essential travel to parts" },
    "avoid_all_but_essential_travel_to_whole_country": { level: "orange", label: "Advise against all but essential travel" },
    "avoid_all_but_essential_travel": { level: "orange", label: "Advise against all but essential travel" },
    "avoid_all_travel_to_parts_of_country": { level: "orange", label: "Advise against all travel to parts" },
    "avoid_all_travel_to_parts": { level: "orange", label: "Advise against all travel to parts" },
    "avoid_all_travel_to_whole_country": { level: "red", label: "Advise against all travel" },
    "avoid_all_travel": { level: "red", label: "Advise against all travel" },
  };

  let worstRaw = SLUG_MAP[alertStatuses[0]]?.label ?? alertStatuses[0] ?? "No advice against travel";
  let worstNormalized: NormalizedLevel = "green";

  for (const status of alertStatuses) {
    const entry = SLUG_MAP[status];
    const normalized = entry?.level ?? normalizeLevel("uk", status);
    if (SEVERITY[normalized] > SEVERITY[worstNormalized]) {
      worstNormalized = normalized;
      worstRaw = entry?.label ?? status;
    }
  }

  return { rawLevel: worstRaw, normalizedLevel: worstNormalized };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRisks(text: string): string[] {
  const KEYWORDS: Record<string, string> = {
    terrorism: "terrorisme",
    crime: "criminaliteit",
    kidnapping: "ontvoering",
    "civil unrest": "onrust",
    "political instability": "politieke instabiliteit",
    "natural disasters": "natuurrampen",
    landmines: "landmijnen",
    piracy: "piraterij",
    "health risks": "gezondheidsrisico's",
    flooding: "overstromingen",
  };
  const lower = text.toLowerCase();
  return Object.entries(KEYWORDS)
    .filter(([keyword]) => lower.includes(keyword))
    .map(([, label]) => label);
}

async function getCountrySlugs(): Promise<string[]> {
  const res = await fetch("https://www.gov.uk/foreign-travel-advice", {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 travel-comparator/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Index HTTP ${res.status}`);

  const html = await res.text();
  const slugs: string[] = [];
  const matches = html.matchAll(/href="\/foreign-travel-advice\/([a-z][a-z0-9-]+)"/g);
  for (const match of matches) {
    if (!slugs.includes(match[1])) slugs.push(match[1]);
  }
  return slugs;
}

export const ukScraper: Scraper = async () => {
  const scrapedAt = new Date();

  let slugs: string[];
  try {
    slugs = await getCountrySlugs();
  } catch (err) {
    return { sourceId: "uk", advisories: [], scrapedAt, error: `Index ophalen mislukt: ${err}` };
  }

  const advisories: RawAdvisory[] = [];
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = slugs.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (slug): Promise<RawAdvisory | null> => {
        const res = await fetch(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;

        const page: FCDOContentResponse = await res.json();
        // API sometimes omits iso2; fall back to slug-based lookup
        const iso2 = (page.details?.country?.iso2 ?? SLUG_TO_ISO2[slug])?.toUpperCase();
        if (!iso2) return null;

        const alertStatuses = page.details?.alert_status ?? [];
        const { rawLevel, normalizedLevel } = pickWorstLevel(alertStatuses);

        // Synthesize compound-zone indicator from all alert_status slugs so that
        // compound detection in page.tsx can find multiple levels even when the
        // FCDO API summary is too short to include regional breakdown text.
        const SLUG_LABELS: Record<string, string> = {
          "avoid_all_travel_to_parts_of_country": "Advise against all travel to parts of the country.",
          "avoid_all_travel_to_parts": "Advise against all travel to parts of the country.",
          "avoid_all_but_essential_travel_to_parts_of_country": "Advise against all but essential travel to parts of the country.",
          "avoid_all_but_essential_travel_to_parts": "Advise against all but essential travel to parts of the country.",
          "avoid_all_but_essential_travel_to_whole_country": "Advise against all but essential travel.",
          "avoid_all_travel_to_whole_country": "Advise against all travel.",
          "avoid_all_travel": "Advise against all travel.",
        };
        const alertPhrases = alertStatuses
          .map((s: string) => SLUG_LABELS[s])
          .filter(Boolean)
          .join(" ");
        const baseSummary = stripHtml(page.details?.summary ?? "").slice(0, 400);
        const summaryText = alertPhrases ? `${baseSummary} ${alertPhrases}`.trim() : baseSummary;
        const risks = extractRisks(summaryText);

        return {
          destIso2: iso2,
          rawLevel,
          normalizedLevel,
          summary: summaryText,
          risks,
          officialUpdatedAt: page.updated_at ? new Date(page.updated_at) : null,
          sourceUrl: `https://www.gov.uk/foreign-travel-advice/${slug}`,
        };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        advisories.push(result.value);
      }
    }

    if (i + BATCH_SIZE < slugs.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // Supplement compound-zone countries with static data.
  // The FCDO JSON API only returns a short summary without regional breakdown.
  // The static JSON provides richer summaries with specific area names for known countries.
  try {
    const staticUrl = "https://raw.githubusercontent.com/MvdB-123/vibe/main/travel-advice/data/uk-advisories.json";
    const res = await fetch(staticUrl, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const staticData: Array<{ iso2: string; rawLevel: string; summary: string; url: string; updatedAt?: string }> = await res.json();
      for (const entry of staticData) {
        const idx = advisories.findIndex((a) => a.destIso2 === entry.iso2);
        if (idx >= 0) {
          advisories[idx] = { ...advisories[idx], summary: entry.summary, rawLevel: entry.rawLevel, normalizedLevel: normalizeLevel("uk", entry.rawLevel) };
        } else {
          advisories.push({
            destIso2: entry.iso2,
            rawLevel: entry.rawLevel,
            normalizedLevel: normalizeLevel("uk", entry.rawLevel),
            summary: entry.summary,
            risks: [],
            officialUpdatedAt: entry.updatedAt ? new Date(entry.updatedAt) : null,
            sourceUrl: entry.url,
          });
        }
      }
    }
  } catch { /* skip */ }

  return { sourceId: "uk", advisories, scrapedAt };
};
