import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LIST_URL = "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html";
const COUNTRY_PAGE_BASE = "https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages";
const LEVEL_REGEX = /Level\s+(\d+):\s+([^<]+)/i;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1_500;

const PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
];

async function fetchWithProxyFallback(url: string, timeoutMs = 15_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 100) return text;
    }
  } catch { /* fall through */ }
  for (const buildProxyUrl of PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(url), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 100) return text;
    } catch { /* try next */ }
  }
  return null;
}
const ISO3_TO_ISO2: Record<string, string> = {
  afg:"AF",alb:"AL",dza:"DZ",and:"AD",ago:"AO",atg:"AG",arg:"AR",arm:"AM",
  aus:"AU",aut:"AT",aze:"AZ",bhs:"BS",bhr:"BH",bgd:"BD",brb:"BB",blr:"BY",
  bel:"BE",blz:"BZ",ben:"BJ",btn:"BT",bol:"BO",bih:"BA",bwa:"BW",bra:"BR",
  brn:"BN",bgr:"BG",bfa:"BF",bdi:"BI",cpv:"CV",khm:"KH",cmr:"CM",can:"CA",
  caf:"CF",tcd:"TD",chl:"CL",chn:"CN",col:"CO",com:"KM",cod:"CD",cog:"CG",
  cri:"CR",civ:"CI",hrv:"HR",cub:"CU",cyp:"CY",cze:"CZ",dnk:"DK",dji:"DJ",
  dma:"DM",dom:"DO",ecu:"EC",egy:"EG",slv:"SV",gnq:"GQ",eri:"ER",est:"EE",
  swz:"SZ",eth:"ET",fji:"FJ",fin:"FI",fra:"FR",gab:"GA",gmb:"GM",geo:"GE",
  deu:"DE",gha:"GH",grc:"GR",grd:"GD",gtm:"GT",gin:"GN",gnb:"GW",guy:"GY",
  hti:"HT",hnd:"HN",hun:"HU",isl:"IS",ind:"IN",idn:"ID",irn:"IR",irq:"IQ",
  irl:"IE",isr:"IL",ita:"IT",jam:"JM",jpn:"JP",jor:"JO",kaz:"KZ",ken:"KE",
  kir:"KI",prk:"KP",kor:"KR",xkx:"XK",kwt:"KW",kgz:"KG",lao:"LA",lva:"LV",
  lbn:"LB",lso:"LS",lbr:"LR",lby:"LY",lie:"LI",ltu:"LT",lux:"LU",mdg:"MG",
  mwi:"MW",mys:"MY",mdv:"MV",mli:"ML",mlt:"MT",mhl:"MH",mrt:"MR",mus:"MU",
  mex:"MX",fsm:"FM",mda:"MD",mco:"MC",mng:"MN",mne:"ME",mar:"MA",moz:"MZ",
  mmr:"MM",nam:"NA",nru:"NR",npl:"NP",nld:"NL",nzl:"NZ",nic:"NI",ner:"NE",
  nga:"NG",mkd:"MK",nor:"NO",omn:"OM",pak:"PK",plw:"PW",pan:"PA",png:"PG",
  pry:"PY",per:"PE",phl:"PH",pol:"PL",prt:"PT",qat:"QA",rou:"RO",rus:"RU",
  rwa:"RW",kna:"KN",lca:"LC",vct:"VC",wsm:"WS",smr:"SM",stp:"ST",sau:"SA",
  sen:"SN",srb:"RS",syc:"SC",sle:"SL",sgp:"SG",svk:"SK",svn:"SI",slb:"SB",
  som:"SO",zaf:"ZA",ssd:"SS",esp:"ES",lka:"LK",sdn:"SD",sur:"SR",swe:"SE",
  che:"CH",syr:"SY",twn:"TW",tjk:"TJ",tza:"TZ",tha:"TH",tls:"TL",tgo:"TG",
  ton:"TO",tto:"TT",tun:"TN",tur:"TR",tkm:"TM",tuv:"TV",uga:"UG",ukr:"UA",
  are:"AE",gbr:"GB",usa:"US",ury:"UY",uzb:"UZ",vut:"VU",ven:"VE",vnm:"VN",
  yem:"YE",zmb:"ZM",zwe:"ZW",pse:"PS",vat:"VA",
};

/** Map ISO2 codes back to URL-friendly country names for the State Dept site. */
const ISO2_TO_SLUG: Record<string, string> = {
  AF:"Afghanistan",AL:"Albania",DZ:"Algeria",AD:"Andorra",AO:"Angola",AG:"Antigua-and-Barbuda",
  AR:"Argentina",AM:"Armenia",AU:"Australia",AT:"Austria",AZ:"Azerbaijan",BS:"The-Bahamas",
  BH:"Bahrain",BD:"Bangladesh",BB:"Barbados",BY:"Belarus",BE:"Belgium",BZ:"Belize",
  BJ:"Benin",BT:"Bhutan",BO:"Bolivia",BA:"Bosnia-and-Herzegovina",BW:"Botswana",BR:"Brazil",
  BN:"Brunei",BG:"Bulgaria",BF:"Burkina-Faso",BI:"Burundi",CV:"Cabo-Verde",KH:"Cambodia",
  CM:"Cameroon",CA:"Canada",CF:"Central-African-Republic",TD:"Chad",CL:"Chile",CN:"China",
  CO:"Colombia",KM:"Comoros",CD:"Democratic-Republic-of-the-Congo",CG:"Republic-of-the-Congo",
  CR:"Costa-Rica",CI:"Cote-dIvoire",HR:"Croatia",CU:"Cuba",CY:"Cyprus",CZ:"Czech-Republic",
  DK:"Denmark",DJ:"Djibouti",DM:"Dominica",DO:"Dominican-Republic",EC:"Ecuador",EG:"Egypt",
  SV:"El-Salvador",GQ:"Equatorial-Guinea",ER:"Eritrea",EE:"Estonia",SZ:"Eswatini",ET:"Ethiopia",
  FJ:"Fiji",FI:"Finland",FR:"France",GA:"Gabon",GM:"The-Gambia",GE:"Georgia",DE:"Germany",
  GH:"Ghana",GR:"Greece",GD:"Grenada",GT:"Guatemala",GN:"Guinea",GW:"Guinea-Bissau",GY:"Guyana",
  HT:"Haiti",HN:"Honduras",HU:"Hungary",IS:"Iceland",IN:"India",ID:"Indonesia",IR:"Iran",
  IQ:"Iraq",IE:"Ireland",IL:"Israel-the-West-Bank-and-Gaza",IT:"Italy",JM:"Jamaica",JP:"Japan",
  JO:"Jordan",KZ:"Kazakhstan",KE:"Kenya",KI:"Kiribati",KP:"North-Korea",KR:"South-Korea",
  XK:"Kosovo",KW:"Kuwait",KG:"Kyrgyzstan",LA:"Laos",LV:"Latvia",LB:"Lebanon",LS:"Lesotho",
  LR:"Liberia",LY:"Libya",LI:"Liechtenstein",LT:"Lithuania",LU:"Luxembourg",MG:"Madagascar",
  MW:"Malawi",MY:"Malaysia",MV:"Maldives",ML:"Mali",MT:"Malta",MH:"Marshall-Islands",
  MR:"Mauritania",MU:"Mauritius",MX:"Mexico",FM:"Micronesia",MD:"Moldova",MC:"Monaco",
  MN:"Mongolia",ME:"Montenegro",MA:"Morocco",MZ:"Mozambique",MM:"Burma-Myanmar",NA:"Namibia",
  NR:"Nauru",NP:"Nepal",NL:"Netherlands",NZ:"New-Zealand",NI:"Nicaragua",NE:"Niger",NG:"Nigeria",
  MK:"North-Macedonia",NO:"Norway",OM:"Oman",PK:"Pakistan",PW:"Palau",PS:"Palestinian-Territories",
  PA:"Panama",PG:"Papua-New-Guinea",PY:"Paraguay",PE:"Peru",PH:"Philippines",PL:"Poland",
  PT:"Portugal",QA:"Qatar",RO:"Romania",RU:"Russia",RW:"Rwanda",KN:"Saint-Kitts-and-Nevis",
  LC:"Saint-Lucia",VC:"Saint-Vincent-and-the-Grenadines",WS:"Samoa",SM:"San-Marino",
  ST:"Sao-Tome-and-Principe",SA:"Saudi-Arabia",SN:"Senegal",RS:"Serbia",SC:"Seychelles",
  SL:"Sierra-Leone",SG:"Singapore",SK:"Slovakia",SI:"Slovenia",SB:"Solomon-Islands",SO:"Somalia",
  ZA:"South-Africa",SS:"South-Sudan",ES:"Spain",LK:"Sri-Lanka",SD:"Sudan",SR:"Suriname",
  SE:"Sweden",CH:"Switzerland",SY:"Syria",TW:"Taiwan",TJ:"Tajikistan",TZ:"Tanzania",TH:"Thailand",
  TL:"Timor-Leste",TG:"Togo",TO:"Tonga",TT:"Trinidad-and-Tobago",TN:"Tunisia",TR:"Turkey",
  TM:"Turkmenistan",TV:"Tuvalu",UG:"Uganda",UA:"Ukraine",AE:"United-Arab-Emirates",GB:"United-Kingdom",
  US:"United-States",UY:"Uruguay",UZ:"Uzbekistan",VU:"Vanuatu",VA:"Vatican-City",VE:"Venezuela",
  VN:"Vietnam",YE:"Yemen",ZM:"Zambia",ZW:"Zimbabwe",
};

function extractSummaryAndDateFromAdvisoryHtml(html: string): { summary: string; officialUpdatedAt: Date | null } {
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  let summary = "";

  // Strategy 1: Find paragraphs that come after the Level heading in the HTML
  const levelPos = cleanHtml.search(/Level\s+\d/i);
  if (levelPos >= 0) {
    const afterLevel = cleanHtml.slice(levelPos);
    const paragraphs = afterLevel.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const p of paragraphs) {
      const text = p[1].replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
      if (
        text.length > 40 &&
        !/^\s*(Share|Print|RSS|Follow|Subscribe|Last Updated|Updated:|Do Not Travel|Exercise)/i.test(text) &&
        !/^\s*Level\s+\d/i.test(text)
      ) {
        summary = text.slice(0, 300);
        break;
      }
    }
  }

  // Strategy 2: any substantive paragraph
  if (!summary) {
    const paragraphs = cleanHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const p of paragraphs) {
      const text = p[1].replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
      if (
        text.length > 60 &&
        !/^\s*(Share|Print|RSS|Follow|Subscribe)/i.test(text) &&
        !/^\s*Level\s+\d/i.test(text)
      ) {
        summary = text.slice(0, 300);
        break;
      }
    }
  }

  // Extract date from individual advisory page
  const dateMatch =
    html.match(/<span[^>]*class="[^"]*last-updated[^"]*"[^>]*>[\s\S]*?(\w+ \d{1,2},\s*\d{4})/i) ??
    html.match(/<p[^>]*class="[^"]*last-updated[^"]*"[^>]*>[\s\S]*?(\w+ \d{1,2},\s*\d{4})/i) ??
    html.match(/Last\s+Updated:\s*(\w+ \d{1,2},?\s*\d{4})/i) ??
    html.match(/Updated:\s*(\w+ \d{1,2},?\s*\d{4})/i) ??
    html.match(/<meta[^>]+(?:date|modified)[^>]*content="([^"]+)"/i) ??
    html.match(/class="[^"]*date[^"]*"[^>]*>(\w+ \d{1,2},?\s*\d{4})/i);
  let officialUpdatedAt: Date | null = null;
  if (dateMatch) {
    const d = new Date(dateMatch[1]);
    if (!isNaN(d.getTime())) officialUpdatedAt = d;
  }

  return { summary, officialUpdatedAt };
}

async function fetchCountryPage(iso2: string): Promise<RawAdvisory | null> {
  const slug = ISO2_TO_SLUG[iso2];
  if (!slug) return null;

  const countryUrl = `${COUNTRY_PAGE_BASE}/${slug}.html`;
  const advisorySlug = slug.toLowerCase().replace(/\s+/g, "-");
  const advisoryUrl = `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${advisorySlug}-travel-advisory.html`;
  const newFormatUrl = `https://travel.state.gov/en/international-travel/travel-advisories/${advisorySlug}.html`;
  const urls = [newFormatUrl, advisoryUrl, countryUrl];

  try {
    let html = "";
    let url = countryUrl;
    for (const tryUrl of urls) {
      try {
        const text = await fetchWithProxyFallback(tryUrl, 15_000);
        if (text && LEVEL_REGEX.test(text)) {
          html = text;
          url = tryUrl;
          break;
        }
      } catch { /* try next */ }
    }
    if (!html) return null;

    // Extract level
    const levelMatch = html.match(LEVEL_REGEX);
    if (!levelMatch) return null;

    const rawLevel = `Level ${levelMatch[1]}: ${levelMatch[2].trim()}`;
    const normalizedLevel = normalizeLevel("us", rawLevel);

    let summary = "";
    // Extract the main advisory paragraph - the text explaining WHY this level
    const cleanHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "");

    // Find text after the level heading — this usually explains the reason
    const afterLevel = cleanHtml.match(/Level\s+\d[^<]*(?:<\/[^>]+>[\s\S]{0,200}?)?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (afterLevel) {
      const text = afterLevel[1].replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
      if (text.length > 30) summary = text.slice(0, 300);
    }
    if (!summary) {
      // Find any substantive paragraph
      const paragraphs = cleanHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      for (const p of paragraphs) {
        const text = p[1].replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
        if (text.length > 50 && !/^\s*(Share|Print|RSS|Follow|Subscribe)/i.test(text)) {
          summary = text.slice(0, 300);
          break;
        }
      }
    }
    if (!summary) {
      summary = `${rawLevel}`;
    }

    // Extract date — only from structured metadata, not arbitrary page text
    const dateMatch = html.match(/(?:Last\s+(?:Updated|Reviewed)|Date)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i)
      ?? html.match(/<meta[^>]+(?:date|modified)[^>]*content="([^"]+)"/i)
      ?? html.match(/class="[^"]*date[^"]*"[^>]*>(\w+ \d{1,2},?\s*\d{4})/i);
    const officialUpdatedAt = dateMatch ? new Date(dateMatch[1]) : null;

    return {
      destIso2: iso2,
      rawLevel,
      normalizedLevel,
      summary,
      risks: [],
      officialUpdatedAt,
      sourceUrl: url,
    };
  } catch {
    return null;
  }
}

async function fetchMissingCountries(
  foundIso2s: Set<string>,
): Promise<RawAdvisory[]> {
  const allIso2s = new Set(Object.values(ISO3_TO_ISO2));
  const missing = Array.from(allIso2s).filter((c) => !foundIso2s.has(c));
  if (missing.length === 0) return [];

  const results: RawAdvisory[] = [];

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((iso2) => fetchCountryPage(iso2)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
      }
    }
    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < missing.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

export const usScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    const html = await fetchWithProxyFallback(LIST_URL, 30_000);
    if (!html) throw new Error("Failed to fetch main advisory list");
    const advisories: RawAdvisory[] = [];

    const NAME_TO_ISO2: Record<string, string> = {
      "united arab emirates":"AE","saudi arabia":"SA","israel, the west bank and gaza":"IL",
      "south korea":"KR","north korea":"KP","czech republic":"CZ","ivory coast":"CI",
      "cote d'ivoire":"CI","eswatini":"SZ","timor-leste":"TL","cabo verde":"CV",
      "the bahamas":"BS","the gambia":"GM","trinidad and tobago":"TT",
      "antigua and barbuda":"AG","saint kitts and nevis":"KN","saint lucia":"LC",
      "saint vincent and the grenadines":"VC","bosnia and herzegovina":"BA",
      "north macedonia":"MK","papua new guinea":"PG","solomon islands":"SB",
      "marshall islands":"MH","sao tome and principe":"ST","equatorial guinea":"GQ",
      "central african republic":"CF","democratic republic of the congo":"CD",
      "republic of the congo":"CG","south sudan":"SS","sierra leone":"SL",
      "guinea-bissau":"GW","burkina faso":"BF","new zealand":"NZ",
      "south africa":"ZA","sri lanka":"LK","costa rica":"CR","el salvador":"SV",
      "dominican republic":"DO",
    };

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1];

      const linkMatch = row.match(/<a[^>]+href="([^"]*)"/i);
      if (!linkMatch) continue;

      const href = linkMatch[1];
      const iso3Match = href.match(/destination\.([a-z]{3})\.html/i);
      let iso2: string | undefined;
      if (iso3Match) {
        iso2 = ISO3_TO_ISO2[iso3Match[1].toLowerCase()];
      }

      if (!iso2) {
        // Try matching from new-format advisory URL: /travel-advisories/bahrain.html
        const newMatch = href.match(/travel-advisories\/([a-z][a-z0-9-]+)\.html/i);
        if (newMatch) {
          const urlSlug = newMatch[1].toLowerCase();
          const bySlug = Object.entries(ISO2_TO_SLUG).find(([, s]) => s.toLowerCase() === urlSlug);
          if (bySlug) iso2 = bySlug[0];
        }
      }
      if (!iso2) {
        const nameMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
        const name = nameMatch?.[1]?.trim().toLowerCase();
        if (name) {
          iso2 = NAME_TO_ISO2[name];
          if (!iso2) {
            // Try direct match against ISO2_TO_SLUG values
            const bySlugName = Object.entries(ISO2_TO_SLUG).find(([, s]) =>
              s.toLowerCase().replace(/-/g, " ") === name || s.toLowerCase() === name
            );
            if (bySlugName) iso2 = bySlugName[0];
          }
          if (!iso2) {
            const simple = Object.entries(ISO3_TO_ISO2).find(([, v]) =>
              name === v.toLowerCase() || name.replace(/[^a-z]/g, "") === v.toLowerCase()
            );
            if (simple) iso2 = simple[1];
          }
        }
      }
      if (!iso2) continue;

      const levelMatch = row.match(LEVEL_REGEX);
      if (!levelMatch) continue;

      const rawLevel = `Level ${levelMatch[1]}: ${levelMatch[2].trim()}`;
      const normalizedLevel = normalizeLevel("us", rawLevel);

      // Extract date from the row's date cell, not from link text or country names
      const dateCellMatch = row.match(/<td[^>]*>(?:<[^>]*>)*\s*(\w+ \d{1,2},\s*\d{4})\s*(?:<[^>]*>)*<\/td>/i)
        ?? row.match(/(?:Updated|Date)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i);
      const officialUpdatedAt = dateCellMatch ? new Date(dateCellMatch[1]) : null;

      const nameMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
      const countryName = nameMatch?.[1]?.trim() ?? "";

      const sourceUrl = href.startsWith("http") ? href : `https://travel.state.gov${href}`;

      advisories.push({
        destIso2: iso2,
        rawLevel,
        normalizedLevel,
        summary: `${countryName}: ${rawLevel}`,
        risks: [],
        officialUpdatedAt: officialUpdatedAt && !isNaN(officialUpdatedAt.getTime()) ? officialUpdatedAt : null,
        sourceUrl,
      });
    }

    // Enrich list-page advisories with summaries and dates from individual advisory pages
    const enriched: RawAdvisory[] = [];
    for (let i = 0; i < advisories.length; i += BATCH_SIZE) {
      const batch = advisories.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map(async (advisory) => {
          const slug = ISO2_TO_SLUG[advisory.destIso2];
          if (!slug) return advisory;
          const advisorySlug = slug.toLowerCase().replace(/\s+/g, "-");
          const advisoryPageUrl = `https://travel.state.gov/en/international-travel/travel-advisories/${advisorySlug}.html`;
          try {
            const pageHtml = await fetchWithProxyFallback(advisoryPageUrl, 12_000);
            if (pageHtml) {
              const { summary, officialUpdatedAt } = extractSummaryAndDateFromAdvisoryHtml(pageHtml);
              return {
                ...advisory,
                summary: summary || advisory.summary,
                officialUpdatedAt: officialUpdatedAt ?? advisory.officialUpdatedAt,
                sourceUrl: advisoryPageUrl,
              };
            }
          } catch { /* keep original */ }
          return advisory;
        })
      );
      for (const r of settled) {
        enriched.push(r.status === "fulfilled" ? r.value : batch[settled.indexOf(r)]);
      }
      if (i + BATCH_SIZE < advisories.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Fallback: fetch individual country pages for any countries not found in the main table
    const foundIso2s = new Set(enriched.map((a) => a.destIso2));
    const fallbackAdvisories = await fetchMissingCountries(foundIso2s);
    enriched.push(...fallbackAdvisories);

    return { sourceId: "us", advisories: enriched, scrapedAt };
  } catch (err) {
    // If the main table fetch fails entirely, try fetching all countries individually
    try {
      const fallbackAdvisories = await fetchMissingCountries(new Set());
      if (fallbackAdvisories.length > 0) {
        return { sourceId: "us", advisories: fallbackAdvisories, scrapedAt };
      }
    } catch { /* ignore fallback errors */ }
    return { sourceId: "us", advisories: [], scrapedAt, error: String(err) };
  }
};
