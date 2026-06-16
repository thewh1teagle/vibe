import { normalizeLevel } from "@/lib/normalize-risk";
import type { Scraper, RawAdvisory } from "./types";

// Maps Auswärtiges Amt boolean flags to a raw level string
// Falls back to content text analysis when all flags are false
function flagsToRaw(warning: boolean, partialWarning: boolean, situationWarning: boolean, situationPartWarning: boolean, contentHtml?: string): string {
  if (warning) return "Reisewarnung";
  if (partialWarning) return "Teilreisewarnung";
  if (situationPartWarning) return "Von nicht notwendigen Reisen abraten";
  if (situationWarning) return "Erhöhte Vorsicht";

  // Fallback: parse content text for warning phrases the flags may have missed
  if (contentHtml) {
    const text = contentHtml.replace(/<[^>]+>/g, " ").toLowerCase();
    if (/reisewarnung|wird dringend abgeraten|von reisen.*wird abgeraten/.test(text)) return "Reisewarnung";
    if (/teilreisewarnung|teile.*wird abgeraten/.test(text)) return "Teilreisewarnung";
    if (/nicht notwendigen reisen|abraten/.test(text)) return "Von nicht notwendigen Reisen abraten";
    if (/erhöhte vorsicht|besondere vorsicht/.test(text)) return "Erhöhte Vorsicht";
  }

  return "Keine besonderen Sicherheitshinweise";
}

// AA uses ISO alpha-3; we maintain a minimal alpha3→alpha2 lookup built from the API response
// The API returns countryCode (alpha-3); we cross-reference with our DB via destIso2
const ISO3_TO_ISO2: Record<string, string> = {
  AFG: "AF", ALB: "AL", DZA: "DZ", AND: "AD", AGO: "AO", ATG: "AG", ARG: "AR", ARM: "AM",
  AUS: "AU", AUT: "AT", AZE: "AZ", BHS: "BS", BHR: "BH", BGD: "BD", BRB: "BB", BLR: "BY",
  BEL: "BE", BLZ: "BZ", BEN: "BJ", BTN: "BT", BOL: "BO", BIH: "BA", BWA: "BW", BRA: "BR",
  BRN: "BN", BGR: "BG", BFA: "BF", BDI: "BI", CPV: "CV", KHM: "KH", CMR: "CM", CAN: "CA",
  CAF: "CF", TCD: "TD", CHL: "CL", CHN: "CN", COL: "CO", COM: "KM", COD: "CD", COG: "CG",
  CRI: "CR", CIV: "CI", HRV: "HR", CUB: "CU", CYP: "CY", CZE: "CZ", DNK: "DK", DJI: "DJ",
  DMA: "DM", DOM: "DO", ECU: "EC", EGY: "EG", SLV: "SV", GNQ: "GQ", ERI: "ER", EST: "EE",
  SWZ: "SZ", ETH: "ET", FJI: "FJ", FIN: "FI", FRA: "FR", GAB: "GA", GMB: "GM", GEO: "GE",
  DEU: "DE", GHA: "GH", GRC: "GR", GRD: "GD", GTM: "GT", GIN: "GN", GNB: "GW", GUY: "GY",
  HTI: "HT", HND: "HN", HUN: "HU", ISL: "IS", IND: "IN", IDN: "ID", IRN: "IR", IRQ: "IQ",
  IRL: "IE", ISR: "IL", ITA: "IT", JAM: "JM", JPN: "JP", JOR: "JO", KAZ: "KZ", KEN: "KE",
  KIR: "KI", PRK: "KP", KOR: "KR", XKX: "XK", KWT: "KW", KGZ: "KG", LAO: "LA", LVA: "LV",
  LBN: "LB", LSO: "LS", LBR: "LR", LBY: "LY", LIE: "LI", LTU: "LT", LUX: "LU", MDG: "MG",
  MWI: "MW", MYS: "MY", MDV: "MV", MLI: "ML", MLT: "MT", MHL: "MH", MRT: "MR", MUS: "MU",
  MEX: "MX", FSM: "FM", MDA: "MD", MCO: "MC", MNG: "MN", MNE: "ME", MAR: "MA", MOZ: "MZ",
  MMR: "MM", NAM: "NA", NRU: "NR", NPL: "NP", NLD: "NL", NZL: "NZ", NIC: "NI", NER: "NE",
  NGA: "NG", MKD: "MK", NOR: "NO", OMN: "OM", PAK: "PK", PLW: "PW", PAN: "PA", PNG: "PG",
  PRY: "PY", PER: "PE", PHL: "PH", POL: "PL", PRT: "PT", QAT: "QA", ROU: "RO", RUS: "RU",
  RWA: "RW", KNA: "KN", LCA: "LC", VCT: "VC", WSM: "WS", SMR: "SM", STP: "ST", SAU: "SA",
  SEN: "SN", SRB: "RS", SYC: "SC", SLE: "SL", SGP: "SG", SVK: "SK", SVN: "SI", SLB: "SB",
  SOM: "SO", ZAF: "ZA", SSD: "SS", ESP: "ES", LKA: "LK", SDN: "SD", SUR: "SR", SWE: "SE",
  CHE: "CH", SYR: "SY", TWN: "TW", TJK: "TJ", TZA: "TZ", THA: "TH", TLS: "TL", TGO: "TG",
  TON: "TO", TTO: "TT", TUN: "TN", TUR: "TR", TKM: "TM", TUV: "TV", UGA: "UG", UKR: "UA",
  ARE: "AE", GBR: "GB", USA: "US", URY: "UY", UZB: "UZ", VUT: "VU", VEN: "VE", VNM: "VN",
  YEM: "YE", ZMB: "ZM", ZWE: "ZW", PSE: "PS", VAT: "VA",
};

interface AACountry {
  countryCode: string;
  iso3CountryCode?: string;
  countryName?: string;
  warning: boolean;
  partialWarning: boolean;
  situationWarning: boolean;
  situationPartWarning?: boolean;
  content?: { text?: { value?: string } };
  lastModified?: number;
  reportUrl?: string;
}

function buildAaUrl(countryName: string | undefined, iso2: string): string {
  if (countryName) {
    const slug = countryName
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `https://www.auswaertiges-amt.de/de/laenderinformationen/${slug}-node`;
  }
  return `https://www.auswaertiges-amt.de/de/laenderinformationen/${iso2.toLowerCase()}-node`;
}

export const germanyScraper: Scraper = async () => {
  const scrapedAt = new Date();

  try {
    const res = await fetch(
      "https://www.auswaertiges-amt.de/opendata/travelwarning",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as { response: Record<string, AACountry> };
    const countries = Object.values(json.response ?? {});

    const advisories: RawAdvisory[] = [];

    for (const c of countries) {
      const iso2 = c.countryCode?.toUpperCase();
      if (!iso2 || iso2.length !== 2) continue;

      const htmlText = c.content?.text?.value ?? "";
      const rawLevel = flagsToRaw(c.warning, c.partialWarning, c.situationWarning, c.situationPartWarning ?? false, htmlText);
      const normalizedLevel = normalizeLevel("germany", rawLevel);
      const summary = htmlText
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300) || "";

      advisories.push({
        destIso2: iso2,
        rawLevel,
        normalizedLevel,
        summary,
        risks: [],
        officialUpdatedAt: c.lastModified ? new Date(c.lastModified * 1000) : null,
        sourceUrl: c.reportUrl ?? buildAaUrl(c.countryName, iso2),
      });
    }

    return { sourceId: "germany", advisories, scrapedAt };
  } catch (err) {
    return { sourceId: "germany", advisories: [], scrapedAt, error: String(err) };
  }
};
