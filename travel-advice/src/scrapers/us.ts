import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// New URL format: /destination.{iso3lower}.html
const DEST_NEW_REGEX = /destination\.([a-z]{3})\.html/i;
// Old URL format: /{country}-travel-advisory.html (fallback via title)
const LEVEL_REGEX = /Level\s+(\d+):\s+([^.<]+)/i;

// ISO alpha-3 → alpha-2 lookup for US RSS new URL format
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

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}

async function parseRSS(xml: string): Promise<RSSItem[]> {
  const items: RSSItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];
    const get = (tag: string) =>
      block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1]?.trim() ?? "";

    items.push({
      title: get("title"),
      link: get("link"),
      description: get("description"),
      pubDate: get("pubDate"),
    });
  }
  return items;
}

function extractRisks(text: string): string[] {
  const keywords = [
    "terrorism", "crime", "kidnapping", "civil unrest", "health",
    "natural disasters", "demonstrations", "piracy", "political instability",
  ];
  return keywords.filter((k) => text.toLowerCase().includes(k));
}

export const usScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    const res = await fetch(
      "https://travel.state.gov/_res/rss/TAsTWs.xml",
      {
        headers: { "User-Agent": "Mozilla/5.0 travel-comparator/1.0" },
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();
    const items = await parseRSS(xml);

    const advisories: RawAdvisory[] = [];

    for (const item of items) {
      // Try new URL format: destination.{iso3}.html
      const newMatch = item.link.match(DEST_NEW_REGEX);
      let iso2: string | undefined;

      if (newMatch) {
        iso2 = ISO3_TO_ISO2[newMatch[1].toLowerCase()];
      }

      if (!iso2) continue;

      // Extract level from title (e.g. "Venezuela - Level 4: Do Not Travel")
      const levelMatch = (item.title + " " + item.description).match(LEVEL_REGEX);
      const rawLevel = levelMatch
        ? `Level ${levelMatch[1]}: ${levelMatch[2].trim()}`
        : "Level 1: Exercise Normal Precautions";

      const normalizedLevel = normalizeLevel("us", rawLevel);
      const text = item.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const summary = text.slice(0, 300);
      const risks = extractRisks(text);

      advisories.push({
        destIso2: iso2.toUpperCase(),
        rawLevel,
        normalizedLevel,
        summary,
        risks,
        officialUpdatedAt: item.pubDate ? new Date(item.pubDate) : null,
        sourceUrl: item.link.startsWith("http") ? item.link : `https://travel.state.gov${item.link}`,
      });
    }

    return { sourceId: "us", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "us", advisories: [], scrapedAt, error: String(err) };
  }
};
