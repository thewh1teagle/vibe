#!/usr/bin/env npx tsx
/**
 * Refreshes supplement advisory data using Playwright + Mistral AI.
 *
 * For each entry in the supplement JSON files (germany, sweden, denmark, australia),
 * visits the official advisory URL with a real browser (bypasses JS-rendering and
 * IP blocks), extracts the page text, and calls Mistral to extract:
 *   - The advisory level (from a fixed vocabulary per source)
 *   - A summary in the source language
 *   - The last-updated date
 *
 * Run from travel-advice/ directory. Requires MISTRAL_API_KEY in environment.
 * Playwright + Chromium must be installed before running (see workflow).
 *
 * Usage:
 *   npx tsx scripts/refresh-supplements.ts [source...]
 *   npx tsx scripts/refresh-supplements.ts              # all sources
 *   npx tsx scripts/refresh-supplements.ts sweden denmark
 */

import * as fs from "fs";
import * as path from "path";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
if (!MISTRAL_API_KEY) {
  console.error("ERROR: MISTRAL_API_KEY not set");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "../data");

// ─── Source configs ────────────────────────────────────────────────────────────

interface SourceConfig {
  file: string;
  language: string;
  levels: string[];
  isAustralia?: boolean;
  australiaLevelMap?: Record<string, number>;
}

const SOURCES: Record<string, SourceConfig> = {
  germany: {
    file: "germany-advisories.json",
    language: "German",
    levels: [
      "Reisewarnung",
      "Teilreisewarnung",
      "Von nicht notwendigen Reisen abraten",
      "Erhöhte Vorsicht",
      "Keine besonderen Sicherheitshinweise",
    ],
  },
  sweden: {
    file: "sweden-advisories.json",
    language: "Swedish",
    levels: [
      "Avrådan från alla resor",
      "Avrådan från icke nödvändiga resor",
      "Var extra uppmärksam",
      "Inga särskilda restriktioner",
    ],
  },
  denmark: {
    file: "denmark-advisories.json",
    language: "Danish",
    levels: [
      "Rejse frarådes",
      "Undgå alle rejser",
      "Fraråd ikke-nødvendige rejser",
      "Vær ekstra opmærksom",
      "Vær ekstra forsigtig",
      "Vær forsigtig",
      "Vær opmærksom",
      "Ingen særlige advarsler",
    ],
  },
  australia: {
    file: "australia-advisories.json",
    language: "English",
    levels: [
      "Do not travel",
      "Reconsider your need to travel",
      "Exercise a high degree of caution",
      "Exercise normal safety precautions",
    ],
    isAustralia: true,
    australiaLevelMap: {
      "Do not travel": 4,
      "Reconsider your need to travel": 3,
      "Exercise a high degree of caution": 2,
      "Exercise normal safety precautions": 1,
    },
  },
};

// ─── Mistral extraction ────────────────────────────────────────────────────────

interface ExtractedAdvisory {
  level: string;
  summary: string;
  updatedAt: string | null;
}

async function extractWithMistral(
  pageText: string,
  config: SourceConfig,
  iso2: string,
): Promise<ExtractedAdvisory | null> {
  const levelsFormatted = config.levels.map((l) => `  - "${l}"`).join("\n");

  const prompt = `You are analyzing a government travel advisory page written in ${config.language} for country code ${iso2}.

Extract exactly three things:

1. LEVEL – Choose EXACTLY one option from this list (copy verbatim, including accents):
${levelsFormatted}
   Rule: choose the level that applies to the ENTIRE country. If there are regional exceptions with higher warnings in specific provinces/zones, still choose the BASE level for the country overall (not the exception level).

2. SUMMARY – Write 2–4 sentences in ${config.language} (the same language as the page) that describe:
   - The general advisory level for the whole country and the main reason (war, terrorism, crime, etc.)
   - Any specific regions/provinces with HIGHER warnings: name each region and the reason
   Keep it factual, no recommendations. Do not add intro or closing phrases.

3. UPDATED – The date this advisory was last updated, in YYYY-MM-DD format. Return null if not found.

Respond with a JSON object only, no other text:
{"level": "...", "summary": "...", "updatedAt": "YYYY-MM-DD or null"}

Page content (first 6000 chars):
${pageText.slice(0, 6000)}`;

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`  Mistral error ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      level?: string;
      summary?: string;
      updatedAt?: string | null;
    };

    if (!parsed.level || !config.levels.includes(parsed.level)) {
      console.error(`  Invalid level from Mistral: "${parsed.level}"`);
      return null;
    }

    return {
      level: parsed.level,
      summary: parsed.summary ?? "",
      updatedAt:
        parsed.updatedAt && parsed.updatedAt !== "null"
          ? parsed.updatedAt
          : null,
    };
  } catch (err) {
    console.error(`  Mistral parse error: ${err}`);
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).map((a) => a.toLowerCase());
  const sourcesToRun =
    args.length > 0
      ? args.filter((a) => SOURCES[a])
      : Object.keys(SOURCES);

  if (sourcesToRun.length === 0) {
    console.error("No valid sources specified. Valid:", Object.keys(SOURCES).join(", "));
    process.exit(1);
  }

  // Import playwright lazily so missing install gives a clear error
  let chromium: import("playwright").BrowserType;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "Playwright not found. Install with: npm install --no-save playwright && npx playwright install chromium --with-deps",
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  console.log("Browser started\n");

  for (const sourceName of sourcesToRun) {
    const config = SOURCES[sourceName];
    const filePath = path.join(DATA_DIR, config.file);

    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}, skipping`);
      continue;
    }

    const entries = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<
      Record<string, unknown>
    >;
    let anyChanged = false;

    console.log(`=== ${sourceName.toUpperCase()} (${entries.length} entries) ===`);

    for (const entry of entries) {
      const iso2 = String(entry.iso2 ?? "");
      const url = String(entry.url ?? "");
      if (!iso2 || !url) continue;

      console.log(`  ${iso2}: ${url}`);

      let pageText = "";
      const page = await browser.newPage();

      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        // Extra wait for JS-rendered content (Sweden, Denmark)
        await page.waitForTimeout(2500);
        pageText = await page.evaluate(() => document.body?.innerText ?? "");
      } catch (err) {
        console.error(`    Page load failed: ${err}`);
        await page.close();
        continue;
      }

      await page.close();

      if (!pageText || pageText.length < 300) {
        console.warn(`    Page too short (${pageText.length} chars), skipping`);
        continue;
      }

      const extracted = await extractWithMistral(pageText, config, iso2);
      if (!extracted) {
        console.warn(`    Extraction failed, keeping existing data`);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      // Apply extracted data
      const before = JSON.stringify(entry);

      if (config.isAustralia && config.australiaLevelMap) {
        const numLevel = config.australiaLevelMap[extracted.level];
        if (numLevel !== undefined) entry.level = numLevel;
      } else {
        entry.rawLevel = extracted.level;
      }

      entry.summary = extracted.summary;
      if (extracted.updatedAt) {
        entry.updatedAt = extracted.updatedAt;
      }

      const after = JSON.stringify(entry);
      if (before !== after) {
        console.log(`    ✓ Updated → ${extracted.level}`);
        anyChanged = true;
      } else {
        console.log(`    – No change (${extracted.level})`);
      }

      // Be gentle with rate limits
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (anyChanged) {
      fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + "\n");
      console.log(`  → Written: ${config.file}\n`);
    } else {
      console.log(`  → No changes for ${sourceName}\n`);
    }
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
