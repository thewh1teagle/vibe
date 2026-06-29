import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const iso = req.nextUrl.searchParams.get("iso")?.toUpperCase();

  if (iso) {
    const advisories = await prisma.advisory.findMany({
      where: { destIso2: iso },
      select: { sourceId: true, rawLevel: true, normalizedLevel: true, scrapedAt: true },
    });
    const logs = await prisma.scrapeLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 16,
      select: { sourceId: true, status: true, advisoriesTotal: true, advisoriesNew: true, advisoriesUpdated: true, errorMessage: true, startedAt: true },
    });
    return NextResponse.json({ iso, advisories, recentLogs: logs });
  }

  const counts = await prisma.advisory.groupBy({
    by: ["sourceId"],
    _count: true,
  });
  return NextResponse.json({ counts });
}
