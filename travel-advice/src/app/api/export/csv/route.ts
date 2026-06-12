import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stringify } from "csv-stringify/sync";
import { formatDateNl } from "@/lib/format";
import { LEVEL_LABELS_NL } from "@/lib/normalize-risk";
import type { NormalizedLevel } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const iso = searchParams.get("iso");

  const whereClause = iso ? { destIso2: iso.toUpperCase() } : {};

  const advisories = await prisma.advisory.findMany({
    where: whereClause,
    include: {
      source: true,
      destination: true,
    },
    orderBy: [{ destination: { nameNl: "asc" } }, { source: { priority: "asc" } }],
  });

  const rows = advisories.map((a) => ({
    Land: a.destination.nameNl,
    "Land (EN)": a.destination.nameEn,
    ISO: a.destIso2,
    Regio: a.destination.regionNl,
    Overheid: a.source.nameNl,
    "Officiële classificatie": a.rawLevel,
    Kleurcode: LEVEL_LABELS_NL[a.normalizedLevel as NormalizedLevel] ?? a.normalizedLevel,
    Samenvatting: a.summary,
    Risicos: JSON.parse(a.risks || "[]").join(", "),
    "Laatste wijziging": formatDateNl(a.officialUpdatedAt),
    "Opgehaald op": formatDateNl(a.scrapedAt),
    "Bron URL": a.sourceUrl,
  }));

  const csv = stringify(rows, { header: true, delimiter: ";" });
  const bom = "﻿";
  const filename = iso
    ? `reisadvies-${iso.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    : `reisadviezen-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
