import type {
  AdvisoryRow,
  ConsensusAnalysis,
  Deviation,
  NormalizedLevel,
  RecencyAnalysis,
} from "@/types";
import {
  levelIndex,
  strictest,
  mildest,
  mostCommon,
  LEVEL_LABELS_NL,
} from "./normalize-risk";

export function buildConsensus(advisories: AdvisoryRow[]): ConsensusAnalysis {
  const levels = advisories.map((a) => a.normalizedLevel);
  const counts: Record<NormalizedLevel, number> = {
    green: 0, yellow: 0, orange: 0, red: 0, unknown: 0,
  };
  for (const l of levels) counts[l]++;

  return {
    counts,
    mostCommon: mostCommon(levels),
    strictest: strictest(levels),
    mildest: mildest(levels),
    totalSources: advisories.length,
  };
}

export function buildDeviations(
  advisories: AdvisoryRow[],
  consensus: ConsensusAnalysis
): Deviation[] {
  const baseline = consensus.mostCommon;
  const baselineIdx = levelIndex(baseline);

  return advisories
    .filter((a) => a.normalizedLevel !== "unknown")
    .map((a) => {
      const diff = levelIndex(a.normalizedLevel) - baselineIdx;
      if (diff === 0) return null;
      return {
        sourceId: a.sourceId,
        sourceNameNl: a.sourceNameNl,
        flagEmoji: a.sourceFlagEmoji,
        level: a.normalizedLevel,
        direction: diff > 0 ? ("stricter" as const) : ("milder" as const),
        levelsDiff: Math.abs(diff),
      };
    })
    .filter(Boolean) as Deviation[];
}

export function buildComparativeAnalysis(
  advisories: AdvisoryRow[],
  deviations: Deviation[]
): string[] {
  const bullets: string[] = [];

  const stricterSources = deviations.filter((d) => d.direction === "stricter");
  const milderSources = deviations.filter((d) => d.direction === "milder");
  const bigDeviations = deviations.filter((d) => d.levelsDiff >= 2);

  if (stricterSources.length > 0) {
    const names = stricterSources.map((d) => `${d.flagEmoji} ${d.sourceNameNl}`).join(", ");
    bullets.push(`${names} advise${stricterSources.length === 1 ? "ert" : "ren"} strenger dan de meerderheid.`);
  }

  if (milderSources.length > 0) {
    const names = milderSources.map((d) => `${d.flagEmoji} ${d.sourceNameNl}`).join(", ");
    bullets.push(`${names} advise${milderSources.length === 1 ? "ert" : "ren"} milder dan de meerderheid.`);
  }

  if (bigDeviations.length > 0) {
    const names = bigDeviations.map((d) =>
      `${d.flagEmoji} ${d.sourceNameNl} (${LEVEL_LABELS_NL[d.level]})`
    ).join(", ");
    bullets.push(`Opvallende afwijking van 2+ niveaus: ${names}.`);
  }

  // Risk mentions
  const allRisks = advisories.flatMap((a) => a.risks);
  const riskCounts: Record<string, number> = {};
  for (const r of allRisks) riskCounts[r] = (riskCounts[r] ?? 0) + 1;
  const topRisks = Object.entries(riskCounts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([r]) => r);
  if (topRisks.length > 0) {
    bullets.push(`Meest genoemde risico's: ${topRisks.join(", ")}.`);
  }

  const agreedSources = advisories.filter((a) => a.normalizedLevel !== "unknown");
  const allSame = new Set(agreedSources.map((a) => a.normalizedLevel)).size === 1;
  if (allSame && agreedSources.length > 1) {
    bullets.push(`Alle ${agreedSources.length} overheden zijn het eens over het risiconiveau.`);
  }

  return bullets.slice(0, 5);
}

export function buildRecencyAnalysis(advisories: AdvisoryRow[]): RecencyAnalysis {
  const withDates = advisories.filter((a) => a.officialUpdatedAt);

  if (!withDates.length) {
    return {
      mostRecent: null,
      oldest: null,
      averageAgeDays: null,
      staleCount: advisories.filter((a) => a.isStale).length,
    };
  }

  const sorted = [...withDates].sort(
    (a, b) => (b.officialUpdatedAt?.getTime() ?? 0) - (a.officialUpdatedAt?.getTime() ?? 0)
  );

  const mostRecentAdv = sorted[0];
  const oldestAdv = sorted[sorted.length - 1];
  const now = Date.now();

  const avgAgeMs =
    withDates.reduce((sum, a) => sum + (now - (a.officialUpdatedAt?.getTime() ?? now)), 0) /
    withDates.length;

  return {
    mostRecent: mostRecentAdv.officialUpdatedAt
      ? { sourceId: mostRecentAdv.sourceId, nameNl: mostRecentAdv.sourceNameNl, date: mostRecentAdv.officialUpdatedAt }
      : null,
    oldest: oldestAdv.officialUpdatedAt
      ? { sourceId: oldestAdv.sourceId, nameNl: oldestAdv.sourceNameNl, date: oldestAdv.officialUpdatedAt }
      : null,
    averageAgeDays: Math.round(avgAgeMs / (1000 * 60 * 60 * 24)),
    staleCount: advisories.filter((a) => a.isStale).length,
  };
}
