import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LIST_URL = "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html";
const COUNTRY_PAGE_BASE = "https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages";
const LEVEL_REGEX = /Level\s+(\d+):\s+([^<]+)/i;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1_500;
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

async function fetchCountryPage(iso2: string): Promise<RawAdvisory | null> {
  const slug = ISO2_TO_SLUG[iso2];
  if (!slug) return null;

  const url = `${COUNTRY_PAGE_BASE}/${slug}.html`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extract level
    const levelMatch = html.match(LEVEL_REGEX);
    if (!levelMatch) return null;

    const rawLevel = `Level ${levelMatch[1]}: ${levelMatch[2].trim()}`;
    const normalizedLevel = normalizeLevel("us", rawLevel);

    // Extract advisory summary text from the page body
    // Look for the first substantive paragraph after the level heading
    let summary = "";
    const summaryPatterns = [
      // Common pattern: paragraph after the travel advisory header
      /<div[^>]*class="[^"]*tsg-rwd-content-page-parsysxxx[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      // Content area with advisory text
      /advisory-text[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
      // Generic: first <p> after "Level \d"
      /Level\s+\d[^<]*<\/[^>]+>\s*(?:<[^>]+>\s*)*<p[^>]*>([\s\S]*?)<\/p>/i,
      // Any early paragraph with real content
      /<p[^>]*>([^<]{60,})<\/p>/i,
    ];

    for (const pat of summaryPatterns) {
      const m = html.match(pat);
      if (m) {
        // Strip HTML tags, collapse whitespace
        const text = m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/\s+/g, " ").trim();
        if (text.length > 30) {
          summary = text.length > 300 ? text.slice(0, 297) + "..." : text;
          break;
        }
      }
    }

    const countryName = slug.replace(/-/g, " ");
    if (!summary) {
      summary = `${countryName}: ${rawLevel}`;
    }

    // Extract date
    const dateMatch = html.match(/(?:Last\s+(?:Updated|Reviewed)|Date)[:\s]*(\w+ \d{1,2},?\s*\d{4})/i)
      ?? html.match(/(\w+ \d{1,2},\s*\d{4})/);
    const officialUpdatedAt = dateMatch ? new Date(dateMatch[1]) : null;

    return {
      destIso2: iso2,
      rawLevel,
      normalizedLevel,
      summary,
      risks: [],
      officialUpdatedAt: officialUpdatedAt && !isNaN(officialUpdatedAt.getTime()) ? officialUpdatedAt : null,
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
    const res = await fetch(LIST_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
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
        const nameMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
        const name = nameMatch?.[1]?.trim().toLowerCase();
        if (name) {
          iso2 = NAME_TO_ISO2[name];
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

      const dateMatch = row.match(/(\w+ \d{1,2},\s*\d{4})/);
      const officialUpdatedAt = dateMatch ? new Date(dateMatch[1]) : null;

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

    // Fallback: fetch individual country pages for any countries not found in the main table
    const foundIso2s = new Set(advisories.map((a) => a.destIso2));
    const fallbackAdvisories = await fetchMissingCountries(foundIso2s);
    advisories.push(...fallbackAdvisories);

    return { sourceId: "us", advisories, scrapedAt };
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
