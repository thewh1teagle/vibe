import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const region = searchParams.get("region") ?? "";
  const level = searchParams.get("level") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "25", 10));

  const countries = await prisma.country.findMany({
    where: {
      ...(q ? {
        OR: [
          { nameNl: { contains: q } },
          { nameEn: { contains: q } },
        ],
      } : {}),
      ...(region ? { regionNl: region } : {}),
    },
    include: {
      advisories: {
        include: { source: true },
        orderBy: { source: { priority: "asc" } },
      },
    },
    orderBy: { nameNl: "asc" },
  });

  // Filter on level if provided
  const levelFilter = level ? level.split(",") : [];
  const filtered = levelFilter.length
    ? countries.filter((c) =>
        c.advisories.some((a) => levelFilter.includes(a.normalizedLevel))
      )
    : countries;

  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    countries: paginated.map((c) => ({
      isoAlpha2: c.isoAlpha2,
      nameNl: c.nameNl,
      nameEn: c.nameEn,
      regionNl: c.regionNl,
      advisories: c.advisories.map((a) => ({
        sourceId: a.sourceId,
        sourceFlagEmoji: a.source.flagEmoji,
        normalizedLevel: a.normalizedLevel,
        scrapedAt: a.scrapedAt,
        isStale: a.isStale,
      })),
    })),
    total,
    page,
    limit,
  });
}
