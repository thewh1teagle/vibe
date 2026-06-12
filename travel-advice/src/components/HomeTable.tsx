"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { RiskDot } from "@/components/RiskBadge";
import type { NormalizedLevel } from "@/types";

interface Advisory {
  sourceId: string;
  normalizedLevel: string;
}

interface Country {
  isoAlpha2: string;
  nameNl: string;
  regionNl: string;
  advisories: Advisory[];
}

interface Source {
  id: string;
  nameNl: string;
  flagEmoji: string;
  priority: number;
}

interface Props {
  countries: Country[];
  sources: Source[];
}

const LEVEL_ORDER: Record<string, number> = {
  unknown: 0,
  green: 1,
  yellow: 2,
  orange: 3,
  red: 4,
};

function getLevel(advisories: Advisory[], sourceId: string): NormalizedLevel {
  const adv = advisories.find((a) => a.sourceId === sourceId);
  return (adv?.normalizedLevel as NormalizedLevel) ?? "unknown";
}

function maxLevel(advisories: Advisory[]): NormalizedLevel {
  return advisories.reduce<NormalizedLevel>((acc, a) => {
    const lvl = a.normalizedLevel as NormalizedLevel;
    return LEVEL_ORDER[lvl] > LEVEL_ORDER[acc] ? lvl : acc;
  }, "unknown");
}

export function HomeTable({ countries, sources }: Props) {
  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => a.priority - b.priority),
    [sources]
  );

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const c of countries) set.add(c.regionNl);
    return Array.from(set).sort();
  }, [countries]);

  const [region, setRegion] = useState("");
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<"az" | "za" | "risk-asc" | "risk-desc">("az");

  const filtered = useMemo(() => {
    let list = countries.filter((c) => c.advisories.length > 0);

    if (region) {
      list = list.filter((c) => c.regionNl === region);
    }

    if (level) {
      list = list.filter((c) =>
        c.advisories.some((a) => a.normalizedLevel === level)
      );
    }

    if (source) {
      list = list.filter((c) =>
        c.advisories.some((a) => a.sourceId === source)
      );
    }

    list = [...list].sort((a, b) => {
      if (sort === "az") return a.nameNl.localeCompare(b.nameNl, "nl");
      if (sort === "za") return b.nameNl.localeCompare(a.nameNl, "nl");
      const aMax = LEVEL_ORDER[maxLevel(a.advisories)];
      const bMax = LEVEL_ORDER[maxLevel(b.advisories)];
      if (sort === "risk-desc") return bMax - aMax || a.nameNl.localeCompare(b.nameNl, "nl");
      return aMax - bMax || a.nameNl.localeCompare(b.nameNl, "nl");
    });

    return list;
  }, [countries, region, level, source, sort]);

  // Group by region when no region filter active
  const grouped = useMemo(() => {
    if (region) return null;
    const map = new Map<string, Country[]>();
    for (const c of filtered) {
      const r = c.regionNl;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(c);
    }
    return map;
  }, [filtered, region]);

  const totalWithAdvisories = useMemo(
    () => countries.filter((c) => c.advisories.length > 0).length,
    [countries]
  );

  function renderRow(country: Country) {
    const max = maxLevel(country.advisories);
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
        {sortedSources.map((s) => (
          <td key={s.id} className="px-3 py-2.5 text-center">
            <div className="flex justify-center">
              <RiskDot level={getLevel(country.advisories, s.id)} />
            </div>
          </td>
        ))}
        <td className="px-4 py-2.5">
          <RiskDot level={max} />
        </td>
      </tr>
    );
  }

  function renderTableBody() {
    if (grouped) {
      const entries = Array.from(grouped.entries()).sort(([a], [b]) =>
        a.localeCompare(b, "nl")
      );
      return entries.map(([regionName, regionCountries]) => (
        <>
          <tr key={`region-${regionName}`}>
            <td
              colSpan={sortedSources.length + 2}
              className="px-4 pt-5 pb-1"
            >
              <h3
                id={regionName}
                className="text-xs font-semibold text-gray-400 uppercase tracking-widest"
              >
                {regionName}
              </h3>
            </td>
          </tr>
          {regionCountries.map(renderRow)}
        </>
      ));
    }
    return filtered.map(renderRow);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Alle regio&apos;s</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Alle niveaus</option>
          <option value="green">Groen</option>
          <option value="yellow">Geel</option>
          <option value="orange">Oranje</option>
          <option value="red">Rood</option>
        </select>

        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Alle bronnen</option>
          {sortedSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.flagEmoji} {s.nameNl}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="risk-desc">Risico: hoog → laag</option>
          <option value="risk-asc">Risico: laag → hoog</option>
        </select>

        <span className="text-sm text-gray-500 ml-auto">
          {filtered.length} van {totalWithAdvisories} landen
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 w-48">Land</th>
              {sortedSources.map((s) => (
                <th
                  key={s.id}
                  className="px-3 py-3 text-center font-semibold text-gray-700 w-14"
                  title={s.nameNl}
                >
                  <span className="text-xl">{s.flagEmoji}</span>
                </th>
              ))}
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Consensus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={sortedSources.length + 2}
                  className="px-4 py-8 text-center text-gray-400 text-sm"
                >
                  Geen landen gevonden voor deze filters.
                </td>
              </tr>
            ) : (
              renderTableBody()
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        {(["green", "yellow", "orange", "red"] as NormalizedLevel[]).map((lvl) => (
          <div key={lvl} className="flex items-center gap-1.5">
            <RiskDot level={lvl} />
            <span>
              {lvl === "green"
                ? "Normale voorzichtigheid"
                : lvl === "yellow"
                ? "Verhoogde waakzaamheid"
                : lvl === "orange"
                ? "Niet-essentieel afraden"
                : "Reis niet"}
            </span>
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
