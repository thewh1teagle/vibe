import { prisma } from "@/lib/db";
import { CountrySearch } from "@/components/CountrySearch";
import { RiskDot } from "@/components/RiskBadge";
import { ExportButtons } from "@/components/ExportButtons";
import { HomeTable } from "@/components/HomeTable";
import Link from "next/link";
import type { NormalizedLevel } from "@/types";

export const revalidate = 3600;

const POPULAR = ["TH", "ES", "MA", "TR", "EG", "ID", "UA", "VN"];

export default async function HomePage() {
  const [countries, sources] = await Promise.all([
    prisma.country.findMany({
      include: {
        advisories: {
          include: { source: true },
          where: { source: { active: true } },
        },
      },
      orderBy: { nameNl: "asc" },
    }),
    prisma.source.findMany({ where: { active: true }, orderBy: { priority: "asc" } }),
  ]);

  const popularCountries = POPULAR.map((iso) =>
    countries.find((c) => c.isoAlpha2 === iso)
  ).filter(Boolean);

  const withAdvisories = countries.filter((c) => c.advisories.length > 0);

  const lastUpdate = await prisma.scrapeLog.findFirst({
    where: { status: "success" },
    orderBy: { finishedAt: "desc" },
  });

  const tableCountries = withAdvisories.map((c) => ({
    isoAlpha2: c.isoAlpha2,
    nameNl: c.nameNl,
    regionNl: c.regionNl,
    advisories: c.advisories.map((a) => ({
      sourceId: a.sourceId,
      normalizedLevel: a.normalizedLevel,
    })),
  }));

  const tableSources = sources.map((s) => ({
    id: s.id,
    nameNl: s.nameNl,
    flagEmoji: s.flagEmoji,
    priority: s.priority,
  }));

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
          Vergelijk reisadviezen
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Van 8 westerse overheden — altijd up-to-date, geen account vereist
        </p>
        <div className="flex justify-center pt-2">
          <CountrySearch
            countries={countries.map((c) => ({
              isoAlpha2: c.isoAlpha2,
              nameNl: c.nameNl,
              nameEn: c.nameEn,
              regionNl: c.regionNl,
            }))}
          />
        </div>
      </div>

      {/* Popular */}
      {popularCountries.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Populaire bestemmingen
          </h2>
          <div className="flex flex-wrap gap-2">
            {popularCountries.map((c) => {
              if (!c) return null;
              const maxLevel = c.advisories.reduce<NormalizedLevel>((acc, a) => {
                const order = ["unknown", "green", "yellow", "orange", "red"];
                return order.indexOf(a.normalizedLevel) > order.indexOf(acc)
                  ? (a.normalizedLevel as NormalizedLevel)
                  : acc;
              }, "unknown");
              return (
                <Link
                  key={c.isoAlpha2}
                  href={`/country/${c.isoAlpha2.toLowerCase()}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all text-sm font-medium text-gray-700"
                >
                  <RiskDot level={maxLevel} />
                  {c.nameNl}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Status + export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-y border-gray-200">
        <p className="text-sm text-gray-500">
          {lastUpdate?.finishedAt
            ? `Bijgewerkt: ${new Date(lastUpdate.finishedAt).toLocaleString("nl-NL")}`
            : `${withAdvisories.length} landen met adviezen`}
          {" · "}{sources.length} bronnen
        </p>
        <ExportButtons />
      </div>

      {/* Overview table with filters */}
      <HomeTable countries={tableCountries} sources={tableSources} />
    </div>
  );
}
