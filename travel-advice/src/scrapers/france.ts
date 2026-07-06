import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LEVEL_SELECTORS: Array<{ pattern: RegExp; rawLevel: string; severity: number }> = [
  { pattern: /formellement d.conseill./i, rawLevel: "Formellement déconseillé", severity: 3 },
  { pattern: /d.conseill.[\s\S]{0,20}sauf raison imp.rative/i, rawLevel: "Déconseillé sauf raison impérative", severity: 2 },
  { pattern: /d.conseill./i, rawLevel: "Déconseillé", severity: 2 },
  { pattern: /vigilance renforc.e/i, rawLevel: "Vigilance renforcée", severity: 1 },
  { pattern: /vigilance normale/i, rawLevel: "Vigilance normale", severity: 0 },
  { pattern: /s.curit. normale/i, rawLevel: "Sécurité normale", severity: 0 },
];

const KNOWN_ISO_SLUGS: Record<string, string> = {
  "afghanistan": "AF", "albanie": "AL", "algerie": "DZ", "allemagne": "DE",
  "andorre": "AD", "angola": "AO", "arabie-saoudite": "SA", "argentine": "AR",
  "armenie": "AM", "australie": "AU", "autriche": "AT", "azerbaidjan": "AZ",
  "bahamas": "BS", "bahrein": "BH", "bangladesh": "BD", "belgique": "BE",
  "belize": "BZ", "benin": "BJ", "bhoutan": "BT", "bolivie": "BO",
  "bosnie-herzegovine": "BA", "botswana": "BW", "bresil": "BR", "brunei": "BN",
  "bulgarie": "BG", "burkina-faso": "BF", "burundi": "BI", "cambodge": "KH",
  "cameroun": "CM", "canada": "CA", "cap-vert": "CV", "centrafrique": "CF",
  "chili": "CL", "chine": "CN", "chypre": "CY", "colombie": "CO",
  "comores": "KM", "congo-brazzaville": "CG", "congo-kinshasa": "CD",
  "coree-du-nord": "KP", "coree-du-sud": "KR", "costa-rica": "CR",
  "cote-d-ivoire": "CI", "croatie": "HR", "cuba": "CU", "danemark": "DK",
  "djibouti": "DJ", "dominique": "DM", "egypte": "EG", "emirats-arabes-unis": "AE",
  "equateur": "EC", "erythree": "ER", "espagne": "ES", "estonie": "EE",
  "eswatini": "SZ", "ethiopie": "ET", "fidji": "FJ", "finlande": "FI",
  "gabon": "GA", "gambie": "GM", "georgie": "GE", "ghana": "GH",
  "grece": "GR", "grenade": "GD", "guatemala": "GT", "guinee": "GN",
  "guinee-bissau": "GW", "guinee-equatoriale": "GQ", "guyana": "GY",
  "haiti": "HT", "honduras": "HN", "hongrie": "HU", "inde": "IN",
  "indonesie": "ID", "irak": "IQ", "iran": "IR", "irlande": "IE",
  "islande": "IS", "israel-et-territoires-palestiniens": "IL", "italie": "IT",
  "jamaique": "JM", "japon": "JP", "jordanie": "JO", "kazakhstan": "KZ",
  "kenya": "KE", "kirghizstan": "KG", "kiribati": "KI", "kosovo": "XK",
  "koweit": "KW", "laos": "LA", "lesotho": "LS", "lettonie": "LV",
  "liban": "LB", "liberia": "LR", "libye": "LY", "liechtenstein": "LI",
  "lituanie": "LT", "luxembourg": "LU", "madagascar": "MG", "malaisie": "MY",
  "malawi": "MW", "maldives": "MV", "mali": "ML", "malte": "MT",
  "maroc": "MA", "marshalls": "MH", "mauritanie": "MR", "maurice": "MU",
  "mexique": "MX", "micronesie": "FM", "moldavie": "MD", "monaco": "MC",
  "mongolie": "MN", "montenegro": "ME", "mozambique": "MZ", "myanmar": "MM",
  "namibie": "NA", "nauru": "NR", "nepal": "NP", "nicaragua": "NI",
  "niger": "NE", "nigeria": "NG", "macedoine-du-nord": "MK", "norvege": "NO",
  "nouvelle-zelande": "NZ", "oman": "OM", "ouganda": "UG", "ouzbekistan": "UZ",
  "pakistan": "PK", "palaos": "PW", "panama": "PA", "papouasie-nouvelle-guinee": "PG",
  "paraguay": "PY", "pays-bas": "NL", "perou": "PE", "philippines": "PH",
  "pologne": "PL", "portugal": "PT", "qatar": "QA", "republique-dominicaine": "DO",
  "republique-tcheque": "CZ", "roumanie": "RO", "royaume-uni": "GB",
  "russie": "RU", "rwanda": "RW", "salvador": "SV", "samoa": "WS",
  "sao-tome-et-principe": "ST", "senegal": "SN", "serbie": "RS",
  "seychelles": "SC", "sierra-leone": "SL", "singapour": "SG",
  "slovaquie": "SK", "slovenie": "SI", "somalie": "SO", "soudan": "SD",
  "soudan-du-sud": "SS", "sri-lanka": "LK", "suede": "SE", "suisse": "CH",
  "surinam": "SR", "syrie": "SY", "tadjikistan": "TJ", "taiwan": "TW",
  "tanzanie": "TZ", "tchad": "TD", "thailande": "TH", "timor-leste": "TL",
  "togo": "TG", "tonga": "TO", "trinite-et-tobago": "TT", "tunisie": "TN",
  "turkmenistan": "TM", "turquie": "TR", "tuvalu": "TV",
  "ukraine": "UA", "uruguay": "UY", "vanuatu": "VU", "venezuela": "VE",
  "viet-nam": "VN", "yemen": "YE", "zambie": "ZM", "zimbabwe": "ZW",
};

function extractLevelFromHtml(html: string): string {
  // Strip nav/header/footer to avoid picking up levels from boilerplate
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]*>/g, " ");

  // Return the LEAST SEVERE level found — this is the general country level.
  // Regional breakdowns list stricter zones first, so we don't want the max.
  let minLevel = { rawLevel: "Vigilance normale", severity: Infinity };
  for (const { pattern, rawLevel, severity } of LEVEL_SELECTORS) {
    if (pattern.test(plain) && severity < minLevel.severity) {
      minLevel = { rawLevel, severity };
    }
  }
  return minLevel.severity === Infinity ? "Vigilance normale" : minLevel.rawLevel;
}

function extractSummary(html: string): string {
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  const plain = cleanHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Extract full main content so that ALL zone levels (including regional breakdowns
  // that appear later on the page) are available for compound detection in page.tsx.
  const contentMatch =
    cleanHtml.match(/<div[^>]*class="[^"]*field-item[^"]*"[^>]*>([\s\S]{0,12000})/i) ??
    cleanHtml.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]{0,12000})/i) ??
    cleanHtml.match(/<main[^>]*>([\s\S]{0,12000})/i);

  if (contentMatch) {
    const text = contentMatch[1]
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 20) return text.slice(0, 3000);
  }

  // Fallback: first 3000 chars of plain text
  return plain.slice(0, 3000);
}

export const franceScraper: Scraper = async () => {
  const scrapedAt = new Date();
  const advisories: RawAdvisory[] = [];

  const slugEntries = Object.entries(KNOWN_ISO_SLUGS);
  const BATCH = 3;

  for (let i = 0; i < slugEntries.length; i += BATCH) {
    const batch = slugEntries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ([slug, iso2]) => {
        try {
          const infoUrl = `https://www.diplomatie.gouv.fr/fr/information-par-pays/${slug}/conseils-aux-voyageurs-securite`;
          const fallbackUrl = `https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/${slug}/`;

          let res = await fetch(infoUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)",
              Accept: "text/html",
            },
            signal: AbortSignal.timeout(15_000),
          });
          let usedUrl = infoUrl;

          if (!res.ok) {
            res = await fetch(fallbackUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)",
                Accept: "text/html",
              },
              signal: AbortSignal.timeout(15_000),
            });
            usedUrl = fallbackUrl;
            if (!res.ok) return;
          }

          const html = await res.text();
          const rawLevel = extractLevelFromHtml(html);
          const normalizedLevel = normalizeLevel("france", rawLevel);
          const summary = extractSummary(html);

          let officialUpdatedAt: Date | null = null;
          const metaDate = html.match(/<meta[^>]+property="article:modified_time"[^>]+content="([^"]+)"/i);
          if (metaDate) {
            const d = new Date(metaDate[1]);
            if (!isNaN(d.getTime())) officialUpdatedAt = d;
          } else {
            const frDate = html.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (frDate) {
              const d = new Date(`${frDate[3]}-${frDate[2].padStart(2, "0")}-${frDate[1].padStart(2, "0")}`);
              if (!isNaN(d.getTime())) officialUpdatedAt = d;
            }
          }

          advisories.push({
            destIso2: iso2,
            rawLevel,
            normalizedLevel,
            summary,
            risks: [],
            officialUpdatedAt,
            sourceUrl: usedUrl,
          });
        } catch {
          // Skip individual country failures
        }
      })
    );
    if (i + BATCH < slugEntries.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Supplement compound-zone countries with static data.
  // The France scraper picks the worst level found, which may be a regional warning.
  // The static JSON provides the correct base level for known countries.
  try {
    const staticUrl = "https://raw.githubusercontent.com/MvdB-123/vibe/main/travel-advice/data/france-advisories.json";
    const res = await fetch(staticUrl, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const staticData: Array<{ iso2: string; rawLevel: string; summary: string; url: string; updatedAt?: string }> = await res.json();
      for (const entry of staticData) {
        const idx = advisories.findIndex((a) => a.destIso2 === entry.iso2);
        if (idx >= 0) {
          advisories[idx] = {
            ...advisories[idx],
            summary: entry.summary,
            rawLevel: entry.rawLevel,
            normalizedLevel: normalizeLevel("france", entry.rawLevel),
          };
        } else {
          advisories.push({
            destIso2: entry.iso2,
            rawLevel: entry.rawLevel,
            normalizedLevel: normalizeLevel("france", entry.rawLevel),
            summary: entry.summary,
            risks: [],
            officialUpdatedAt: entry.updatedAt ? new Date(entry.updatedAt) : null,
            sourceUrl: entry.url,
          });
        }
      }
    }
  } catch { /* skip */ }

  return { sourceId: "france", advisories, scrapedAt };
};
