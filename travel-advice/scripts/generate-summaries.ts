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
import crypto from "crypto";
import fs from "fs";
import path from "path";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const OUTPUT_PATH = path.join(__dirname, "../data/summaries.json");
const HASHES_PATH = path.join(__dirname, "../data/summaries-hashes.json");

type SummaryData = Record<string, Record<string, string>>;
type HashData = Record<string, Record<string, string>>;

const PROMPT_VERSION = "v5";

function hashText(text: string): string {
  return crypto.createHash("sha1").update(`${PROMPT_VERSION}:${text}`).digest("hex").slice(0, 12);
}

async function generateSummary(
  countryName: string,
  sourceNameNl: string,
  rawLevel: string,
  levelNl: string,
  scrapedSummary: string,
): Promise<string> {
  const hasScrapedText = scrapedSummary && scrapedSummary.trim().length > 20;

  const prompt = hasScrapedText
    ? `Vat het onderstaande reisadvies samen in vloeiend Nederlands. Maximaal 150 woorden.
Regels:
- Noem het algemene veiligheidsniveau voor het land
- Noem voor elk risicogebied de exacte plaatsnamen én de reden van de waarschuwing (bijv. terrorisme, gewapend conflict, criminaliteit, politieke onrust)
- Als er gebieden zijn met verhoogde waarschuwingen, beschrijf welke gebieden en waarom
- Gebruik idiomatische vertalingen: "exercise caution" → "wees voorzichtig", "exercise increased caution" → "wees extra voorzichtig", "reconsider travel" → "heroverweeg uw reis", "do not travel" → "reis niet naar", "avoid non-essential travel" → "vermijd niet-noodzakelijke reizen", "avoid all travel" → "vermijd alle reizen"
- Geen inleiding of afsluiting, alleen de samenvatting
- Geen Markdown-opmaak, geen asterisken of andere opmaaktekens

Bron: ${sourceNameNl} — reisadvies voor ${countryName} (niveau: ${levelNl})
Te verwerken tekst:
${scrapedSummary}`
    : `Schrijf één zin in het Nederlands die het reisadvies van ${sourceNameNl} voor ${countryName} beschrijft.
Niveau: ${rawLevel} (${levelNl}). Geen verdere details beschikbaar.
Begin met "${sourceNameNl} adviseert..."`.trim();

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      max_tokens: 280,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content
    .trim()
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");
}

async function main() {
  if (!MISTRAL_API_KEY) {
    console.error("Missing MISTRAL_API_KEY environment variable");
    process.exit(1);
  }

  const dbUrl = (process.env.DATABASE_URL ?? "").replace(/[&?]channel_binding=[^&]*/g, "");
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }

  let prisma: PrismaClient;
  if (dbUrl.startsWith("postgres")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg");
    const pool = new Pool({ connectionString: dbUrl });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter } as never);
  } else {
    prisma = new PrismaClient();
  }

  const targetIsos = process.argv.slice(2).map((s) => s.toUpperCase());

  let summaries: SummaryData = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    summaries = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
  }

  let hashes: HashData = {};
  if (fs.existsSync(HASHES_PATH)) {
    hashes = JSON.parse(fs.readFileSync(HASHES_PATH, "utf-8"));
  }

  const where = targetIsos.length > 0 ? { destIso2: { in: targetIsos } } : {};
  const advisories = await prisma.advisory.findMany({
    where,
    include: { destination: true, source: true },
    orderBy: [{ destIso2: "asc" }, { source: { priority: "asc" } }],
  });

  console.log(`Generating summaries for ${advisories.length} advisories...`);
  if (advisories.length === 0) {
    const total = await prisma.advisory.count();
    console.log(`Total advisories in DB: ${total}`);
    const sample = await prisma.advisory.findFirst({ select: { destIso2: true, sourceId: true } });
    console.log(`Sample record:`, sample);
  }

  for (const adv of advisories) {
    const iso2 = adv.destIso2;
    const sourceId = adv.sourceId;

    if (!summaries[iso2]) summaries[iso2] = {};
    if (!hashes[iso2]) hashes[iso2] = {};

    const sourceText = adv.summary ?? "";
    const currentHash = hashText(sourceText + adv.rawLevel);
    const storedHash = hashes[iso2][sourceId];

    // Skip if translation exists and source text hasn't changed (unless explicitly targeted)
    if (summaries[iso2][sourceId] && storedHash === currentHash && !targetIsos.includes(iso2)) {
      process.stdout.write(".");
      continue;
    }

    try {
      const levelNl = ({ green: "Geen bijzondere risico's", yellow: "Verhoogde alertheid", orange: "Alleen noodzakelijke reizen", red: "Niet reizen" } as Record<string, string>)[adv.normalizedLevel] ?? adv.normalizedLevel;

      const summary = await generateSummary(
        (adv as { destination?: { nameNl: string }; country?: { nameNl: string } }).destination?.nameNl ?? (adv as { country?: { nameNl: string } }).country?.nameNl ?? adv.destIso2,
        adv.source.nameNl,
        adv.rawLevel,
        levelNl,
        sourceText,
      );

      summaries[iso2][sourceId] = summary;
      hashes[iso2][sourceId] = currentHash;
      const changed = storedHash && storedHash !== currentHash ? " [UPDATED]" : "";
      console.log(`✓ ${iso2}/${sourceId}${changed}: ${summary.slice(0, 80)}...`);

      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      console.error(`✗ ${iso2}/${sourceId}:`, err);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summaries, null, 2));
  fs.writeFileSync(HASHES_PATH, JSON.stringify(hashes, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);

  await prisma.$disconnect();
}

main().catch(console.error);
