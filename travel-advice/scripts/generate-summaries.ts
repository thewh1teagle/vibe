#!/usr/bin/env npx tsx
/**
 * Generates Dutch AI summaries for travel advisories and saves to data/summaries.json
 *
 * Usage (run from travel-advice/ directory):
 *   npx tsx scripts/generate-summaries.ts [ISO2...]
 *
 * Examples:
 *   npx tsx scripts/generate-summaries.ts TR ID   # Turkey + Indonesia
 *   npx tsx scripts/generate-summaries.ts          # all countries in DB
 *
 * Requires MISTRAL_API_KEY in environment.
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const OUTPUT_PATH = path.join(__dirname, "../data/summaries.json");

type SummaryData = Record<string, Record<string, string>>;

async function generateSummary(
  countryName: string,
  sourceNameNl: string,
  rawLevel: string,
  levelNl: string,
  scrapedSummary: string,
): Promise<string> {
  const prompt = `Je bent een reisadviseur die Nederlandse reizigers informeert.
Schrijf een beknopte Nederlandse samenvatting (max 2 zinnen, ~60 woorden) van het reisadvies:
1. Wat het advies is
2. Waarom (de situatie/reden)

Land: ${countryName}
Bron: ${sourceNameNl}
Advies: ${rawLevel} (${levelNl})
Toelichting: ${scrapedSummary || "geen aanvullende informatie"}

Schrijf alleen de samenvatting, geen inleiding of afsluiting.`;

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content.trim();
}

async function main() {
  if (!MISTRAL_API_KEY) {
    console.error("Missing MISTRAL_API_KEY environment variable");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL?.replace(/[&?]channel_binding=[^&]*/g, "");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  const targetIsos = process.argv.slice(2).map((s) => s.toUpperCase());

  let summaries: SummaryData = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    summaries = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
  }

  const where = targetIsos.length > 0 ? { destIso2: { in: targetIsos } } : {};
  const advisories = await prisma.advisory.findMany({
    where,
    include: { country: true, source: true },
    orderBy: [{ destIso2: "asc" }, { source: { priority: "asc" } }],
  });

  console.log(`Generating summaries for ${advisories.length} advisories...`);

  for (const adv of advisories) {
    const iso2 = adv.destIso2;
    const sourceId = adv.sourceId;

    if (!summaries[iso2]) summaries[iso2] = {};

    // Skip if already exists and not in explicit target list
    if (summaries[iso2][sourceId] && !targetIsos.includes(iso2)) {
      process.stdout.write(".");
      continue;
    }

    try {
      const levelNl = ({ green: "Geen bijzondere risico's", yellow: "Verhoogde alertheid", orange: "Alleen noodzakelijke reizen", red: "Niet reizen" } as Record<string, string>)[adv.normalizedLevel] ?? adv.normalizedLevel;

      const summary = await generateSummary(
        adv.country.nameNl,
        adv.source.nameNl,
        adv.rawLevel,
        levelNl,
        adv.summary ?? "",
      );

      summaries[iso2][sourceId] = summary;
      console.log(`✓ ${iso2}/${sourceId}: ${summary.slice(0, 80)}...`);

      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`✗ ${iso2}/${sourceId}:`, err);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summaries, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);

  await prisma.$disconnect();
}

main().catch(console.error);
