/**
 * UK FCDO Travel Advice Scraper
 *
 * Stap 1 — Index ophalen:
 *   GET https://www.gov.uk/api/search.json
 *     ?filter_document_type=travel_advice&count=1000&fields=link,title
 *   → geeft een lijst van ~230 links zoals "/foreign-travel-advice/thailand"
 *
 * Stap 2 — Per land de content ophalen:
 *   GET https://www.gov.uk/api/content/foreign-travel-advice/{slug}
 *   Relevante velden in de response:
 *     details.alert_status   → string[] met adviesniveaus per regio
 *     details.summary        → HTML met de samenvatting
 *     details.country.iso2   → ISO alpha-2 code (bv. "TH")
 *     updated_at             → ISO 8601 datum van laatste update
 *
 * Niveaus (FCDO gebruikt vrije tekst per regio):
 *   "The FCDO advise against all travel"
 *   "The FCDO advise against all but essential travel"
 *   "Some parts of [country] — advise against all travel"
 *   "Some parts of [country] — advise against all but essential travel"
 *   "Exercise a high degree of caution"
 *   (geen waarschuwing) → "No advice against travel"
 *
 * We pakken het zwaarste niveau als er meerdere regio's zijn.
 */

import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";
import type { NormalizedLevel } from "@/types";

// --- Type-definities voor de FCDO JSON API ---

interface FCDOSearchResponse {
  results: Array<{ link: string; title: string }>;
  total: number;
}

interface FCDOContentResponse {
  base_path: string;
  updated_at?: string;
  details?: {
    alert_status?: string[];   // Array met adviesteksten per regio
    summary?: string;          // HTML-string
    country?: {
      iso2?: string;           // ISO alpha-2, bv. "TH"
      name?: string;
    };
  };
}

// --- Niveauvolgorde: ernstiger = hoger getal ---
const SEVERITY: Record<NormalizedLevel, number> = {
  unknown: 0,
  green: 1,
  yellow: 2,
  orange: 3,
  red: 4,
};

/**
 * Bepaalt het zwaarste adviesniveau uit de alert_status array.
 * FCDO kan meerdere entries hebben als bepaalde regio's een ander advies hebben.
 * We normaliseren elk item en pakken het hoogste.
 */
function pickWorstLevel(alertStatuses: string[]): { rawLevel: string; normalizedLevel: NormalizedLevel } {
  if (alertStatuses.length === 0) {
    return { rawLevel: "No advice against travel", normalizedLevel: "green" };
  }

  let worstRaw = alertStatuses[0];
  let worstNormalized: NormalizedLevel = "unknown";

  for (const status of alertStatuses) {
    const normalized = normalizeLevel("uk", status);
    if (SEVERITY[normalized] > SEVERITY[worstNormalized]) {
      worstNormalized = normalized;
      worstRaw = status;
    }
  }

  // Als normalisatie "unknown" geeft maar er toch een status is, gebruik "green" als fallback
  if (worstNormalized === "unknown") {
    worstNormalized = "green";
  }

  return { rawLevel: worstRaw, normalizedLevel: worstNormalized };
}

/**
 * Haalt risico-trefwoorden uit de samenvatting.
 */
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

/**
 * Strips HTML-tags en normaliseert whitespace.
 */
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

// --- Hoofd-scraper ---

export const ukScraper: Scraper = async () => {
  const scrapedAt = new Date();

  // Stap 1: haal de index op van alle reisadvies-pagina's
  let links: string[];
  try {
    const indexRes = await fetch(
      "https://www.gov.uk/api/search.json?filter_document_type=travel_advice&count=1000&fields=link,title",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!indexRes.ok) throw new Error(`Index HTTP ${indexRes.status}`);
    const indexData: FCDOSearchResponse = await indexRes.json();
    links = indexData.results.map((r) => r.link);
  } catch (err) {
    return { sourceId: "uk", advisories: [], scrapedAt, error: `Index ophalen mislukt: ${err}` };
  }

  // Stap 2: haal per land de detailpagina op (batches van 5, met 200ms pauze)
  const advisories: RawAdvisory[] = [];
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < links.length; i += BATCH_SIZE) {
    const batch = links.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (link): Promise<RawAdvisory | null> => {
        const res = await fetch(`https://www.gov.uk/api/content${link}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;

        const page: FCDOContentResponse = await res.json();
        const iso2 = page.details?.country?.iso2?.toUpperCase();
        if (!iso2) return null;

        const alertStatuses = page.details?.alert_status ?? [];
        const { rawLevel, normalizedLevel } = pickWorstLevel(alertStatuses);

        const summaryText = stripHtml(page.details?.summary ?? "").slice(0, 400);
        const risks = extractRisks(summaryText);

        return {
          destIso2: iso2,
          rawLevel,
          normalizedLevel,
          summary: summaryText,
          risks,
          officialUpdatedAt: page.updated_at ? new Date(page.updated_at) : null,
          sourceUrl: `https://www.gov.uk${link}`,
        };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        advisories.push(result.value);
      }
      // Afgewezen of null → stilzwijgend overslaan
    }

    // Kleine pauze tussen batches om rate limiting te vermijden
    if (i + BATCH_SIZE < links.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { sourceId: "uk", advisories, scrapedAt };
};
