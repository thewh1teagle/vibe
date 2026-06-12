import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";
import { formatDateNl } from "@/lib/format";
import { LEVEL_LABELS_NL } from "@/lib/normalize-risk";
import type { NormalizedLevel } from "@/types";

const LEVEL_COLORS: Record<NormalizedLevel, string> = {
  green: "D1FAE5",
  yellow: "FEF9C3",
  orange: "FFEDD5",
  red: "FEE2E2",
  unknown: "F3F4F6",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const iso = searchParams.get("iso");
  const whereClause = iso ? { destIso2: iso.toUpperCase() } : {};

  const advisories = await prisma.advisory.findMany({
    where: whereClause,
    include: { source: true, destination: true },
    orderBy: [{ destination: { nameNl: "asc" } }, { source: { priority: "asc" } }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Travel Advice Comparator";
  wb.created = new Date();

  const ws = wb.addWorksheet("Reisadviezen");
  ws.columns = [
    { header: "Land", key: "land", width: 25 },
    { header: "ISO", key: "iso", width: 6 },
    { header: "Regio", key: "regio", width: 15 },
    { header: "Overheid", key: "overheid", width: 22 },
    { header: "Officiële classificatie", key: "classificatie", width: 35 },
    { header: "Kleurcode", key: "kleurcode", width: 12 },
    { header: "Samenvatting", key: "samenvatting", width: 50 },
    { header: "Risico's", key: "risicos", width: 35 },
    { header: "Laatste wijziging", key: "wijziging", width: 18 },
    { header: "Opgehaald op", key: "opgehaald", width: 18 },
    { header: "Bron URL", key: "url", width: 50 },
  ];

  // Header styling
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "E2E8F0" },
  };
  ws.autoFilter = { from: "A1", to: "K1" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const a of advisories) {
    const level = a.normalizedLevel as NormalizedLevel;
    const color = LEVEL_COLORS[level] ?? "FFFFFF";
    const row = ws.addRow({
      land: a.destination.nameNl,
      iso: a.destIso2,
      regio: a.destination.regionNl,
      overheid: `${a.source.flagEmoji} ${a.source.nameNl}`,
      classificatie: a.rawLevel,
      kleurcode: LEVEL_LABELS_NL[level] ?? level,
      samenvatting: a.summary,
      risicos: JSON.parse(a.risks || "[]").join(", "),
      wijziging: formatDateNl(a.officialUpdatedAt),
      opgehaald: formatDateNl(a.scrapedAt),
      url: a.sourceUrl,
    });
    // Color the level cell
    const levelCell = row.getCell("kleurcode");
    levelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }

  // Legend sheet
  const legend = wb.addWorksheet("Legenda");
  legend.addRow(["Kleurcode", "Betekenis"]);
  legend.addRow(["Groen", "Normale voorzichtigheid"]);
  legend.addRow(["Geel", "Verhoogde waakzaamheid"]);
  legend.addRow(["Oranje", "Niet-essentiële reizen afraden"]);
  legend.addRow(["Rood", "Reis niet"]);
  legend.addRow([]);
  legend.addRow([`Gegenereerd op ${formatDateNl(new Date())} door Travel Advice Comparator`]);

  const buffer = await wb.xlsx.writeBuffer();
  const filename = iso
    ? `reisadvies-${iso.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`
    : `reisadviezen-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
