import { prisma } from "./db";
import { SCRAPERS } from "@/scrapers";
import type { RawAdvisory } from "@/scrapers/types";

const CONCURRENCY = 3;

export async function runAllScrapers(): Promise<
  { sourceId: string; status: string; count: number; error?: string }[]
> {
  const sourceIds = Object.keys(SCRAPERS);
  const results = [];

  for (let i = 0; i < sourceIds.length; i += CONCURRENCY) {
    const batch = sourceIds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(runScraper));
    results.push(...batchResults);
  }

  return results;
}

export async function runScraperBySource(sourceId: string) {
  if (!SCRAPERS[sourceId]) {
    throw new Error(`Unknown source: ${sourceId}`);
  }
  return [await runScraper(sourceId)];
}

async function runScraper(sourceId: string) {
  const scraper = SCRAPERS[sourceId];
  const startedAt = new Date();

  const log = await prisma.scrapeLog.create({
    data: { sourceId, startedAt, status: "running" },
  });

  try {
    const result = await scraper();
    const { inserted, updated } = await upsertAdvisories(result.advisories, sourceId, result.scrapedAt);

    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        status: result.error ? "partial" : "success",
        errorMessage: result.error ?? null,
        advisoriesTotal: result.advisories.length,
        advisoriesNew: inserted,
        advisoriesUpdated: updated,
        durationMs: Date.now() - startedAt.getTime(),
      },
    });

    return { sourceId, status: result.error ? "partial" : "success", count: result.advisories.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        status: "failed",
        errorMessage: msg,
        durationMs: Date.now() - startedAt.getTime(),
      },
    });

    await prisma.advisory.updateMany({
      where: { sourceId },
      data: { isStale: true },
    });

    return { sourceId, status: "failed", count: 0, error: msg };
  }
}

async function upsertAdvisories(
  advisories: RawAdvisory[],
  sourceId: string,
  scrapedAt: Date
) {
  let inserted = 0;
  let updated = 0;

  for (const adv of advisories) {
    const existing = await prisma.advisory.findUnique({
      where: { sourceId_destIso2: { sourceId, destIso2: adv.destIso2 } },
    });

    const data = {
      rawLevel: adv.rawLevel,
      normalizedLevel: adv.normalizedLevel,
      summary: adv.summary,
      risks: JSON.stringify(adv.risks),
      officialUpdatedAt: adv.officialUpdatedAt,
      scrapedAt,
      sourceUrl: adv.sourceUrl,
      isStale: false,
    };

    if (existing) {
      await prisma.advisory.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      // Only insert if country exists in DB
      const country = await prisma.country.findUnique({ where: { isoAlpha2: adv.destIso2 } });
      if (country) {
        await prisma.advisory.create({ data: { sourceId, destIso2: adv.destIso2, ...data } });
        inserted++;
      }
    }
  }

  const scrapedIso2s = new Set(advisories.map((a) => a.destIso2));
  await prisma.advisory.deleteMany({
    where: { sourceId, destIso2: { notIn: [...scrapedIso2s] } },
  });

  return { inserted, updated };
}
