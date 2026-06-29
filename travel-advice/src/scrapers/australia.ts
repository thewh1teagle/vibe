import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// Smartraveller numeric level → raw string
const LEVEL_MAP: Record<number, string> = {
  1: "Exercise normal safety precautions",
  2: "Exercise a high degree of caution",
  3: "Reconsider your need to travel",
  4: "Do not travel",
};

interface AUDestination {
  iso2?: string;
  iso?: string;
  country_code?: string;
  iso_code?: string;
  advisory_level?: number;
  level?: number;
  overall_advisory_level?: number;
  name?: string;
  title?: string;
  summary?: string;
  updated_at?: string;
  last_updated?: string;
  url?: string;
  slug?: string;
  risks?: string[];
  risk_factors?: string[];
}

const URLS = [
  "https://www.smartraveller.gov.au/api/v2/destinations",
  "https://www.smartraveller.gov.au/destinations-export",
];

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (err) {
    // 1 retry after 2s delay
    await new Promise((r) => setTimeout(r, 2_000));
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }
}

export const australiaScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    const fetchOpts: RequestInit = {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 travel-comparator/1.0" },
      signal: AbortSignal.timeout(45_000),
    };

    let res: Response | undefined;
    for (const url of URLS) {
      try {
        res = await fetchWithRetry(url, fetchOpts);
        break;
      } catch {
        // try next URL
      }
    }
    if (!res) throw new Error("All Smartraveller URLs failed");

    const data: AUDestination[] = await res.json();
    const advisories: RawAdvisory[] = [];

    for (const dest of data) {
      const iso2 = dest.iso2 ?? dest.iso ?? dest.country_code ?? dest.iso_code;
      if (!iso2) continue;

      const levelNum = dest.advisory_level ?? dest.level ?? dest.overall_advisory_level ?? 0;
      const rawLevel = LEVEL_MAP[levelNum];
      if (!rawLevel) continue;

      const normalizedLevel = normalizeLevel("australia", rawLevel);
      const summary = (dest.summary ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
      const risks = dest.risks ?? dest.risk_factors ?? [];

      const updatedStr = dest.updated_at ?? dest.last_updated;

      advisories.push({
        destIso2: iso2.toUpperCase(),
        rawLevel,
        normalizedLevel,
        summary,
        risks,
        officialUpdatedAt: updatedStr ? new Date(updatedStr) : null,
        sourceUrl: dest.url ?? (dest.slug
          ? `https://www.smartraveller.gov.au/destinations/${dest.slug}`
          : `https://www.smartraveller.gov.au/destinations`),
      });
    }

    return { sourceId: "australia", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "australia", advisories: [], scrapedAt, error: String(err) };
  }
};
