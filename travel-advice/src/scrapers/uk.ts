import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// UK FCDO uses country slugs; we map from ISO-2 to slug
// The API lists all countries at /api/search/formatted_search_result.json?filter_field_name=world_locations_travel_advice
// We fetch the index first, then individual pages as needed

interface FCDOSearchResult {
  results: Array<{
    link: string;
    title: string;
    document_type?: string;
  }>;
  total: number;
  start: number;
  display_page_size: number;
}

interface FCDOContent {
  base_path: string;
  details?: {
    alert_status?: string[];
    summary?: string;
    country?: { iso2?: string };
  };
  updated_at?: string;
  first_published_at?: string;
}

function extractLevel(alertStatuses: string[]): string {
  // FCDO uses alert_status array — pick the most severe
  const levels = [
    "advise against all travel",
    "advise against all but essential travel",
    "some parts advise against all but essential travel",
    "exercise a high degree of caution",
    "no advice against travel",
  ];
  for (const level of levels) {
    if (alertStatuses.some((s) => s.toLowerCase().includes(level))) {
      return alertStatuses.find((s) => s.toLowerCase().includes(level)) ?? level;
    }
  }
  return alertStatuses[0] ?? "No advice against travel";
}

function extractRisks(summary: string): string[] {
  const keywords = [
    "terrorism", "crime", "kidnapping", "civil unrest", "political instability",
    "natural disasters", "health risks", "landmines", "piracy",
  ];
  return keywords.filter((k) => summary.toLowerCase().includes(k));
}

export const ukScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    // Step 1: get list of all travel advice pages
    const pageSize = 1000;
    const searchRes = await fetch(
      `https://www.gov.uk/api/search.json?filter_document_type=travel_advice&count=${pageSize}&fields=link,title`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) }
    );
    if (!searchRes.ok) throw new Error(`Search HTTP ${searchRes.status}`);

    const searchData: FCDOSearchResult = await searchRes.json();
    const links = searchData.results.map((r) => r.link);

    const advisories: RawAdvisory[] = [];
    const BATCH = 5;

    for (let i = 0; i < links.length; i += BATCH) {
      const batch = links.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (link) => {
          try {
            const res = await fetch(`https://www.gov.uk/api/content${link}`, {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok) return;

            const page: FCDOContent = await res.json();
            const iso2 = page.details?.country?.iso2;
            if (!iso2) return;

            const alertStatuses = page.details?.alert_status ?? [];
            const rawLevel = alertStatuses.length > 0
              ? extractLevel(alertStatuses)
              : "No advice against travel";

            const normalizedLevel = normalizeLevel("uk", rawLevel);
            const summaryHtml = page.details?.summary ?? "";
            const summary = summaryHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
            const risks = extractRisks(summary);

            advisories.push({
              destIso2: iso2.toUpperCase(),
              rawLevel,
              normalizedLevel,
              summary,
              risks,
              officialUpdatedAt: page.updated_at ? new Date(page.updated_at) : null,
              sourceUrl: `https://www.gov.uk${link}`,
            });
          } catch {
            // Skip individual country failures
          }
        })
      );
    }

    return { sourceId: "uk", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "uk", advisories: [], scrapedAt, error: String(err) };
  }
};
