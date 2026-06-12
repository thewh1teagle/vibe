import { germanyScraper } from "./germany";
import { canadaScraper } from "./canada";
import { australiaScraper } from "./australia";
import { ukScraper } from "./uk";
import { usScraper } from "./us";
import { franceScraper } from "./france";
import { denmarkScraper } from "./denmark";
import { swedenScraper } from "./sweden";
import type { Scraper } from "./types";

export const SCRAPERS: Record<string, Scraper> = {
  germany: germanyScraper,
  canada: canadaScraper,
  australia: australiaScraper,
  uk: ukScraper,
  us: usScraper,
  france: franceScraper,
  denmark: denmarkScraper,
  sweden: swedenScraper,
};
