import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildConsensus,
  buildDeviations,
  buildComparativeAnalysis,
  buildRecencyAnalysis,
} from "@/lib/analysis";
import type { AdvisoryRow } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ iso: string }> }
) {
  const { iso } = await params;
  const isoUpper = iso.toUpperCase();

  const country = await prisma.country.findUnique({
    where: { isoAlpha2: isoUpper },
  });

  if (!country) {
    return NextResponse.json({ error: "Land niet gevonden" }, { status: 404 });
  }

  const rawAdvisories = await prisma.advisory.findMany({
    where: { destIso2: isoUpper },
    include: { source: true },
    orderBy: { source: { priority: "asc" } },
  });

  const advisories: AdvisoryRow[] = rawAdvisories.map((a) => ({
    id: a.id,
    sourceId: a.sourceId,
    sourceNameNl: a.source.nameNl,
    sourceNameEn: a.source.nameEn,
    sourceFlagEmoji: a.source.flagEmoji,
    destIso2: a.destIso2,
    rawLevel: a.rawLevel,
    normalizedLevel: a.normalizedLevel as AdvisoryRow["normalizedLevel"],
    summary: a.summary,
    risks: JSON.parse(a.risks || "[]"),
    officialUpdatedAt: a.officialUpdatedAt,
    scrapedAt: a.scrapedAt,
    sourceUrl: a.sourceUrl,
    isStale: a.isStale,
  }));

  const consensus = buildConsensus(advisories);
  const deviations = buildDeviations(advisories, consensus);
  const comparativeAnalysis = buildComparativeAnalysis(advisories, deviations);
  const recencyAnalysis = buildRecencyAnalysis(advisories);

  return NextResponse.json({
    country,
    advisories,
    consensus,
    deviations,
    comparativeAnalysis,
    recencyAnalysis,
  });
}
