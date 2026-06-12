import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const sources = await prisma.source.findMany({
    where: { active: true },
    orderBy: { priority: "asc" },
    include: {
      scrapeLogs: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
      _count: { select: { advisories: true } },
    },
  });

  return NextResponse.json(
    sources.map((s) => ({
      id: s.id,
      nameNl: s.nameNl,
      countryIso2: s.countryIso2,
      flagEmoji: s.flagEmoji,
      fetchMethod: s.fetchMethod,
      advisoryCount: s._count.advisories,
      lastScrape: s.scrapeLogs[0] ?? null,
    }))
  );
}
