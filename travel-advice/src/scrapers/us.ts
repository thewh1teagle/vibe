import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// ISO country name → ISO alpha-2 lookup (best-effort; we match on the title from RSS)
// The US RSS feed includes a link like /destinations/XX/ which gives us the ISO code directly
const DEST_REGEX = /\/destinations\/([A-Z]{2})\//i;
const LEVEL_REGEX = /Level\s+(\d+):\s+([^.]+)/i;

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}

async function parseRSS(xml: string): Promise<RSSItem[]> {
  const items: RSSItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];
    const get = (tag: string) =>
      block.match(new RegExp(`<${tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`))?.[1]?.trim() ?? "";

    items.push({
      title: get("title"),
      link: get("link"),
      description: get("description"),
      pubDate: get("pubDate"),
    });
  }
  return items;
}

function extractRisks(text: string): string[] {
  const keywords = [
    "terrorism", "crime", "kidnapping", "civil unrest", "health",
    "natural disasters", "demonstrations", "piracy", "political instability",
  ];
  return keywords.filter((k) => text.toLowerCase().includes(k));
}

export const usScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    const res = await fetch(
      "https://travel.state.gov/_res/rss/TAsTWs.xml",
      {
        headers: { "User-Agent": "Mozilla/5.0 travel-comparator/1.0" },
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();
    const items = await parseRSS(xml);

    const advisories: RawAdvisory[] = [];

    for (const item of items) {
      // Extract ISO from URL: /destinations/XX/
      const isoMatch = item.link.match(DEST_REGEX);
      if (!isoMatch) continue;
      const iso2 = isoMatch[1].toUpperCase();

      // Extract level from description or title
      const levelMatch = (item.description + " " + item.title).match(LEVEL_REGEX);
      const rawLevel = levelMatch
        ? `Level ${levelMatch[1]}: ${levelMatch[2].trim()}`
        : "Exercise Normal Precautions";

      const normalizedLevel = normalizeLevel("us", rawLevel);
      const text = item.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const summary = text.slice(0, 300);
      const risks = extractRisks(text);

      advisories.push({
        destIso2: iso2,
        rawLevel,
        normalizedLevel,
        summary,
        risks,
        officialUpdatedAt: item.pubDate ? new Date(item.pubDate) : null,
        sourceUrl: item.link.startsWith("http") ? item.link : `https://travel.state.gov${item.link}`,
      });
    }

    return { sourceId: "us", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "us", advisories: [], scrapedAt, error: String(err) };
  }
};
