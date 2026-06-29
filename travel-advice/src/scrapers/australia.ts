import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LEVEL_MAP: Record<number, string> = {
  1: "Exercise normal safety precautions",
  2: "Exercise a high degree of caution",
  3: "Reconsider your need to travel",
  4: "Do not travel",
};

const LEVEL_TEXT_MAP: Record<string, string> = {
  "exercise normal safety precautions": "Exercise normal safety precautions",
  "exercise a high degree of caution": "Exercise a high degree of caution",
  "reconsider your need to travel": "Reconsider your need to travel",
  "do not travel": "Do not travel",
};

interface AUDestination {
  iso2?: string;
  iso?: string;
  country_code?: string;
  iso_code?: string;
  advisory_level?: number;
  level?: number;
  overall_advisory_level?: number;
  summary?: string;
  updated_at?: string;
  last_updated?: string;
  url?: string;
  slug?: string;
  risks?: string[];
  risk_factors?: string[];
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

const ISO2_TO_SLUG: Record<string, string> = {
  AF:"asia/afghanistan",AL:"europe/albania",DZ:"africa/algeria",AO:"africa/angola",
  AR:"americas/argentina",AM:"europe/armenia",AT:"europe/austria",AZ:"europe/azerbaijan",
  BH:"middle-east/bahrain",BD:"asia/bangladesh",BB:"americas/barbados",BY:"europe/belarus",
  BE:"europe/belgium",BZ:"americas/belize",BJ:"africa/benin",BT:"asia/bhutan",
  BO:"americas/bolivia",BA:"europe/bosnia-and-herzegovina",BW:"africa/botswana",BR:"americas/brazil",
  BN:"asia/brunei",BG:"europe/bulgaria",BF:"africa/burkina-faso",BI:"africa/burundi",
  CV:"africa/cabo-verde",KH:"asia/cambodia",CM:"africa/cameroon",CA:"americas/canada",
  CF:"africa/central-african-republic",TD:"africa/chad",CL:"americas/chile",CN:"asia/china",
  CO:"americas/colombia",KM:"africa/comoros",CD:"africa/democratic-republic-of-the-congo",
  CG:"africa/republic-of-the-congo",CR:"americas/costa-rica",CI:"africa/cote-divoire",
  HR:"europe/croatia",CU:"americas/cuba",CY:"europe/cyprus",CZ:"europe/czech-republic",
  DK:"europe/denmark",DJ:"africa/djibouti",DM:"americas/dominica",DO:"americas/dominican-republic",
  EC:"americas/ecuador",EG:"middle-east/egypt",SV:"americas/el-salvador",GQ:"africa/equatorial-guinea",
  ER:"africa/eritrea",EE:"europe/estonia",SZ:"africa/eswatini",ET:"africa/ethiopia",
  FJ:"pacific/fiji",FI:"europe/finland",FR:"europe/france",GA:"africa/gabon",
  GM:"africa/gambia",GE:"europe/georgia",DE:"europe/germany",GH:"africa/ghana",
  GR:"europe/greece",GD:"americas/grenada",GT:"americas/guatemala",GN:"africa/guinea",
  GW:"africa/guinea-bissau",GY:"americas/guyana",HT:"americas/haiti",HN:"americas/honduras",
  HU:"europe/hungary",IS:"europe/iceland",IN:"asia/india",ID:"asia/indonesia",
  IR:"middle-east/iran",IQ:"middle-east/iraq",IE:"europe/ireland",IL:"middle-east/israel",
  IT:"europe/italy",JM:"americas/jamaica",JP:"asia/japan",JO:"middle-east/jordan",
  KZ:"asia/kazakhstan",KE:"africa/kenya",KI:"pacific/kiribati",KP:"asia/north-korea",
  KR:"asia/south-korea",XK:"europe/kosovo",KW:"middle-east/kuwait",KG:"asia/kyrgyzstan",
  LA:"asia/laos",LV:"europe/latvia",LB:"middle-east/lebanon",LS:"africa/lesotho",
  LR:"africa/liberia",LY:"middle-east/libya",LI:"europe/liechtenstein",LT:"europe/lithuania",
  LU:"europe/luxembourg",MG:"africa/madagascar",MW:"africa/malawi",MY:"asia/malaysia",
  MV:"asia/maldives",ML:"africa/mali",MT:"europe/malta",MH:"pacific/marshall-islands",
  MR:"africa/mauritania",MU:"africa/mauritius",MX:"americas/mexico",FM:"pacific/micronesia",
  MD:"europe/moldova",MC:"europe/monaco",MN:"asia/mongolia",ME:"europe/montenegro",
  MA:"africa/morocco",MZ:"africa/mozambique",MM:"asia/myanmar",NA:"africa/namibia",
  NR:"pacific/nauru",NP:"asia/nepal",NL:"europe/netherlands",NZ:"pacific/new-zealand",
  NI:"americas/nicaragua",NE:"africa/niger",NG:"africa/nigeria",MK:"europe/north-macedonia",
  NO:"europe/norway",OM:"middle-east/oman",PK:"asia/pakistan",PW:"pacific/palau",
  PS:"middle-east/palestinian-territories",PA:"americas/panama",PG:"pacific/papua-new-guinea",
  PY:"americas/paraguay",PE:"americas/peru",PH:"asia/philippines",PL:"europe/poland",
  PT:"europe/portugal",QA:"middle-east/qatar",RO:"europe/romania",RU:"europe/russia",
  RW:"africa/rwanda",KN:"americas/saint-kitts-and-nevis",LC:"americas/saint-lucia",
  VC:"americas/saint-vincent-and-the-grenadines",WS:"pacific/samoa",ST:"africa/sao-tome-and-principe",
  SA:"middle-east/saudi-arabia",SN:"africa/senegal",RS:"europe/serbia",SC:"africa/seychelles",
  SL:"africa/sierra-leone",SG:"asia/singapore",SK:"europe/slovakia",SI:"europe/slovenia",
  SB:"pacific/solomon-islands",SO:"africa/somalia",ZA:"africa/south-africa",SS:"africa/south-sudan",
  ES:"europe/spain",LK:"asia/sri-lanka",SD:"africa/sudan",SR:"americas/suriname",
  SE:"europe/sweden",CH:"europe/switzerland",SY:"middle-east/syria",TW:"asia/taiwan",
  TJ:"asia/tajikistan",TZ:"africa/tanzania",TH:"asia/thailand",TL:"asia/timor-leste",
  TG:"africa/togo",TO:"pacific/tonga",TT:"americas/trinidad-and-tobago",TN:"africa/tunisia",
  TR:"middle-east/turkiye",TM:"asia/turkmenistan",TV:"pacific/tuvalu",UG:"africa/uganda",
  UA:"europe/ukraine",AE:"middle-east/united-arab-emirates",GB:"europe/united-kingdom",
  US:"americas/united-states-of-america",UY:"americas/uruguay",UZ:"asia/uzbekistan",
  VU:"pacific/vanuatu",VE:"americas/venezuela",VN:"asia/vietnam",YE:"middle-east/yemen",
  ZM:"africa/zambia",ZW:"africa/zimbabwe",
};

function extractLevelFromHtml(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
  for (const [pattern, level] of Object.entries(LEVEL_TEXT_MAP)) {
    if (text.includes(pattern)) return level;
  }
  return null;
}

function extractSummary(html: string): string {
  const match = html.match(/<div[^>]*class="[^"]*field--name-body[^"]*"[^>]*>([\s\S]{0,3000})/i)
    ?? html.match(/<div[^>]*class="[^"]*views-field-body[^"]*"[^>]*>([\s\S]{0,3000})/i)
    ?? html.match(/<main[^>]*>([\s\S]{0,3000})/i);
  return (match?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export const australiaScraper: Scraper = async () => {
  const scrapedAt = new Date();

  // Try JSON API first
  try {
    const res = await fetch("https://www.smartraveller.gov.au/destinations-export", {
      headers: { ...BROWSER_HEADERS, Accept: "application/json" },
      signal: AbortSignal.timeout(45_000),
    });
    if (res.ok) {
      const data: AUDestination[] = await res.json();
      if (data.length > 10) {
        const advisories: RawAdvisory[] = [];
        for (const dest of data) {
          const iso2 = (dest.iso2 ?? dest.iso ?? dest.country_code ?? dest.iso_code ?? "").toUpperCase();
          if (!iso2) continue;
          const levelNum = dest.advisory_level ?? dest.level ?? dest.overall_advisory_level ?? 0;
          const rawLevel = LEVEL_MAP[levelNum];
          if (!rawLevel) continue;
          advisories.push({
            destIso2: iso2,
            rawLevel,
            normalizedLevel: normalizeLevel("australia", rawLevel),
            summary: (dest.summary ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
            risks: dest.risks ?? dest.risk_factors ?? [],
            officialUpdatedAt: (dest.updated_at ?? dest.last_updated) ? new Date(dest.updated_at ?? dest.last_updated!) : null,
            sourceUrl: dest.url ?? `https://www.smartraveller.gov.au/destinations`,
          });
        }
        return { sourceId: "australia", advisories, scrapedAt };
      }
    }
  } catch {
    // Fall through to HTML scraping
  }

  // Fallback: scrape individual country pages
  const advisories: RawAdvisory[] = [];
  const entries = Object.entries(ISO2_TO_SLUG);
  const BATCH = 10;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ([iso2, slug]) => {
        try {
          const url = `https://www.smartraveller.gov.au/destinations/${slug}`;
          const res = await fetch(url, {
            headers: BROWSER_HEADERS,
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return;
          const html = await res.text();
          const rawLevel = extractLevelFromHtml(html);
          if (!rawLevel) return;

          const dateMatch = html.match(/<time[^>]+datetime="([^"]+)"/i)
            ?? html.match(/Last updated[:\s]*(\d{1,2}\s+\w+\s+\d{4})/i);

          advisories.push({
            destIso2: iso2,
            rawLevel,
            normalizedLevel: normalizeLevel("australia", rawLevel),
            summary: extractSummary(html),
            risks: [],
            officialUpdatedAt: dateMatch ? new Date(dateMatch[1]) : null,
            sourceUrl: url,
          });
        } catch {
          // skip
        }
      })
    );
    if (i + BATCH < entries.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return { sourceId: "australia", advisories, scrapedAt, error: advisories.length === 0 ? "HTML fallback yielded 0 results" : undefined };
};
