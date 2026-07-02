import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const BASE_HTML = "https://travel.gc.ca/destinations";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;
const REQUEST_TIMEOUT_MS = 15_000;

const LEVEL_PATTERNS: Array<{ pattern: RegExp; rawLevel: string }> = [
  { pattern: /avoid non-essential travel/i, rawLevel: "Avoid non-essential travel" },
  { pattern: /avoid all travel/i, rawLevel: "Avoid all travel" },
  { pattern: /exercise a high degree of caution/i, rawLevel: "Exercise a high degree of caution" },
  { pattern: /take normal security precautions/i, rawLevel: "Take normal security precautions" },
  { pattern: /exercise normal security precautions/i, rawLevel: "Exercise normal security precautions" },
];

const ISO2_TO_SLUG: Record<string, string> = {
  AF:"afghanistan",AL:"albania",DZ:"algeria",AD:"andorra",AO:"angola",AG:"antigua-and-barbuda",
  AR:"argentina",AM:"armenia",AU:"australia",AT:"austria",AZ:"azerbaijan",BS:"bahamas",
  BH:"bahrain",BD:"bangladesh",BB:"barbados",BY:"belarus",BE:"belgium",BZ:"belize",
  BJ:"benin",BT:"bhutan",BO:"bolivia",BA:"bosnia-and-herzegovina",BW:"botswana",BR:"brazil",
  BN:"brunei",BG:"bulgaria",BF:"burkina-faso",BI:"burundi",CV:"cabo-verde",KH:"cambodia",
  CM:"cameroon",CF:"central-african-republic",TD:"chad",CL:"chile",CN:"china",CO:"colombia",
  KM:"comoros",CD:"democratic-republic-congo",CG:"congo",CR:"costa-rica",CI:"cote-d-ivoire",
  HR:"croatia",CU:"cuba",CY:"cyprus",CZ:"czech-republic",DJ:"djibouti",DM:"dominica",
  DO:"dominican-republic",EC:"ecuador",EG:"egypt",SV:"el-salvador",GQ:"equatorial-guinea",
  ER:"eritrea",EE:"estonia",SZ:"eswatini",ET:"ethiopia",FJ:"fiji",FI:"finland",FR:"france",
  GA:"gabon",GM:"gambia",GE:"georgia",DE:"germany",GH:"ghana",GR:"greece",GD:"grenada",
  GT:"guatemala",GN:"guinea",GW:"guinea-bissau",GY:"guyana",HT:"haiti",HN:"honduras",
  HU:"hungary",IS:"iceland",IN:"india",ID:"indonesia",IR:"iran",IQ:"iraq",IE:"ireland",
  IL:"israel-the-west-bank-and-the-gaza-strip",IT:"italy",JM:"jamaica",JP:"japan",JO:"jordan",
  KZ:"kazakhstan",KE:"kenya",KI:"kiribati",KP:"north-korea",KR:"south-korea",XK:"kosovo",
  KW:"kuwait",KG:"kyrgyzstan",LA:"laos",LV:"latvia",LB:"lebanon",LS:"lesotho",LR:"liberia",
  LY:"libya",LI:"liechtenstein",LT:"lithuania",LU:"luxembourg",MG:"madagascar",MW:"malawi",
  MY:"malaysia",MV:"maldives",ML:"mali",MT:"malta",MH:"marshall-islands",MR:"mauritania",
  MU:"mauritius",MX:"mexico",FM:"micronesia",MD:"moldova",MC:"monaco",MN:"mongolia",
  ME:"montenegro",MA:"morocco",MZ:"mozambique",MM:"myanmar",NA:"namibia",NR:"nauru",
  NP:"nepal",NL:"netherlands",NZ:"new-zealand",NI:"nicaragua",NE:"niger",NG:"nigeria",
  MK:"north-macedonia",NO:"norway",OM:"oman",PK:"pakistan",PW:"palau",PA:"panama",
  PG:"papua-new-guinea",PY:"paraguay",PE:"peru",PH:"philippines",PL:"poland",PT:"portugal",
  QA:"qatar",RO:"romania",RU:"russia",RW:"rwanda",KN:"saint-kitts-and-nevis",
  LC:"saint-lucia",VC:"saint-vincent-and-the-grenadines",WS:"samoa",SM:"san-marino",
  ST:"sao-tome-and-principe",SA:"saudi-arabia",SN:"senegal",RS:"serbia",SC:"seychelles",
  SL:"sierra-leone",SG:"singapore",SK:"slovakia",SI:"slovenia",SB:"solomon-islands",
  SO:"somalia",ZA:"south-africa",SS:"south-sudan",ES:"spain",LK:"sri-lanka",SD:"sudan",
  SR:"suriname",SE:"sweden",CH:"switzerland",SY:"syria",TW:"taiwan",TJ:"tajikistan",
  TZ:"tanzania",TH:"thailand",TL:"timor-leste",TG:"togo",TO:"tonga",
  TT:"trinidad-and-tobago",TN:"tunisia",TR:"turkey",TM:"turkmenistan",TV:"tuvalu",
  UG:"uganda",UA:"ukraine",AE:"united-arab-emirates",GB:"united-kingdom",US:"united-states",
  UY:"uruguay",UZ:"uzbekistan",VU:"vanuatu",VE:"venezuela",VN:"vietnam",YE:"yemen",
  ZM:"zambia",ZW:"zimbabwe",PS:"palestinian-territories",
};

function extractLevelFromHtml(html: string): string | null {
  // Try specific risk-level banner element first
  const banner = html.match(/<(?:h\d|div|span|p)[^>]*class="[^"]*(?:risk-title|advisory-title|travel-risk|alert-heading)[^"]*"[^>]*>([\s\S]{0,200}?)<\//i);
  if (banner) {
    const bannerText = (banner[1] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    for (const { pattern, rawLevel } of LEVEL_PATTERNS) {
      if (pattern.test(bannerText)) return rawLevel;
    }
  }

  // Find FIRST occurrence by text position — the general country level appears
  // before regional breakdown tables, so earliest match = country-level advisory.
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

  let firstMatch: { index: number; rawLevel: string } | null = null;
  for (const { pattern, rawLevel } of LEVEL_PATTERNS) {
    const m = plain.match(pattern);
    if (m && m.index !== undefined) {
      if (!firstMatch || m.index < firstMatch.index) {
        firstMatch = { index: m.index, rawLevel };
      }
    }
  }
  return firstMatch?.rawLevel ?? null;
}

function extractSummary(html: string, levelText: string): string {
  // Try to find the advisory section specifically
  const section = html.match(/<section[^>]*id="advisory"[^>]*>([\s\S]*?)<\/section>/i)
    ?? html.match(/<div[^>]*class="[^"]*advisory[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const source = section?.[1] ?? html;
  const plain = source
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const idx = plain.toLowerCase().indexOf(levelText.toLowerCase());
  if (idx >= 0) {
    // Include the level text for full sentence context
    let text = plain.slice(idx).trim();
    // Strip leading ALL-CAPS duplicate banner (e.g. "AVOID NON-ESSENTIAL TRAVEL" as a heading)
    text = text.replace(/^[A-Z][A-Z\s\-]{9,59}\s+/, "").trim();
    // Cut off at section headings
    const cutoff = text.search(/\b(On this page|Latest updates|Last updated|Need help\?|Risk level|Disclaimer|Safety and security|Entry and exit|Health|Laws and culture|Natural disasters)/i);
    if (cutoff > 10) text = text.slice(0, cutoff);
    text = text.trim();
    if (text.length > 20) return text.slice(0, 1500);
  }
  // Fallback: return level text
  return levelText;
}

function extractDate(html: string): Date | null {
  const match = html.match(/<time[^>]+datetime="([^"]+)"/i)
    ?? html.match(/(?:Last\s+updated|Date\s+modified)[:\s]*([A-Za-z]+ \d{1,2},\s*\d{4})/i)
    ?? html.match(/(?:Last\s+updated|Date\s+modified)[:\s]*(\d{4}-\d{2}-\d{2})/i)
    ?? html.match(/class="[^"]*(?:date|updated|modified)[^"]*"[^>]*>[\s\S]*?(\d{4}-\d{2}-\d{2})/i)
    ?? html.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const d = new Date(match[1]);
  return isNaN(d.getTime()) ? null : d;
}

async function fetchCountry(iso2: string): Promise<RawAdvisory | null> {
  const slug = ISO2_TO_SLUG[iso2];
  if (!slug) return null;

  const url = `${BASE_HTML}/${slug}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const html = await res.text();
  const rawLevel = extractLevelFromHtml(html);
  if (!rawLevel) return null;

  return {
    destIso2: iso2,
    rawLevel,
    normalizedLevel: normalizeLevel("canada", rawLevel),
    summary: extractSummary(html, rawLevel),
    risks: [],
    officialUpdatedAt: extractDate(html),
    sourceUrl: url,
  };
}

export const canadaScraper: Scraper = async () => {
  const scrapedAt = new Date();
  const advisories: RawAdvisory[] = [];
  const iso2s = Object.keys(ISO2_TO_SLUG);

  for (let i = 0; i < iso2s.length; i += BATCH_SIZE) {
    const batch = iso2s.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchCountry));

    for (const result of results) {
      if (result.status === "fulfilled" && result.value !== null) {
        advisories.push(result.value);
      }
    }

    if (i + BATCH_SIZE < iso2s.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { sourceId: "canada", advisories, scrapedAt };
};
