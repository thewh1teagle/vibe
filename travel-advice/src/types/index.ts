export type NormalizedLevel = "green" | "yellow" | "orange" | "red" | "unknown";
export type ScrapeStatus = "running" | "success" | "partial" | "failed";
export type FetchMethod = "json_api" | "xml_feed" | "html";

export interface SourceConfig {
  id: string;
  nameNl: string;
  nameEn: string;
  countryIso2: string;
  flagEmoji: string;
  baseUrl: string;
  fetchMethod: FetchMethod;
  active: boolean;
  fetchIntervalH: number;
  priority: number;
}

export interface AdvisoryRow {
  id: string;
  sourceId: string;
  sourceNameNl: string;
  sourceNameEn: string;
  sourceFlagEmoji: string;
  destIso2: string;
  rawLevel: string;
  normalizedLevel: NormalizedLevel;
  summary: string;
  risks: string[];
  officialUpdatedAt: Date | null;
  scrapedAt: Date;
  sourceUrl: string;
  isStale: boolean;
}

export interface CountryWithAdvisories {
  isoAlpha2: string;
  isoAlpha3: string;
  nameNl: string;
  nameEn: string;
  regionNl: string;
  advisories: AdvisoryRow[];
  consensus: ConsensusAnalysis;
  deviations: Deviation[];
  comparativeAnalysis: string[];
  recencyAnalysis: RecencyAnalysis;
}

export interface ConsensusAnalysis {
  counts: Record<NormalizedLevel, number>;
  mostCommon: NormalizedLevel;
  strictest: NormalizedLevel;
  mildest: NormalizedLevel;
  totalSources: number;
}

export interface Deviation {
  sourceId: string;
  sourceNameNl: string;
  flagEmoji: string;
  level: NormalizedLevel;
  direction: "stricter" | "milder";
  levelsDiff: number;
}

export interface RecencyAnalysis {
  mostRecent: { sourceId: string; nameNl: string; date: Date } | null;
  oldest: { sourceId: string; nameNl: string; date: Date } | null;
  averageAgeDays: number | null;
  staleCount: number;
}

export interface ScrapeLogRow {
  id: string;
  sourceId: string;
  sourceNameNl: string;
  flagEmoji: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: ScrapeStatus;
  errorMessage: string | null;
  advisoriesTotal: number;
  advisoriesNew: number;
  advisoriesUpdated: number;
  durationMs: number | null;
}
