#!/usr/bin/env npx tsx
/**
 * Generates Dutch AI summaries for all countries and saves to data/summaries.json
 *
 * Usage (run from travel-advice/ directory):
 *   npx tsx scripts/generate-summaries.ts [ISO2]
 *
 * Examples:
 *   npx tsx scripts/generate-summaries.ts        # all countries in DB
 *   npx tsx scripts/generate-summaries.ts BH     # only Bahrain
 *   npx tsx scripts/generate-summaries.ts BH AE  # Bahrain + UAE
 *
 * Reads current advisories from DB, calls Claude API to generate Dutch summaries,
 * and saves results to data/summaries.json which the app reads at render time.
 *
 * Set ANTHROPIC_API_KEY in your environment (or .env.local).
 */

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OUTPUT_PATH = path.join(__dirname, "../data/summaries.json");

type SummaryData = Record<string, Record<string, string>>; // iso2 -> sourceId -> summary

async function generateSummary(
  countryName: string,
  sourceNameNl: string,
  rawLevel: string,
  levelNl: string,
  scrapedSummary: string,
  sourceUrl: string
): Promise<string> {
  const prompt = `Je bent een reisadviseur die Nederlandse reizigers informeert.
Schrijf een beknopte Nederlandse samenvatting (max 2 zinnen, ~80 woorden) die uitlegt:
1. Wat het reisadvies is
2. Waarom dit advies geldt (de reden/situatie)

Land: ${countryName}
Bron: ${sourceNameNl}
Officieel advies: ${rawLevel} (${levelNl})
Toelichting van de bron: ${scrapedSummary || "geen aanvullende informatie beschikbaar"}
Bronpagina: ${sourceUrl}

Schrijf alleen de samenvatting, geen inleiding of afsluiting. Gebruik begrijpelijk Nederlands.`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  return (msg.content[0] as { text: string }).text.trim();
}

async function main() {
  const targetIsos = process.argv.slice(2).map((s) => s.toUpperCase());

  // Load existing summaries
  let summaries: SummaryData = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    summaries = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
  }

  // Fetch advisories from DB
  const where = targetIsos.length > 0 ? { destIso2: { in: targetIsos } } : {};
  const advisories = await prisma.advisory.findMany({
    where,
    include: {
      country: true,
      source: true,
    },
    orderBy: [{ destIso2: "asc" }, { source: { priority: "asc" } }],
  });

  console.log(`Generating summaries for ${advisories.length} advisories...`);

  for (const adv of advisories) {
    const iso2 = adv.destIso2;
    const sourceId = adv.sourceId;

    if (!summaries[iso2]) summaries[iso2] = {};

    // Skip if already generated (unless forced)
    if (summaries[iso2][sourceId] && !targetIsos.includes(iso2)) {
      process.stdout.write(".");
      continue;
    }

    try {
      const levelNl =
        {
          green: "Geen bijzondere risico's",
          yellow: "Verhoogde alertheid",
          orange: "Alleen noodzakelijke reizen",
          red: "Niet reizen",
        }[adv.normalizedLevel] ?? adv.normalizedLevel;

      const summary = await generateSummary(
        adv.country.nameNl,
        adv.source.nameNl,
        adv.rawLevel,
        levelNl,
        adv.summary ?? "",
        adv.sourceUrl ?? ""
      );

      summaries[iso2][sourceId] = summary;
      process.stdout.write(`\n✓ ${iso2}/${sourceId}: ${summary.slice(0, 60)}...`);

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`\n✗ ${iso2}/${sourceId}:`, err);
    }
  }

  // Save to file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summaries, null, 2));
  console.log(`\n\nSaved to ${OUTPUT_PATH}`);
  console.log(`\nNow commit and push:`);
  console.log(`  git add data/summaries.json && git commit -m "Update AI summaries" && git push`);

  await prisma.$disconnect();
}

main().catch(console.error);
