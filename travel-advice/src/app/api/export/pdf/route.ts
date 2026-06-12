import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatDateNl } from "@/lib/format";
import { LEVEL_LABELS_NL } from "@/lib/normalize-risk";
import type { NormalizedLevel } from "@/types";

// @ts-ignore
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";

const LEVEL_COLORS: Record<NormalizedLevel, [number, number, number]> = {
  green: [209, 250, 229],
  yellow: [254, 249, 195],
  orange: [255, 237, 213],
  red: [254, 226, 226],
  unknown: [243, 244, 246],
};

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
    orderBy: [
      { destination: { nameNl: "asc" } },
      { source: { priority: "asc" } },
    ],
  });

  const title = iso
    ? `Reisadviezen — ${advisories[0]?.destination?.nameNl ?? iso.toUpperCase()}`
    : "Reisadviezen — Overzicht";

  const rows = advisories.map((a) => {
    const level = (a.normalizedLevel as NormalizedLevel) ?? "unknown";
    return {
      data: [
        a.destination.nameNl,
        a.destIso2,
        a.source.nameNl,
        LEVEL_LABELS_NL[level] ?? level,
        a.rawLevel,
        formatDateNl(a.officialUpdatedAt),
      ],
      level,
    };
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Gegenereerd op ${formatDateNl(new Date())}`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [["Land", "ISO", "Overheid", "Niveau", "Officiële classificatie", "Datum"]],
    body: rows.map((r) => r.data),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section === "body") {
        const row = rows[data.row.index as number];
        if (row) {
          data.cell.styles.fillColor = LEVEL_COLORS[row.level];
        }
      }
    },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 12 },
      2: { cellWidth: 30 },
      3: { cellWidth: 22 },
      4: { cellWidth: 70 },
      5: { cellWidth: 25 },
    },
  });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer") as ArrayBuffer);

  const filename = iso
    ? `reisadvies-${iso.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
    : `reisadviezen-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
