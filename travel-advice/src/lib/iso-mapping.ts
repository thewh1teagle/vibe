// ISO alpha-2 to alpha-3 mapping (subset — full list for all travel-relevant countries)
export const ISO2_TO_ISO3: Record<string, string> = {
  AF: "AFG", AL: "ALB", DZ: "DZA", AD: "AND", AO: "AGO", AG: "ATG",
  AR: "ARG", AM: "ARM", AU: "AUS", AT: "AUT", AZ: "AZE", BS: "BHS",
  BH: "BHR", BD: "BGD", BB: "BRB", BY: "BLR", BE: "BEL", BZ: "BLZ",
  BJ: "BEN", BT: "BTN", BO: "BOL", BA: "BIH", BW: "BWA", BR: "BRA",
  BN: "BRN", BG: "BGR", BF: "BFA", BI: "BDI", CV: "CPV", KH: "KHM",
  CM: "CMR", CA: "CAN", CF: "CAF", TD: "TCD", CL: "CHL", CN: "CHN",
  CO: "COL", KM: "COM", CG: "COG", CD: "COD", CR: "CRI", CI: "CIV",
  HR: "HRV", CU: "CUB", CY: "CYP", CZ: "CZE", DK: "DNK", DJ: "DJI",
  DM: "DMA", DO: "DOM", EC: "ECU", EG: "EGY", SV: "SLV", GQ: "GNQ",
  ER: "ERI", EE: "EST", SZ: "SWZ", ET: "ETH", FJ: "FJI", FI: "FIN",
  FR: "FRA", GA: "GAB", GM: "GMB", GE: "GEO", DE: "DEU", GH: "GHA",
  GR: "GRC", GD: "GRD", GT: "GTM", GN: "GIN", GW: "GNB", GY: "GUY",
  HT: "HTI", HN: "HND", HU: "HUN", IS: "ISL", IN: "IND", ID: "IDN",
  IR: "IRN", IQ: "IRQ", IE: "IRL", IL: "ISR", IT: "ITA", JM: "JAM",
  JP: "JPN", JO: "JOR", KZ: "KAZ", KE: "KEN", KI: "KIR", KP: "PRK",
  KR: "KOR", KW: "KWT", KG: "KGZ", LA: "LAO", LV: "LVA", LB: "LBN",
  LS: "LSO", LR: "LBR", LY: "LBY", LI: "LIE", LT: "LTU", LU: "LUX",
  MG: "MDG", MW: "MWI", MY: "MYS", MV: "MDV", ML: "MLI", MT: "MLT",
  MH: "MHL", MR: "MRT", MU: "MUS", MX: "MEX", FM: "FSM", MD: "MDA",
  MC: "MCO", MN: "MNG", ME: "MNE", MA: "MAR", MZ: "MOZ", MM: "MMR",
  NA: "NAM", NR: "NRU", NP: "NPL", NL: "NLD", NZ: "NZL", NI: "NIC",
  NE: "NER", NG: "NGA", MK: "MKD", NO: "NOR", OM: "OMN", PK: "PAK",
  PW: "PLW", PA: "PAN", PG: "PNG", PY: "PRY", PE: "PER", PH: "PHL",
  PL: "POL", PT: "PRT", QA: "QAT", RO: "ROU", RU: "RUS", RW: "RWA",
  KN: "KNA", LC: "LCA", VC: "VCT", WS: "WSM", SM: "SMR", ST: "STP",
  SA: "SAU", SN: "SEN", RS: "SRB", SC: "SYC", SL: "SLE", SG: "SGP",
  SK: "SVK", SI: "SVN", SB: "SLB", SO: "SOM", ZA: "ZAF", SS: "SSD",
  ES: "ESP", LK: "LKA", SD: "SDN", SR: "SUR", SE: "SWE", CH: "CHE",
  SY: "SYR", TW: "TWN", TJ: "TJK", TZ: "TZA", TH: "THA", TL: "TLS",
  TG: "TGO", TO: "TON", TT: "TTO", TN: "TUN", TR: "TUR", TM: "TKM",
  TV: "TUV", UG: "UGA", UA: "UKR", AE: "ARE", GB: "GBR", US: "USA",
  UY: "URY", UZ: "UZB", VU: "VUT", VE: "VEN", VN: "VNM", YE: "YEM",
  ZM: "ZMB", ZW: "ZWE", PS: "PSE", XK: "XKX",
};

export const ISO3_TO_ISO2: Record<string, string> = Object.fromEntries(
  Object.entries(ISO2_TO_ISO3).map(([a2, a3]) => [a3, a2])
);

export function toIso3(iso2: string): string | undefined {
  return ISO2_TO_ISO3[iso2.toUpperCase()];
}

export function toIso2(iso3: string): string | undefined {
  return ISO3_TO_ISO2[iso3.toUpperCase()];
}
