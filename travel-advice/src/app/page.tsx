import { prisma } from "@/lib/db";
import { CountrySearch } from "@/components/CountrySearch";
import { RiskDot } from "@/components/RiskBadge";
import { ExportButtons } from "@/components/ExportButtons";
import Link from "next/link";
import type { NormalizedLevel } from "@/types";

export const revalidate = 3600;

const POPULAR = ["TH", "ES", "MA", "TR", "EG", "ID", "UA", "VN"];
const REGIONS = ["Europa", "Azië", "Afrika", "Amerika", "Midden-Oosten", "Oceanië"];

const SOURCE_ORDER = ["uk", "us", "germany", "france", "canada", "australia", "denmark", "sweden"];

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

  function getLevel(advisories: typeof countries[0]["advisories"], sourceId: string): NormalizedLevel {
    const adv = advisories.find((a) => a.sourceId === sourceId);
    return (adv?.normalizedLevel as NormalizedLevel) ?? "unknown";
  }

  const lastUpdate = await prisma.scrapeLog.findFirst({
    where: { status: "success" },
    orderBy: { finishedAt: "desc" },
  });

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

      {/* Region links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Blader per regio
        </h2>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <a
              key={r}
              href={`#${r}`}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm text-gray-600 transition-colors"
            >
              {r}
            </a>
          ))}
        </div>
      </div>

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

      {/* Overview table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 w-48">Land</th>
              {sources.sort((a, b) => SOURCE_ORDER.indexOf(a.id) - SOURCE_ORDER.indexOf(b.id)).map((s) => (
                <th key={s.id} className="px-3 py-3 text-center font-semibold text-gray-700 w-14" title={s.nameNl}>
                  <span className="text-xl">{s.flagEmoji}</span>
                </th>
              ))}
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Consensus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {countries.map((country) => {
              const levels = SOURCE_ORDER.map((sid) => getLevel(country.advisories, sid));
              const order = ["unknown", "green", "yellow", "orange", "red"];
              const maxLevel = levels.reduce<NormalizedLevel>((acc, l) =>
                order.indexOf(l) > order.indexOf(acc) ? l : acc, "unknown"
              );
              const hasAny = country.advisories.length > 0;

              if (!hasAny) return null;

              return (
                <tr key={country.isoAlpha2} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/country/${country.isoAlpha2.toLowerCase()}`}
                      className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {country.nameNl}
                    </Link>
                  </td>
                  {sources.sort((a, b) => SOURCE_ORDER.indexOf(a.id) - SOURCE_ORDER.indexOf(b.id)).map((s) => (
                    <td key={s.id} className="px-3 py-2.5 text-center">
                      <div className="flex justify-center">
                        <RiskDot level={getLevel(country.advisories, s.id)} />
                      </div>
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <RiskDot level={maxLevel} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        {(["green", "yellow", "orange", "red"] as NormalizedLevel[]).map((level) => (
          <div key={level} className="flex items-center gap-1.5">
            <RiskDot level={level} />
            <span>{
              level === "green" ? "Normale voorzichtigheid" :
              level === "yellow" ? "Verhoogde waakzaamheid" :
              level === "orange" ? "Niet-essentieel afraden" :
              "Reis niet"
            }</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <RiskDot level="unknown" />
          <span>Geen data</span>
        </div>
      </div>
    </div>
  );
}
