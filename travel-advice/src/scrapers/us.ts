import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

const LIST_URL = "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html";
const LEVEL_REGEX = /Level\s+(\d+):\s+([^<]+)/i;
const DEST_ISO3_REGEX = /destination\.([a-z]{3})\.html/i;

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

export const usScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    const res = await fetch(LIST_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; travel-comparator/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const advisories: RawAdvisory[] = [];

    // Parse table rows: each row has a country link, level, and date
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1];

      // Extract country link and ISO3 from href
      const linkMatch = row.match(/<a[^>]+href="([^"]*destination\.([a-z]{3})\.html[^"]*)"/i)
        ?? row.match(/<a[^>]+href="([^"]*-travel-advisory\.html[^"]*)"/i);
      if (!linkMatch) continue;

      const href = linkMatch[1];
      const iso3 = linkMatch[2]?.toLowerCase();
      const iso2 = iso3 ? ISO3_TO_ISO2[iso3] : undefined;
      if (!iso2) continue;

      // Extract level
      const levelMatch = row.match(LEVEL_REGEX);
      if (!levelMatch) continue;

      const rawLevel = `Level ${levelMatch[1]}: ${levelMatch[2].trim()}`;
      const normalizedLevel = normalizeLevel("us", rawLevel);

      // Extract date
      const dateMatch = row.match(/(\w+ \d{1,2},\s*\d{4})/);
      const officialUpdatedAt = dateMatch ? new Date(dateMatch[1]) : null;

      // Extract country name for summary
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

    return { sourceId: "us", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "us", advisories: [], scrapedAt, error: String(err) };
  }
};
