import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LEVEL_SELECTORS: Array<{ pattern: RegExp; rawLevel: string }> = [
  { pattern: /formellement d.conseill./i, rawLevel: "Formellement déconseillé" },
  { pattern: /d.conseill.[\s\S]{0,20}sauf raison imp.rative/i, rawLevel: "Déconseillé sauf raison impérative" },
  { pattern: /vigilance renforc.e/i, rawLevel: "Vigilance renforcée" },
  { pattern: /vigilance normale/i, rawLevel: "Vigilance normale" },
  { pattern: /s.curit. normale/i, rawLevel: "Sécurité normale" },
  { pattern: /d.conseill./i, rawLevel: "Déconseillé" },
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
  for (const { pattern, rawLevel } of LEVEL_SELECTORS) {
    if (pattern.test(html)) return rawLevel;
  }
  return "Vigilance normale";
}

function extractSummary(html: string): string {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const { pattern } of LEVEL_SELECTORS) {
    const match = plain.match(pattern);
    if (match && match.index !== undefined) {
      const snippet = plain.slice(match.index, match.index + 350).trim();
      if (snippet.length > 20) return snippet.slice(0, 300);
    }
  }
  return "";
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

          const dateMatch = html.match(/<meta[^>]+property="article:modified_time"[^>]+content="([^"]+)"/i)
            ?? html.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          let officialUpdatedAt: Date | null = null;
          if (dateMatch) {
            const d = new Date(dateMatch[1]);
            if (!isNaN(d.getTime())) officialUpdatedAt = d;
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

  return { sourceId: "france", advisories, scrapedAt };
};
