import type { NormalizedLevel } from "@/types";

type NormalizationMap = Record<string, NormalizedLevel>;

const NORMALIZATION: Record<string, NormalizationMap> = {
  uk: {
    "no advice against travel": "green",
    "normal precautions": "green",
    "some parts advise against all but essential travel": "yellow",
    "exercise a high degree of caution": "yellow",
    "advise against all but essential travel": "orange",
    "advise against all travel to parts": "orange",
    "advise against all travel": "red",
    "do not travel": "red",
  },
  us: {
    "level 1: exercise normal precautions": "green",
    "exercise normal precautions": "green",
    "level 2: exercise increased caution": "yellow",
    "exercise increased caution": "yellow",
    "level 3: reconsider travel": "orange",
    "reconsider travel": "orange",
    "level 4: do not travel": "red",
    "do not travel": "red",
  },
  australia: {
    "exercise normal safety precautions": "green",
    "exercise a high degree of caution": "yellow",
    "reconsider your need to travel": "orange",
    "do not travel": "red",
  },
  canada: {
    "take normal security precautions": "green",
    "exercise normal security precautions": "green",
    "exercise a high degree of caution": "yellow",
    "avoid non-essential travel": "orange",
    "avoid all travel": "red",
  },
  germany: {
    "keine besonderen sicherheitshinweise": "green",
    "besondere vorsicht": "yellow",
    "erhöhte vorsicht": "yellow",
    "von reisen wird abgeraten": "orange",
    "von nicht notwendigen reisen abraten": "orange",
    "von nicht notwendigen reisen wird abgeraten": "orange",
    "teilreisewarnung": "orange",
    "reisewarnung": "red",
  },
  france: {
    "sécurité normale": "green",
    "vigilance normale": "green",
    "vigilance renforcée": "yellow",
    "déconseillé sauf raison impérative": "orange",
    "déconseillé": "red",
    "formellement déconseillé": "red",
  },
  denmark: {
    "ingen særlige advarsler": "green",
    "vær opmærksom": "green",
    "vær forsigtig": "yellow",
    "vær ekstra opmærksom": "yellow",
    "fraråd ikke-nødvendige rejser": "orange",
    "undgå ikke-nødvendige rejser": "orange",
    "rejse frarådes": "red",
    "undgå alle rejser": "red",
  },
  sweden: {
    "inga särskilda restriktioner": "green",
    "var försiktig": "yellow",
    "avråd från icke nödvändiga resor": "orange",
    "avråd från resor": "red",
  },
};

export function normalizeLevel(
  sourceId: string,
  rawLevel: string
): NormalizedLevel {
  const map = NORMALIZATION[sourceId];
  if (!map) return "unknown";
  const key = rawLevel.toLowerCase().trim();
  // exact match first
  if (map[key]) return map[key];
  // partial match fallback
  for (const [pattern, level] of Object.entries(map)) {
    if (key.includes(pattern) || pattern.includes(key)) return level;
  }
  return "unknown";
}

export const LEVEL_ORDER: NormalizedLevel[] = [
  "green",
  "yellow",
  "orange",
  "red",
  "unknown",
];

export const LEVEL_LABELS_NL: Record<NormalizedLevel, string> = {
  green: "Groen",
  yellow: "Geel",
  orange: "Oranje",
  red: "Rood",
  unknown: "Onbekend",
};

export function levelIndex(level: NormalizedLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

export function strictest(levels: NormalizedLevel[]): NormalizedLevel {
  return levels.reduce((a, b) =>
    levelIndex(a) > levelIndex(b) ? a : b, "green"
  );
}

export function mildest(levels: NormalizedLevel[]): NormalizedLevel {
  const known = levels.filter((l) => l !== "unknown");
  if (!known.length) return "unknown";
  return known.reduce((a, b) => (levelIndex(a) < levelIndex(b) ? a : b));
}

export function mostCommon(levels: NormalizedLevel[]): NormalizedLevel {
  const counts: Partial<Record<NormalizedLevel, number>> = {};
  for (const l of levels) counts[l] = (counts[l] ?? 0) + 1;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "unknown") as NormalizedLevel;
}
