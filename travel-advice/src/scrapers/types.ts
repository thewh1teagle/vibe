import type { NormalizedLevel } from "@/types";

export interface RawAdvisory {
  destIso2: string;
  rawLevel: string;
  normalizedLevel: NormalizedLevel;
  summary: string;
  risks: string[];
  officialUpdatedAt: Date | null;
  sourceUrl: string;
}

export interface ScraperResult {
  sourceId: string;
  advisories: RawAdvisory[];
  scrapedAt: Date;
  error?: string;
}

export type Scraper = () => Promise<ScraperResult>;
