export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import summariesJson from "../../../../data/summaries.json";
import {
  buildConsensus,
  buildDeviations,
  buildComparativeAnalysis,
  buildRecencyAnalysis,
} from "@/lib/analysis";
import { LEVEL_LABELS_NL } from "@/lib/normalize-risk";
import { formatDateNl, ageDays } from "@/lib/format";
import { RiskBadge } from "@/components/RiskBadge";
import { ExportButtons } from "@/components/ExportButtons";
import type { AdvisoryRow, NormalizedLevel } from "@/types";
import Link from "next/link";
import { ExternalLink, AlertTriangle, Info, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { SOURCES } from "@/config/sources";
import { LiveAdvisory } from "@/components/LiveAdvisory";

export const revalidate = 3600;

type LevelLabel = { original: string; nl: string };

// Per-source lookup keyed by rawLevel (lowercase)
const SOURCE_LEVEL_LABELS: Record<string, Record<string, LevelLabel>> = {
  uk: {
    "take normal precautions": { original: "Take normal precautions", nl: "Neem normale voorzorgsmaatregelen" },
    "reconsider your need to travel": { original: "Reconsider your need to travel", nl: "Heroverweeg de noodzaak van uw reis" },
    "advise against all but essential travel to parts": { original: "Advise against all but essential travel to parts", nl: "Alleen noodzakelijke reizen naar bepaalde gebieden" },
    "do not travel": { original: "Do not travel", nl: "Niet reizen" },
    "advise against all travel to parts": { original: "Advise against all travel to parts", nl: "Niet reizen naar bepaalde gebieden" },
    // also handle variant spellings
    "advise against all but essential travel": { original: "Advise against all but essential travel", nl: "Heroverweeg de noodzaak van uw reis" },
    "advise against all travel": { original: "Advise against all travel", nl: "Niet reizen" },
    "no advice against travel": { original: "No advice against travel", nl: "Neem normale voorzorgsmaatregelen" },
  },
  us: {
    "level 1: exercise normal precautions": { original: "Level 1: Exercise Normal Precautions", nl: "Neem normale voorzorgsmaatregelen" },
    "level 2: exercise increased caution": { original: "Level 2: Exercise Increased Caution", nl: "Wees extra voorzichtig" },
    "level 3: reconsider travel": { original: "Level 3: Reconsider Travel", nl: "Heroverweeg reizen" },
    "level 4: do not travel": { original: "Level 4: Do Not Travel", nl: "Niet reizen" },
  },
  germany: {
    "keine besonderen sicherheitshinweise": { original: "Keine besonderen Sicherheitshinweise", nl: "Geen bijzondere veiligheidswaarschuwingen" },
    "erhöhte vorsicht": { original: "Erhöhte Vorsicht", nl: "Verhoogde voorzichtigheid" },
    "von nicht notwendigen reisen wird abgeraten": { original: "Von nicht notwendigen Reisen wird abgeraten", nl: "Niet-noodzakelijke reizen worden afgeraden" },
    "von nicht notwendigen reisen abraten": { original: "Von nicht notwendigen Reisen wird abgeraten", nl: "Niet-noodzakelijke reizen worden afgeraden" },
    "teilreisewarnung": { original: "Teilreisewarnung", nl: "Gedeeltelijke reiswaarschuwing" },
    "reisewarnung": { original: "Reisewarnung", nl: "Reiswaarschuwing - niet reizen" },
  },
  france: {
    "vigilance normale": { original: "Vigilance normale", nl: "Normale waakzaamheid" },
    "vigilance renforcée": { original: "Vigilance renforcée", nl: "Verhoogde waakzaamheid" },
    "déconseillé sauf raison impérative": { original: "Déconseillé sauf raison impérative", nl: "Afgeraden tenzij noodzakelijk" },
    "formellement déconseillé": { original: "Formellement déconseillé", nl: "Reizen wordt sterk afgeraden" },
    "sécurité normale": { original: "Vigilance normale", nl: "Normale waakzaamheid" },
    "déconseillé": { original: "Déconseillé sauf raison impérative", nl: "Afgeraden tenzij noodzakelijk" },
  },
  canada: {
    "exercise normal security precautions": { original: "Exercise normal security precautions", nl: "Neem normale veiligheidsmaatregelen" },
    "take normal security precautions": { original: "Exercise normal security precautions", nl: "Neem normale veiligheidsmaatregelen" },
    "exercise a high degree of caution": { original: "Exercise a high degree of caution", nl: "Wees zeer voorzichtig" },
    "avoid non-essential travel": { original: "Avoid non-essential travel", nl: "Vermijd niet-noodzakelijke reizen" },
    "avoid all travel": { original: "Avoid all travel", nl: "Vermijd alle reizen" },
  },
  australia: {
    "exercise normal safety precautions": { original: "Exercise normal safety precautions", nl: "Neem normale veiligheidsmaatregelen" },
    "exercise a high degree of caution": { original: "Exercise a high degree of caution", nl: "Wees zeer voorzichtig" },
    "reconsider your need to travel": { original: "Reconsider your need to travel", nl: "Heroverweeg de noodzaak van uw reis" },
    "do not travel": { original: "Do not travel", nl: "Niet reizen" },
  },
  denmark: {
    "vær opmærksom": { original: "Vær opmærksom", nl: "Wees alert" },
    "vær ekstra opmærksom": { original: "Vær ekstra opmærksom", nl: "Wees extra alert" },
    "undgå ikke-nødvendige rejser": { original: "Undgå ikke-nødvendige rejser", nl: "Vermijd niet-noodzakelijke reizen" },
    "undgå alle rejser": { original: "Undgå alle rejser", nl: "Vermijd alle reizen" },
    "ingen særlige advarsler": { original: "Vær opmærksom", nl: "Wees alert" },
    "fraråd ikke-nødvendige rejser": { original: "Undgå ikke-nødvendige rejser", nl: "Vermijd niet-noodzakelijke reizen" },
    "rejse frarådes": { original: "Undgå alle rejser", nl: "Vermijd alle reizen" },
  },
  sweden: {
    "ingen särskilda avrådanden": { original: "Ingen särskilda avrådanden", nl: "Geen bijzondere reiswaarschuwingen" },
    "inga särskilda restriktioner": { original: "Ingen särskilda avrådanden", nl: "Geen bijzondere reiswaarschuwingen" },
    "var extra uppmärksam": { original: "Var extra uppmärksam", nl: "Wees extra alert" },
    "var försiktig": { original: "Var extra uppmärksam", nl: "Wees extra alert" },
    "avrådan från icke nödvändiga resor": { original: "Avrådan från icke nödvändiga resor", nl: "Niet-noodzakelijke reizen afgeraden" },
    "avråd från icke nödvändiga resor": { original: "Avrådan från icke nödvändiga resor", nl: "Niet-noodzakelijke reizen afgeraden" },
    "avrådan från alla resor": { original: "Avrådan från alla resor", nl: "Alle reizen afgeraden" },
    "avråd från resor": { original: "Avrådan från alla resor", nl: "Alle reizen afgeraden" },
  },
};

// Fallback labels for unknown sources/levels
const FALLBACK_LEVEL_LABELS: Record<string, LevelLabel> = {
  "no advice against travel": { original: "No advice against travel", nl: "Geen negatief reisadvies" },
  "do not travel": { original: "Do not travel", nl: "Niet reizen" },
  "avoid all travel": { original: "Avoid all travel", nl: "Vermijd alle reizen" },
};

function getLevelLabels(sourceId: string, rawLevel: string): LevelLabel[] {
  const key = rawLevel.toLowerCase().trim();
  const sourceMap = SOURCE_LEVEL_LABELS[sourceId];
  if (sourceMap) {
    const match = sourceMap[key];
    if (match) return [match];
    // partial match
    for (const [pattern, label] of Object.entries(sourceMap)) {
      if (key.includes(pattern) || pattern.includes(key)) return [label];
    }
  }
  // fallback
  const fallback = FALLBACK_LEVEL_LABELS[key];
  if (fallback) return [fallback];
  return [{ original: rawLevel, nl: rawLevel }];
}

function getMultiLevelDisplay(
  sourceId: string,
  rawLevel: string,
  normalizedLevel: NormalizedLevel,
  summary: string | null | undefined,
): Array<{ level: NormalizedLevel; area: string }> {
  const key = rawLevel.toLowerCase().trim();

  if (sourceId === "canada") {
    const sum = (summary || "").toLowerCase();
    const hasRed = /avoid all travel|vermijd alle reizen/i.test(sum);
    const hasOrange = /avoid non-essential travel|niet.?noodzakelijk.*afgeraden|afgeraden.*niet.?noodzakelijk/i.test(sum);
    if (key === "exercise a high degree of caution" && hasRed) {
      return [
        { level: "yellow", area: "Algemeen" },
        { level: "red", area: "Deelgebieden" },
      ];
    }
    if (key === "exercise a high degree of caution" && hasOrange) {
      return [
        { level: "yellow", area: "Algemeen" },
        { level: "orange", area: "Deelgebieden" },
      ];
    }
  }

  if (sourceId === "germany") {
    if (key === "teilreisewarnung") {
      return [
        { level: "green", area: "Algemeen" },
        { level: "red", area: "Deelgebieden" },
      ];
    }
    if (key === "reisewarnung" && summary && /teilreise|part|gebiet/i.test(summary)) {
      return [
        { level: "orange", area: "Algemeen" },
        { level: "red", area: "Deelgebieden" },
      ];
    }
  }

  if (sourceId === "uk") {
    const sum = (summary || "").toLowerCase();
    const hasUkBothParts = /all but essential travel to|advise against all but essential/i.test(sum);
    if (key.includes("advise against all travel to parts") || key === "advise against all travel to parts") {
      if (hasUkBothParts) {
        return [
          { level: "yellow", area: "Algemeen" },
          { level: "orange", area: "Deelgebieden" },
          { level: "red", area: "Verboden gebieden" },
        ];
      }
      return [
        { level: "orange", area: "Algemeen" },
        { level: "red", area: "Deelgebieden" },
      ];
    }
    if (key.includes("advise against all but essential travel to parts") || key === "advise against all but essential travel to parts") {
      return [
        { level: "yellow", area: "Algemeen" },
        { level: "orange", area: "Deelgebieden" },
      ];
    }
  }

  if (sourceId === "denmark") {
    const sum = (summary || "").toLowerCase();
    const hasRed = /rejse frarådes|vermijd alle reizen|sterk afgeraden.*grens|grens.*sterk afgeraden/i.test(sum);
    const hasOrange = /fraråder?\s+ikke.nødvendige|undgå ikke.nødvendige|niet.?noodzakelijk.*afgeraden|afgeraden.*niet.?noodzakelijk/i.test(sum);
    const hasYellow = /extra voorzichtigheid|verhoogde oplettendheid|vær opmærksom|extra aandacht/i.test(sum);
    if (hasRed && hasOrange && hasYellow) {
      return [
        { level: "green", area: "Algemeen" },
        { level: "yellow", area: "Toeristische gebieden" },
        { level: "orange", area: "Zuidelijke provincies" },
        { level: "red", area: "Grensgebieden Myanmar" },
      ];
    }
    if (hasRed && hasOrange) {
      return [
        { level: "green", area: "Algemeen" },
        { level: "orange", area: "Deelgebieden" },
        { level: "red", area: "Grensgebieden" },
      ];
    }
    if (hasRed) {
      return [
        { level: "green", area: "Algemeen" },
        { level: "red", area: "Deelgebieden" },
      ];
    }
    if (hasOrange) {
      return [
        { level: "green", area: "Algemeen" },
        { level: "orange", area: "Deelgebieden" },
      ];
    }
    if (key === "fraråd ikke-nødvendige rejser" || key === "vær ekstra opmærksom") {
      return [{ level: normalizedLevel, area: "Algemeen" }];
    }
  }

  if (sourceId === "sweden") {
    const sum = (summary || "").toLowerCase();
    const hasRed = /avråder?\s+från\s+alla\s+resor|avråder?\s+från\s+resor\b|vermijd alle reizen/i.test(sum);
    const hasOrange = /avråder?\s+från\s+icke\s+nödvändiga|niet.?noodzakelijk.*afgeraden/i.test(sum);
    if (hasRed) {
      return [
        { level: normalizedLevel, area: "Algemeen" },
        { level: "red", area: "Grensgebieden" },
      ];
    }
    if (hasOrange) {
      return [
        { level: normalizedLevel, area: "Algemeen" },
        { level: "orange", area: "Deelgebieden" },
      ];
    }
  }

  if (sourceId === "france") {
    const sum = (summary || "").toLowerCase();
    const hasRedFr = /formellement déconseillé/i.test(sum);
    const hasOrangeFr = /déconseillé sauf raison impérative/i.test(sum);
    // Dutch AI summary keywords
    const hasRedNl = /sterk afgeraden|grensgebied/i.test(sum);
    const hasOrangeNl = /niet.?noodzakelijk.*afgeraden|afgeraden.*niet.?noodzakelijk|zuidelijke.*afgeraden|afgeraden.*zuidelijk/i.test(sum);

    const hasRed = hasRedFr || hasRedNl;
    const hasOrange = hasOrangeFr || hasOrangeNl;

    if (key === "vigilance renforcée" && hasRed && hasOrange) {
      return [
        { level: "yellow", area: "Algemeen" },
        { level: "orange", area: "Deelgebieden" },
        { level: "red", area: "Grensgebieden" },
      ];
    }
    if (key === "vigilance renforcée" && hasOrange) {
      return [
        { level: "yellow", area: "Algemeen" },
        { level: "orange", area: "Deelgebieden" },
      ];
    }
    if ((key === "formellement déconseillé" || key === "déconseillé sauf raison impérative") && hasOrange) {
      return [
        { level: "orange", area: "Algemeen" },
        { level: "red", area: "Deelgebieden" },
      ];
    }
    if (key === "formellement déconseillé" && /autre|partie|zone|région/i.test(sum)) {
      return [
        { level: "orange", area: "Algemeen" },
        { level: "red", area: "Deelgebieden" },
      ];
    }
  }

  return [{ level: normalizedLevel, area: "Algemeen" }];
}

const CONSENSUS_COLORS: Record<NormalizedLevel, string> = {
  green: "bg-emerald-50 border-emerald-200 text-emerald-900",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-900",
  orange: "bg-orange-50 border-orange-200 text-orange-900",
  red: "bg-red-50 border-red-200 text-red-900",
  unknown: "bg-gray-50 border-gray-200 text-gray-700",
};

const LEVEL_BAR_COLORS: Record<NormalizedLevel, string> = {
  green: "bg-emerald-400",
  yellow: "bg-yellow-400",
  orange: "bg-orange-400",
  red: "bg-red-500",
  unknown: "bg-gray-300",
};

export default async function CountryPage({
  params,
}: {
  params: Promise<{ iso: string }>;
}) {
  const { iso } = await params;
  const isoUpper = iso.toUpperCase();

  const country = await prisma.country.findUnique({
    where: { isoAlpha2: isoUpper },
    include: {
      advisories: {
        include: { source: true },
        orderBy: { source: { priority: "asc" } },
      },
    },
  });

  if (!country) notFound();

  const aiSummaries: Record<string, Record<string, string>> = summariesJson;

  const rawSummaries = new Map(country.advisories.map((a) => [a.sourceId, a.summary ?? ""]));

  const advisories: AdvisoryRow[] = country.advisories.map((a) => ({
    id: a.id,
    sourceId: a.sourceId,
    sourceNameNl: a.source.nameNl,
    sourceNameEn: a.source.nameEn,
    sourceFlagEmoji: a.source.flagEmoji,
    destIso2: a.destIso2,
    rawLevel: a.rawLevel,
    normalizedLevel: a.normalizedLevel as NormalizedLevel,
    summary: aiSummaries[isoUpper]?.[a.sourceId] ?? a.summary,
    risks: JSON.parse(a.risks || "[]"),
    officialUpdatedAt: a.officialUpdatedAt,
    scrapedAt: a.scrapedAt,
    sourceUrl: a.sourceUrl,
    isStale: a.isStale,
  }));

  if (advisories.length === 0) {
    return (
      <div className="space-y-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Terug</Link>
        <h1 className="text-2xl font-bold">{country.nameNl}</h1>
        <p className="text-gray-500">Nog geen reisadviezen beschikbaar voor dit land.</p>
      </div>
    );
  }

  const consensus = buildConsensus(advisories);
  const deviations = buildDeviations(advisories, consensus);
  const comparativeAnalysis = buildComparativeAnalysis(advisories, deviations);
  const recency = buildRecencyAnalysis(advisories);
  const totalSources = consensus.totalSources;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          ← Overzicht
        </Link>
        <ExportButtons iso={isoUpper} />
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{country.nameNl}</h1>
        <p className="text-gray-500 mt-1">{country.regionNl} · ISO: {country.isoAlpha2}</p>
      </div>

      {/* Consensus */}
      <div className={clsx("rounded-xl border p-5 space-y-4", CONSENSUS_COLORS[consensus.mostCommon])}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-medium opacity-70">Consensusniveau</p>
            <div className="mt-1">
              <RiskBadge level={consensus.mostCommon} size="lg" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            {(["green", "yellow", "orange", "red"] as NormalizedLevel[]).map((l) => (
              <div key={l}>
                <div className="text-2xl font-bold">{consensus.counts[l]}</div>
                <div className="text-xs opacity-70">{LEVEL_LABELS_NL[l]}</div>
                <div className={clsx("h-1.5 rounded-full mt-1", LEVEL_BAR_COLORS[l])}
                  style={{ opacity: consensus.counts[l] > 0 ? 1 : 0.2 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span><strong>Strengste:</strong> <RiskBadge level={consensus.strictest} size="sm" /></span>
          <span><strong>Mildste:</strong> <RiskBadge level={consensus.mildest} size="sm" /></span>
          <span className="opacity-70">{totalSources} van {8} bronnen beschikbaar</span>
        </div>
      </div>

      {/* Advisories table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Adviezen per overheid</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600 w-44">Overheid</th>
                <th className="px-4 py-3 font-semibold text-gray-600 w-28">Niveau</th>
                <th className="px-4 py-3 font-semibold text-gray-600 w-56">Officiële classificatie</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Samenvatting</th>
                <th className="px-4 py-3 font-semibold text-gray-600 w-36">Datums</th>
                <th className="px-4 py-3 font-semibold text-gray-600 w-12">Bron</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {SOURCES.map((src) => {
                const adv = advisories.find((a) => a.sourceId === src.id);

                if (!adv) {
                  return <LiveAdvisory key={src.id} sourceId={src.id} iso2={isoUpper} aiSummary={aiSummaries[isoUpper]?.[src.id] ?? null} />;
                }

                const noAdvisory = adv?.normalizedLevel === "unknown" && adv?.rawLevel === "Geen reisadvies beschikbaar";
                const isDeviation = adv ? deviations.some((d) => d.sourceId === adv.sourceId) : false;
                const deviation = adv ? deviations.find((d) => d.sourceId === adv.sourceId) : undefined;
                const age = adv ? ageDays(adv.officialUpdatedAt) : null;
                const isOld = age !== null && age > 90;

                return (
                  <tr
                    key={src.id}
                    className={clsx(
                      "hover:bg-blue-50/30 transition-colors even:bg-gray-50/60",
                      isDeviation && deviation?.direction === "stricter" && "bg-red-50/40",
                      isDeviation && deviation?.direction === "milder" && "bg-blue-50/30",
                      (!adv || noAdvisory) && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {src.flagEmoji} {src.nameNl}
                      </span>
                      {deviation && (
                        <div className="text-xs mt-0.5 text-orange-600 font-medium">
                          {deviation.direction === "stricter" ? "↑ Strenger" : "↓ Milder"}
                          {deviation.levelsDiff >= 2 && " ⚠"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {adv && !noAdvisory ? (
                        <div className="space-y-1.5">
                          {getMultiLevelDisplay(adv.sourceId, adv.rawLevel, adv.normalizedLevel, `${adv.summary ?? ""} ${rawSummaries.get(adv.sourceId) ?? ""}`).map((item, idx) => (
                            <div key={idx} className="flex flex-col items-start gap-0.5">
                              <RiskBadge level={item.level} size="sm" />
                              <span className="text-[10px] text-gray-400 leading-none">{item.area}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" colSpan={noAdvisory || !adv ? 2 : 1}>
                      {noAdvisory ? (
                        <p className="text-gray-400 text-sm italic">Geen reisadvies beschikbaar voor dit land</p>
                      ) : !adv ? (
                        <p className="text-gray-400 text-sm italic">Niet beschikbaar</p>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            {getLevelLabels(adv.sourceId, adv.rawLevel).map((label, idx) => (
                              <div key={idx} className="text-xs leading-snug">
                                <span className="text-gray-500">•</span>{" "}
                                <em className="text-gray-800 not-italic italic">{label.original}</em>
                                <br />
                                <span className="text-gray-400 text-[11px]">{label.nl}</span>
                              </div>
                            ))}
                          </div>
                          {adv.isStale && (
                            <p className="text-amber-600 text-xs mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Mogelijk verouderd
                            </p>
                          )}
                        </>
                      )}
                    </td>
                    {!noAdvisory && adv && (
                      <td className="px-4 py-3">
                        {adv.summary && (
                          <p className="text-gray-700 text-xs leading-relaxed line-clamp-3">{adv.summary}</p>
                        )}
                        {adv.risks.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {adv.risks.map((r) => (
                              <span key={r} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-500 space-y-1">
                      {adv ? (
                        <>
                          <div>
                            <span className="font-medium">Wijziging:</span>{" "}
                            <span className={clsx(isOld && "text-amber-600 font-medium")}>
                              {formatDateNl(adv.officialUpdatedAt)}
                              {isOld && " ⚠"}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">Opgehaald:</span>{" "}
                            {formatDateNl(adv.scrapedAt)}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {adv?.sourceUrl ? (
                        <a
                          href={adv.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors"
                          title="Officiële bron"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deviations */}
      {deviations.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-2">
          <h2 className="font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Afwijkingen
          </h2>
          <ul className="space-y-1.5 text-sm text-amber-800">
            {deviations.map((d) => (
              <li key={d.sourceId} className="flex items-start gap-2">
                <span>{d.flagEmoji}</span>
                <span>
                  <strong>{d.sourceNameNl}</strong> adviseert{" "}
                  <RiskBadge level={d.level} size="sm" /> —{" "}
                  {d.levelsDiff} niveau{d.levelsDiff > 1 ? "s" : ""}{" "}
                  {d.direction === "stricter" ? "strenger" : "milder"} dan de meerderheid
                  {d.levelsDiff >= 2 && " (significant)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comparative analysis */}
      {comparativeAnalysis.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-2">
          <h2 className="font-semibold text-blue-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Vergelijkende analyse
          </h2>
          <ul className="space-y-1.5 text-sm text-blue-800 list-disc list-inside">
            {comparativeAnalysis.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recency */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Info className="w-4 h-4" /> Actualiteitsanalyse
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Meest recent bijgewerkt</p>
            <p className="font-medium text-gray-900">
              {recency.mostRecent
                ? `${recency.mostRecent.nameNl} — ${formatDateNl(recency.mostRecent.date)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Oudste advies</p>
            <p className={clsx("font-medium", recency.oldest && ageDays(recency.oldest.date)! > 90 ? "text-amber-600" : "text-gray-900")}>
              {recency.oldest
                ? `${recency.oldest.nameNl} — ${formatDateNl(recency.oldest.date)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Gemiddelde leeftijd</p>
            <p className="font-medium text-gray-900">
              {recency.averageAgeDays !== null ? `${recency.averageAgeDays} dagen` : "—"}
            </p>
          </div>
        </div>
        {recency.staleCount > 0 && (
          <p className="text-amber-600 text-sm flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            {recency.staleCount} bron{recency.staleCount > 1 ? "nen hebben" : " heeft"} mogelijk verouderde data
          </p>
        )}
      </div>
    </div>
  );
}
