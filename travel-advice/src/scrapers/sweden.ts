import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// Sweden's Ministry for Foreign Affairs — swedenabroad.se — HTML scraping
// URL: https://www.swedenabroad.se/sv/om-utlandet-for-svenska-medborgare/{slug}/reseinformation/

const LEVEL_PATTERNS: Array<{ pattern: RegExp; rawLevel: string }> = [
  { pattern: /avråd[^\w]*från resor/i, rawLevel: "Avråd från resor" },
  { pattern: /avråd[^\w]*från icke nödvändiga/i, rawLevel: "Avråd från icke nödvändiga resor" },
  { pattern: /var försiktig/i, rawLevel: "Var försiktig" },
  { pattern: /inga särskilda/i, rawLevel: "Inga särskilda restriktioner" },
];

const KNOWN_ISO_SLUGS: Record<string, string> = {
  "afghanistan": "AF", "albanien": "AL", "algeriet": "DZ", "angola": "AO",
  "argentina": "AR", "armenien": "AM", "australien": "AU", "azerbajdzjan": "AZ",
  "bahrain": "BH", "bangladesh": "BD", "belgien": "BE", "belize": "BZ",
  "benin": "BJ", "bhutan": "BT", "bolivia": "BO", "bosnien-hercegovina": "BA",
  "botswana": "BW", "brasilien": "BR", "brunei": "BN", "bulgarien": "BG",
  "burkina-faso": "BF", "burundi": "BI", "kambodja": "KH", "kamerun": "CM",
  "kanada": "CA", "kap-verde": "CV", "chile": "CL", "kina": "CN",
  "colombia": "CO", "kongo-brazzaville": "CG", "kongo-kinshasa": "CD",
  "costa-rica": "CR", "elfenbenskusten": "CI", "kroatien": "HR", "kuba": "CU",
  "cypern": "CY", "tjeckien": "CZ", "djibouti": "DJ", "dominica": "DM",
  "dominikanska-republiken": "DO", "ecuador": "EC", "egypten": "EG",
  "el-salvador": "SV", "eritrea": "ER", "estland": "EE", "etiopien": "ET",
  "fiji": "FJ", "finland": "FI", "frankrike": "FR", "gabon": "GA",
  "georgien": "GE", "ghana": "GH", "grekland": "GR", "guatemala": "GT",
  "guinea": "GN", "guinea-bissau": "GW", "guyana": "GY", "haiti": "HT",
  "honduras": "HN", "ungern": "HU", "indien": "IN", "indonesien": "ID",
  "irak": "IQ", "iran": "IR", "irland": "IE", "israel": "IL",
  "italien": "IT", "jamaica": "JM", "japan": "JP", "jordanien": "JO",
  "kazakstan": "KZ", "kenya": "KE", "kirgizistan": "KG", "kuwait": "KW",
  "laos": "LA", "lettland": "LV", "libanon": "LB", "liberia": "LR",
  "libyen": "LY", "litauen": "LT", "luxemburg": "LU", "madagaskar": "MG",
  "malawi": "MW", "malaysia": "MY", "maldiverna": "MV", "mali": "ML",
  "malta": "MT", "marocko": "MA", "mauretanien": "MR", "mauritius": "MU",
  "mexiko": "MX", "moldavien": "MD", "mongoliet": "MN", "montenegro": "ME",
  "moçambique": "MZ", "myanmar": "MM", "namibia": "NA", "nepal": "NP",
  "nya-zeeland": "NZ", "nicaragua": "NI", "niger": "NE", "nigeria": "NG",
  "nordkorea": "KP", "nordmakedonien": "MK", "norge": "NO", "oman": "OM",
  "pakistan": "PK", "panama": "PA", "papua-nya-guinea": "PG", "paraguay": "PY",
  "peru": "PE", "filippinerna": "PH", "polen": "PL", "portugal": "PT",
  "qatar": "QA", "rumänien": "RO", "ryssland": "RU", "rwanda": "RW",
  "saudiarabien": "SA", "senegal": "SN", "serbien": "RS", "sierra-leone": "SL",
  "singapore": "SG", "slovakien": "SK", "slovenien": "SI", "somalia": "SO",
  "sydafrika": "ZA", "sydkorea": "KR", "sydsudan": "SS", "spanien": "ES",
  "sri-lanka": "LK", "sudan": "SD", "surinam": "SR", "schweiz": "CH",
  "syrien": "SY", "tadzjikistan": "TJ", "taiwan": "TW", "tanzania": "TZ",
  "thailand": "TH", "togo": "TG", "tonga": "TO", "trinidad-och-tobago": "TT",
  "tunisien": "TN", "turkmenistan": "TM", "turkiet": "TR", "uganda": "UG",
  "ukraina": "UA", "uae": "AE", "usa": "US", "uruguay": "UY",
  "uzbekistan": "UZ", "vanuatu": "VU", "venezuela": "VE", "vietnam": "VN",
  "jemen": "YE", "zambia": "ZM", "zimbabwe": "ZW",
};

function extractLevel(html: string): string {
  for (const { pattern, rawLevel } of LEVEL_PATTERNS) {
    if (pattern.test(html)) return rawLevel;
  }
  return "Inga särskilda restriktioner";
}

function extractSummary(html: string): string {
  const match = html.match(/<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]{0,3000})/i)
    ?? html.match(/<main[^>]*>([\s\S]{0,3000})/i);
  const text = (match?.[1] ?? html.slice(0, 2000))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 300);
}

export const swedenScraper: Scraper = async () => {
  const scrapedAt = new Date();
  const advisories: RawAdvisory[] = [];

  const slugEntries = Object.entries(KNOWN_ISO_SLUGS);
  const BATCH = 3;

  for (let i = 0; i < slugEntries.length; i += BATCH) {
    const batch = slugEntries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ([slug, iso2]) => {
        try {
          const url = `https://www.swedenabroad.se/sv/om-utlandet-for-svenska-medborgare/${slug}/reseinformation/`;
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)",
              Accept: "text/html",
            },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) return;

          const html = await res.text();
          const rawLevel = extractLevel(html);
          const normalizedLevel = normalizeLevel("sweden", rawLevel);
          const summary = extractSummary(html);

          const dateMatch = html.match(/<time[^>]+datetime="([^"]+)"/i)
            ?? html.match(/Uppdaterad[^:]*:\s*(\d{4}-\d{2}-\d{2})/i);
          const officialUpdatedAt = dateMatch ? new Date(dateMatch[1]) : null;

          advisories.push({
            destIso2: iso2,
            rawLevel,
            normalizedLevel,
            summary,
            risks: [],
            officialUpdatedAt: officialUpdatedAt && !isNaN(officialUpdatedAt.getTime()) ? officialUpdatedAt : null,
            sourceUrl: url,
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

  return { sourceId: "sweden", advisories, scrapedAt };
};
