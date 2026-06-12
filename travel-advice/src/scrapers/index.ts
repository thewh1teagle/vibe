// Scraper registry — importeer hier elke bron zodra hij gebouwd is
// import { ukScraper } from "./uk";
// import { usScraper } from "./us";

import type { Scraper } from "./types";

export const SCRAPERS: Record<string, Scraper> = {
  // uk: ukScraper,
  // us: usScraper,
  // germany: germanyScraper,
  // france: franceScraper,
  // canada: canadaScraper,
  // australia: australiaScraper,
  // denmark: denmarkScraper,
  // sweden: swedenScraper,
};
