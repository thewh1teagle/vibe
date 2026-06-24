import { NextRequest, NextResponse } from "next/server";
import { runAllScrapers, runScraperBySource } from "@/lib/scraper-runner";

export const maxDuration = 300;

const VALID_SOURCES = ["uk", "us", "germany", "canada", "france", "denmark", "australia", "sweden"];

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = req.nextUrl.searchParams.get("source");

  if (source && !VALID_SOURCES.includes(source)) {
    return NextResponse.json(
      { error: `Invalid source: ${source}. Valid: ${VALID_SOURCES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const results = source
      ? await runScraperBySource(source)
      : await runAllScrapers();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
