"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

const PROXIES = [
  (url: string) => `https://jolly-queen-1584.nederlander.workers.dev/?${url}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
];

async function fetchViaProxy(url: string): Promise<string | null> {
  for (const build of PROXIES) {
    try {
      const proxyUrl = build(url);
      const res = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(15_000),
        headers: { "Accept": "text/html,application/xhtml+xml,*/*" },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 200) return text;
    } catch { /* next */ }
  }
  return null;
}

type Level = "green" | "yellow" | "orange" | "red";

interface AdvisoryResult {
  rawLevel: string;
  labelNl: string;
  level: Level;
  summary: string;
  url: string;
}

const BADGE: Record<Level, { label: string; color: string }> = {
  green:  { label: "Groen",  color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  yellow: { label: "Geel",   color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  orange: { label: "Oranje", color: "bg-orange-100 text-orange-800 border-orange-300" },
  red:    { label: "Rood",   color: "bg-red-100 text-red-800 border-red-300" },
};

// ── Source configs ──

interface SourceConfig {
  flag: string;
  nameNl: string;
  getUrl: (iso2: string) => string | null;
  extract: (body: string) => { rawLevel: string; labelNl: string; level: Level; summary: string } | null;
}

// ── UK ──
const UK_SLUGS: Record<string, string> = {
  AF:"afghanistan",AL:"albania",DZ:"algeria",AO:"angola",AR:"argentina",AM:"armenia",AT:"austria",
  AZ:"azerbaijan",BH:"bahrain",BD:"bangladesh",BB:"barbados",BY:"belarus",BE:"belgium",BZ:"belize",
  BJ:"benin",BT:"bhutan",BO:"bolivia",BA:"bosnia-and-herzegovina",BW:"botswana",BR:"brazil",
  BN:"brunei",BG:"bulgaria",BF:"burkina-faso",BI:"burundi",CV:"cabo-verde",KH:"cambodia",
  CM:"cameroon",CA:"canada",CF:"central-african-republic",TD:"chad",CL:"chile",CN:"china",
  CO:"colombia",KM:"comoros",CD:"democratic-republic-of-the-congo",CG:"congo",CR:"costa-rica",
  CI:"cote-divoire",HR:"croatia",CU:"cuba",CY:"cyprus",CZ:"czech-republic",DK:"denmark",
  DJ:"djibouti",DM:"dominica",DO:"dominican-republic",EC:"ecuador",EG:"egypt",SV:"el-salvador",
  GQ:"equatorial-guinea",ER:"eritrea",EE:"estonia",SZ:"eswatini",ET:"ethiopia",FJ:"fiji",
  FI:"finland",FR:"france",GA:"gabon",GM:"the-gambia",GE:"georgia",DE:"germany",GH:"ghana",
  GR:"greece",GD:"grenada",GT:"guatemala",GN:"guinea",GW:"guinea-bissau",GY:"guyana",HT:"haiti",
  HN:"honduras",HU:"hungary",IS:"iceland",IN:"india",ID:"indonesia",IR:"iran",IQ:"iraq",
  IE:"ireland",IL:"israel",IT:"italy",JM:"jamaica",JP:"japan",JO:"jordan",KZ:"kazakhstan",
  KE:"kenya",KP:"north-korea",KR:"south-korea",XK:"kosovo",KW:"kuwait",KG:"kyrgyzstan",LA:"laos",
  LV:"latvia",LB:"lebanon",LS:"lesotho",LR:"liberia",LY:"libya",LT:"lithuania",LU:"luxembourg",
  MG:"madagascar",MW:"malawi",MY:"malaysia",MV:"maldives",ML:"mali",MT:"malta",MR:"mauritania",
  MU:"mauritius",MX:"mexico",MD:"moldova",MN:"mongolia",ME:"montenegro",MA:"morocco",
  MZ:"mozambique",MM:"myanmar",NA:"namibia",NP:"nepal",NL:"netherlands",NZ:"new-zealand",
  NI:"nicaragua",NE:"niger",NG:"nigeria",MK:"north-macedonia",NO:"norway",OM:"oman",PK:"pakistan",
  PA:"panama",PG:"papua-new-guinea",PY:"paraguay",PE:"peru",PH:"philippines",PL:"poland",
  PT:"portugal",QA:"qatar",RO:"romania",RU:"russia",RW:"rwanda",SA:"saudi-arabia",SN:"senegal",
  RS:"serbia",SC:"seychelles",SL:"sierra-leone",SG:"singapore",SK:"slovakia",SI:"slovenia",
  SB:"solomon-islands",SO:"somalia",ZA:"south-africa",SS:"south-sudan",ES:"spain",LK:"sri-lanka",
  SD:"sudan",SR:"suriname",SE:"sweden",CH:"switzerland",SY:"syria",TW:"taiwan",TJ:"tajikistan",
  TZ:"tanzania",TH:"thailand",TL:"timor-leste",TG:"togo",TO:"tonga",TT:"trinidad-and-tobago",
  TN:"tunisia",TR:"turkey",TM:"turkmenistan",UG:"uganda",UA:"ukraine",AE:"united-arab-emirates",
  US:"usa",UY:"uruguay",UZ:"uzbekistan",VU:"vanuatu",VE:"venezuela",VN:"vietnam",YE:"yemen",
  ZM:"zambia",ZW:"zimbabwe",
};

function extractUk(body: string): AdvisoryResult["level"] | null {
  try {
    const data = JSON.parse(body);
    const statuses: string[] = data?.details?.alert_status ?? [];
    const LEVEL_MAP: Record<string, Level> = {
      "avoid_all_travel": "red",
      "avoid_all_travel_to_whole_country": "red",
      "avoid_all_travel_to_parts": "orange",
      "avoid_all_travel_to_parts_of_country": "orange",
      "avoid_all_but_essential_travel": "orange",
      "avoid_all_but_essential_travel_to_whole_country": "orange",
      "avoid_all_but_essential_travel_to_parts": "yellow",
      "avoid_all_but_essential_travel_to_parts_of_country": "yellow",
    };
    const SEVERITY: Record<Level, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
    let worst: Level = "green";
    for (const s of statuses) {
      const l = LEVEL_MAP[s];
      if (l && SEVERITY[l] > SEVERITY[worst]) worst = l;
    }
    return worst;
  } catch { return null; }
}

const UK_LEVEL_NL: Record<Level, { raw: string; nl: string }> = {
  green:  { raw: "No advice against travel", nl: "Geen negatief reisadvies" },
  yellow: { raw: "Advise against all but essential travel to parts", nl: "Alleen noodzakelijke reizen (delen)" },
  orange: { raw: "Advise against all but essential travel", nl: "Alleen noodzakelijke reizen" },
  red:    { raw: "Advise against all travel", nl: "Niet reizen" },
};

// ── US ──
const US_SLUGS: Record<string, string> = {
  AF:"Afghanistan",AL:"Albania",DZ:"Algeria",AD:"Andorra",AO:"Angola",AG:"Antigua-and-Barbuda",
  AR:"Argentina",AM:"Armenia",AU:"Australia",AT:"Austria",AZ:"Azerbaijan",BS:"The-Bahamas",
  BH:"Bahrain",BD:"Bangladesh",BB:"Barbados",BY:"Belarus",BE:"Belgium",BZ:"Belize",BJ:"Benin",
  BT:"Bhutan",BO:"Bolivia",BA:"Bosnia-and-Herzegovina",BW:"Botswana",BR:"Brazil",BN:"Brunei",
  BG:"Bulgaria",BF:"Burkina-Faso",BI:"Burundi",CV:"Cabo-Verde",KH:"Cambodia",CM:"Cameroon",
  CA:"Canada",CF:"Central-African-Republic",TD:"Chad",CL:"Chile",CN:"China",CO:"Colombia",
  CD:"Democratic-Republic-of-the-Congo",CG:"Republic-of-the-Congo",CR:"Costa-Rica",CI:"Cote-dIvoire",
  HR:"Croatia",CU:"Cuba",CY:"Cyprus",CZ:"Czech-Republic",DK:"Denmark",DJ:"Djibouti",DM:"Dominica",
  DO:"Dominican-Republic",EC:"Ecuador",EG:"Egypt",SV:"El-Salvador",GQ:"Equatorial-Guinea",
  ER:"Eritrea",EE:"Estonia",SZ:"Eswatini",ET:"Ethiopia",FJ:"Fiji",FI:"Finland",FR:"France",
  GA:"Gabon",GM:"The-Gambia",GE:"Georgia",DE:"Germany",GH:"Ghana",GR:"Greece",GD:"Grenada",
  GT:"Guatemala",GN:"Guinea",GW:"Guinea-Bissau",GY:"Guyana",HT:"Haiti",HN:"Honduras",HU:"Hungary",
  IS:"Iceland",IN:"India",ID:"Indonesia",IR:"Iran",IQ:"Iraq",IE:"Ireland",
  IL:"Israel-the-West-Bank-and-Gaza",IT:"Italy",JM:"Jamaica",JP:"Japan",JO:"Jordan",
  KZ:"Kazakhstan",KE:"Kenya",KP:"North-Korea",KR:"South-Korea",XK:"Kosovo",KW:"Kuwait",
  KG:"Kyrgyzstan",LA:"Laos",LV:"Latvia",LB:"Lebanon",LS:"Lesotho",LR:"Liberia",LY:"Libya",
  LT:"Lithuania",LU:"Luxembourg",MG:"Madagascar",MW:"Malawi",MY:"Malaysia",MV:"Maldives",
  ML:"Mali",MT:"Malta",MR:"Mauritania",MU:"Mauritius",MX:"Mexico",MD:"Moldova",MN:"Mongolia",
  ME:"Montenegro",MA:"Morocco",MZ:"Mozambique",MM:"Burma-Myanmar",NA:"Namibia",NP:"Nepal",
  NL:"Netherlands",NZ:"New-Zealand",NI:"Nicaragua",NE:"Niger",NG:"Nigeria",MK:"North-Macedonia",
  NO:"Norway",OM:"Oman",PK:"Pakistan",PA:"Panama",PG:"Papua-New-Guinea",PY:"Paraguay",PE:"Peru",
  PH:"Philippines",PL:"Poland",PT:"Portugal",QA:"Qatar",RO:"Romania",RU:"Russia",RW:"Rwanda",
  SA:"Saudi-Arabia",SN:"Senegal",RS:"Serbia",SC:"Seychelles",SL:"Sierra-Leone",SG:"Singapore",
  SK:"Slovakia",SI:"Slovenia",SB:"Solomon-Islands",SO:"Somalia",ZA:"South-Africa",SS:"South-Sudan",
  ES:"Spain",LK:"Sri-Lanka",SD:"Sudan",SR:"Suriname",SE:"Sweden",CH:"Switzerland",SY:"Syria",
  TW:"Taiwan",TJ:"Tajikistan",TZ:"Tanzania",TH:"Thailand",TL:"Timor-Leste",TG:"Togo",TO:"Tonga",
  TT:"Trinidad-and-Tobago",TN:"Tunisia",TR:"Turkey",TM:"Turkmenistan",UG:"Uganda",UA:"Ukraine",
  AE:"United-Arab-Emirates",GB:"United-Kingdom",UY:"Uruguay",UZ:"Uzbekistan",VU:"Vanuatu",
  VE:"Venezuela",VN:"Vietnam",YE:"Yemen",ZM:"Zambia",ZW:"Zimbabwe",
};

const US_LEVELS: Record<string, { level: Level; nl: string }> = {
  "1": { level: "green",  nl: "Normale voorzorgsmaatregelen" },
  "2": { level: "yellow", nl: "Verhoogde voorzichtigheid" },
  "3": { level: "orange", nl: "Reis heroverwegen" },
  "4": { level: "red",    nl: "Niet reizen" },
};

// ── Australia ──
const AU_SLUGS: Record<string, string> = {
  AF:"asia/afghanistan",AL:"europe/albania",DZ:"africa/algeria",AO:"africa/angola",
  AR:"americas/argentina",AM:"europe/armenia",AT:"europe/austria",AZ:"europe/azerbaijan",
  BH:"middle-east/bahrain",BD:"asia/bangladesh",BB:"americas/barbados",BY:"europe/belarus",
  BE:"europe/belgium",BZ:"americas/belize",BJ:"africa/benin",BT:"asia/bhutan",
  BO:"americas/bolivia",BA:"europe/bosnia-and-herzegovina",BW:"africa/botswana",BR:"americas/brazil",
  BN:"asia/brunei",BG:"europe/bulgaria",BF:"africa/burkina-faso",BI:"africa/burundi",
  CV:"africa/cabo-verde",KH:"asia/cambodia",CM:"africa/cameroon",CA:"americas/canada",
  CF:"africa/central-african-republic",TD:"africa/chad",CL:"americas/chile",CN:"asia/china",
  CO:"americas/colombia",CD:"africa/democratic-republic-of-the-congo",CR:"americas/costa-rica",
  CI:"africa/cote-divoire",HR:"europe/croatia",CU:"americas/cuba",CY:"europe/cyprus",
  CZ:"europe/czech-republic",DK:"europe/denmark",DJ:"africa/djibouti",DO:"americas/dominican-republic",
  EC:"americas/ecuador",EG:"middle-east/egypt",SV:"americas/el-salvador",ER:"africa/eritrea",
  EE:"europe/estonia",ET:"africa/ethiopia",FJ:"pacific/fiji",FI:"europe/finland",FR:"europe/france",
  GA:"africa/gabon",GM:"africa/gambia",GE:"europe/georgia",DE:"europe/germany",GH:"africa/ghana",
  GR:"europe/greece",GT:"americas/guatemala",GN:"africa/guinea",GW:"africa/guinea-bissau",
  GY:"americas/guyana",HT:"americas/haiti",HN:"americas/honduras",HU:"europe/hungary",
  IS:"europe/iceland",IN:"asia/india",ID:"asia/indonesia",IR:"middle-east/iran",IQ:"middle-east/iraq",
  IE:"europe/ireland",IL:"middle-east/israel",IT:"europe/italy",JM:"americas/jamaica",JP:"asia/japan",
  JO:"middle-east/jordan",KZ:"asia/kazakhstan",KE:"africa/kenya",KP:"asia/north-korea",
  KR:"asia/south-korea",XK:"europe/kosovo",KW:"middle-east/kuwait",KG:"asia/kyrgyzstan",
  LA:"asia/laos",LV:"europe/latvia",LB:"middle-east/lebanon",LS:"africa/lesotho",LR:"africa/liberia",
  LY:"middle-east/libya",LT:"europe/lithuania",LU:"europe/luxembourg",MG:"africa/madagascar",
  MW:"africa/malawi",MY:"asia/malaysia",MV:"asia/maldives",ML:"africa/mali",MT:"europe/malta",
  MR:"africa/mauritania",MU:"africa/mauritius",MX:"americas/mexico",MD:"europe/moldova",
  MN:"asia/mongolia",ME:"europe/montenegro",MA:"africa/morocco",MZ:"africa/mozambique",
  MM:"asia/myanmar",NA:"africa/namibia",NP:"asia/nepal",NL:"europe/netherlands",
  NZ:"pacific/new-zealand",NI:"americas/nicaragua",NE:"africa/niger",NG:"africa/nigeria",
  MK:"europe/north-macedonia",NO:"europe/norway",OM:"middle-east/oman",PK:"asia/pakistan",
  PS:"middle-east/palestinian-territories",PA:"americas/panama",PG:"pacific/papua-new-guinea",
  PY:"americas/paraguay",PE:"americas/peru",PH:"asia/philippines",PL:"europe/poland",
  PT:"europe/portugal",QA:"middle-east/qatar",RO:"europe/romania",RU:"europe/russia",
  RW:"africa/rwanda",SA:"middle-east/saudi-arabia",SN:"africa/senegal",RS:"europe/serbia",
  SC:"africa/seychelles",SL:"africa/sierra-leone",SG:"asia/singapore",SK:"europe/slovakia",
  SI:"europe/slovenia",SB:"pacific/solomon-islands",SO:"africa/somalia",ZA:"africa/south-africa",
  SS:"africa/south-sudan",ES:"europe/spain",LK:"asia/sri-lanka",SD:"africa/sudan",
  SR:"americas/suriname",SE:"europe/sweden",CH:"europe/switzerland",SY:"middle-east/syria",
  TW:"asia/taiwan",TJ:"asia/tajikistan",TZ:"africa/tanzania",TH:"asia/thailand",
  TL:"asia/timor-leste",TG:"africa/togo",TO:"pacific/tonga",TT:"americas/trinidad-and-tobago",
  TN:"africa/tunisia",TR:"middle-east/turkiye",TM:"asia/turkmenistan",UG:"africa/uganda",
  UA:"europe/ukraine",AE:"middle-east/united-arab-emirates",GB:"europe/united-kingdom",
  US:"americas/united-states-of-america",UY:"americas/uruguay",UZ:"asia/uzbekistan",
  VU:"pacific/vanuatu",VE:"americas/venezuela",VN:"asia/vietnam",YE:"middle-east/yemen",
  ZM:"africa/zambia",ZW:"africa/zimbabwe",
};

const AU_LEVELS: Array<{ pattern: string; raw: string; nl: string; level: Level }> = [
  { pattern: "do not travel", raw: "Do not travel", nl: "Niet reizen", level: "red" },
  { pattern: "reconsider your need to travel", raw: "Reconsider your need to travel", nl: "Heroverweeg of reizen noodzakelijk is", level: "orange" },
  { pattern: "exercise a high degree of caution", raw: "Exercise a high degree of caution", nl: "Hoge mate van voorzichtigheid", level: "yellow" },
  { pattern: "exercise normal safety precautions", raw: "Exercise normal safety precautions", nl: "Normale veiligheidsmaatregelen", level: "green" },
];

// ── Canada ──
const CA_SLUGS: Record<string, string> = {
  AF:"afghanistan",AL:"albania",DZ:"algeria",AO:"angola",AR:"argentina",AM:"armenia",AT:"austria",
  AZ:"azerbaijan",BH:"bahrain",BD:"bangladesh",BB:"barbados",BY:"belarus",BE:"belgium",BZ:"belize",
  BJ:"benin",BT:"bhutan",BO:"bolivia",BA:"bosnia-and-herzegovina",BW:"botswana",BR:"brazil",
  BN:"brunei",BG:"bulgaria",BF:"burkina-faso",BI:"burundi",CV:"cabo-verde",KH:"cambodia",
  CM:"cameroon",CF:"central-african-republic",TD:"chad",CL:"chile",CN:"china",CO:"colombia",
  CD:"democratic-republic-of-the-congo",CG:"congo",CR:"costa-rica",CI:"cote-d-ivoire",HR:"croatia",
  CU:"cuba",CY:"cyprus",CZ:"czech-republic",DK:"denmark",DJ:"djibouti",DM:"dominica",
  DO:"dominican-republic",EC:"ecuador",EG:"egypt",SV:"el-salvador",GQ:"equatorial-guinea",
  ER:"eritrea",EE:"estonia",SZ:"eswatini",ET:"ethiopia",FJ:"fiji",FI:"finland",FR:"france",
  GA:"gabon",GM:"gambia",GE:"georgia",DE:"germany",GH:"ghana",GR:"greece",GD:"grenada",
  GT:"guatemala",GN:"guinea",GW:"guinea-bissau",GY:"guyana",HT:"haiti",HN:"honduras",HU:"hungary",
  IS:"iceland",IN:"india",ID:"indonesia",IR:"iran",IQ:"iraq",IE:"ireland",
  IL:"israel-the-west-bank-and-the-gaza-strip",IT:"italy",JM:"jamaica",JP:"japan",JO:"jordan",
  KZ:"kazakhstan",KE:"kenya",KP:"north-korea",KR:"south-korea",XK:"kosovo",KW:"kuwait",
  KG:"kyrgyzstan",LA:"laos",LV:"latvia",LB:"lebanon",LS:"lesotho",LR:"liberia",LY:"libya",
  LT:"lithuania",LU:"luxembourg",MG:"madagascar",MW:"malawi",MY:"malaysia",MV:"maldives",
  ML:"mali",MT:"malta",MR:"mauritania",MU:"mauritius",MX:"mexico",MD:"moldova",MN:"mongolia",
  ME:"montenegro",MA:"morocco",MZ:"mozambique",MM:"myanmar",NA:"namibia",NP:"nepal",
  NL:"netherlands",NZ:"new-zealand",NI:"nicaragua",NE:"niger",NG:"nigeria",MK:"north-macedonia",
  NO:"norway",OM:"oman",PK:"pakistan",PA:"panama",PG:"papua-new-guinea",PY:"paraguay",PE:"peru",
  PH:"philippines",PL:"poland",PT:"portugal",QA:"qatar",RO:"romania",RU:"russia",RW:"rwanda",
  SA:"saudi-arabia",SN:"senegal",RS:"serbia",SC:"seychelles",SL:"sierra-leone",SG:"singapore",
  SK:"slovakia",SI:"slovenia",SB:"solomon-islands",SO:"somalia",ZA:"south-africa",SS:"south-sudan",
  ES:"spain",LK:"sri-lanka",SD:"sudan",SR:"suriname",SE:"sweden",CH:"switzerland",SY:"syria",
  TW:"taiwan",TJ:"tajikistan",TZ:"tanzania",TH:"thailand",TL:"timor-leste",TG:"togo",TO:"tonga",
  TT:"trinidad-and-tobago",TN:"tunisia",TR:"turkey",TM:"turkmenistan",UG:"uganda",UA:"ukraine",
  AE:"united-arab-emirates",GB:"united-kingdom",US:"united-states",UY:"uruguay",UZ:"uzbekistan",
  VU:"vanuatu",VE:"venezuela",VN:"vietnam",YE:"yemen",ZM:"zambia",ZW:"zimbabwe",
};

const CA_LEVELS: Array<{ pattern: RegExp; raw: string; nl: string; level: Level }> = [
  { pattern: /avoid all travel/i, raw: "Avoid all travel", nl: "Vermijd alle reizen", level: "red" },
  { pattern: /avoid non-essential travel/i, raw: "Avoid non-essential travel", nl: "Vermijd niet-essentiële reizen", level: "orange" },
  { pattern: /exercise a high degree of caution/i, raw: "Exercise a high degree of caution", nl: "Hoge mate van voorzichtigheid", level: "yellow" },
  { pattern: /(?:take|exercise) normal security precautions/i, raw: "Take normal security precautions", nl: "Normale veiligheidsmaatregelen", level: "green" },
];

// ── France ──
const FR_SLUGS: Record<string, string> = {
  AF:"afghanistan",AL:"albanie",DZ:"algerie",AO:"angola",AR:"argentine",AM:"armenie",AT:"autriche",
  AZ:"azerbaidjan",BH:"bahrein",BD:"bangladesh",BB:"barbade",BY:"bielorussie",BE:"belgique",
  BZ:"belize",BJ:"benin",BT:"bhoutan",BO:"bolivie",BA:"bosnie-herzegovine",BW:"botswana",
  BR:"bresil",BN:"brunei",BG:"bulgarie",BF:"burkina-faso",BI:"burundi",CV:"cap-vert",
  KH:"cambodge",CM:"cameroun",CA:"canada",CF:"republique-centrafricaine",TD:"tchad",CL:"chili",
  CN:"chine",CO:"colombie",CD:"republique-democratique-du-congo",CG:"congo",CR:"costa-rica",
  CI:"cote-d-ivoire",HR:"croatie",CU:"cuba",CY:"chypre",CZ:"republique-tcheque",DK:"danemark",
  DJ:"djibouti",DO:"republique-dominicaine",EC:"equateur",EG:"egypte",SV:"salvador",
  GQ:"guinee-equatoriale",ER:"erythree",EE:"estonie",SZ:"eswatini",ET:"ethiopie",FJ:"fidji",
  FI:"finlande",FR:"france",GA:"gabon",GM:"gambie",GE:"georgie",DE:"allemagne",GH:"ghana",
  GR:"grece",GT:"guatemala",GN:"guinee",GW:"guinee-bissau",GY:"guyana",HT:"haiti",HN:"honduras",
  HU:"hongrie",IS:"islande",IN:"inde",ID:"indonesie",IR:"iran",IQ:"irak",IE:"irlande",
  IL:"israel",IT:"italie",JM:"jamaique",JP:"japon",JO:"jordanie",KZ:"kazakhstan",KE:"kenya",
  KP:"coree-du-nord",KR:"coree-du-sud",XK:"kosovo",KW:"koweit",KG:"kirghizistan",LA:"laos",
  LV:"lettonie",LB:"liban",LS:"lesotho",LR:"liberia",LY:"libye",LT:"lituanie",LU:"luxembourg",
  MG:"madagascar",MW:"malawi",MY:"malaisie",MV:"maldives",ML:"mali",MT:"malte",MR:"mauritanie",
  MU:"maurice",MX:"mexique",MD:"moldavie",MN:"mongolie",ME:"montenegro",MA:"maroc",
  MZ:"mozambique",MM:"birmanie",NA:"namibie",NP:"nepal",NL:"pays-bas",NZ:"nouvelle-zelande",
  NI:"nicaragua",NE:"niger",NG:"nigeria",MK:"macedoine-du-nord",NO:"norvege",OM:"oman",
  PK:"pakistan",PA:"panama",PG:"papouasie-nouvelle-guinee",PY:"paraguay",PE:"perou",
  PH:"philippines",PL:"pologne",PT:"portugal",QA:"qatar",RO:"roumanie",RU:"russie",RW:"rwanda",
  SA:"arabie-saoudite",SN:"senegal",RS:"serbie",SC:"seychelles",SL:"sierra-leone",SG:"singapour",
  SK:"slovaquie",SI:"slovenie",SB:"iles-salomon",SO:"somalie",ZA:"afrique-du-sud",SS:"soudan-du-sud",
  ES:"espagne",LK:"sri-lanka",SD:"soudan",SR:"suriname",SE:"suede",CH:"suisse",SY:"syrie",
  TW:"taiwan",TJ:"tadjikistan",TZ:"tanzanie",TH:"thailande",TL:"timor-oriental",TG:"togo",
  TO:"tonga",TT:"trinite-et-tobago",TN:"tunisie",TR:"turquie",TM:"turkmenistan",UG:"ouganda",
  UA:"ukraine",AE:"emirats-arabes-unis",GB:"royaume-uni",US:"etats-unis",UY:"uruguay",
  UZ:"ouzbekistan",VU:"vanuatu",VE:"venezuela",VN:"vietnam",YE:"yemen",ZM:"zambie",ZW:"zimbabwe",
};

const FR_LEVELS: Array<{ pattern: RegExp; raw: string; nl: string; level: Level }> = [
  { pattern: /formellement d.conseill/i, raw: "Formellement déconseillé", nl: "Sterk afgeraden", level: "red" },
  { pattern: /d.conseill.[\s\S]{0,20}sauf raison imp.rative/i, raw: "Déconseillé sauf raison impérative", nl: "Afgeraden tenzij noodzakelijk", level: "orange" },
  { pattern: /vigilance renforc.e/i, raw: "Vigilance renforcée", nl: "Verhoogde waakzaamheid", level: "yellow" },
  { pattern: /vigilance normale/i, raw: "Vigilance normale", nl: "Normale waakzaamheid", level: "green" },
  { pattern: /s.curit. normale/i, raw: "Sécurité normale", nl: "Normale veiligheid", level: "green" },
  { pattern: /d.conseill./i, raw: "Déconseillé", nl: "Afgeraden", level: "red" },
];

// ── Germany ──
// Germany uses a JSON API that returns all countries — client-side we fetch just the page
const DE_SLUGS: Record<string, string> = {
  AF:"afghanistan",AL:"albanien",DZ:"algerien",AO:"angola",AR:"argentinien",AM:"armenien",
  AT:"oesterreich",AZ:"aserbaidschan",BH:"bahrain",BD:"bangladesch",BB:"barbados",BY:"belarus",
  BE:"belgien",BZ:"belize",BJ:"benin",BT:"bhutan",BO:"bolivien",BA:"bosnien-und-herzegowina",
  BW:"botsuana",BR:"brasilien",BN:"brunei",BG:"bulgarien",BF:"burkina-faso",BI:"burundi",
  CV:"cabo-verde",KH:"kambodscha",CM:"kamerun",CA:"kanada",CF:"zentralafrikanische-republik",
  TD:"tschad",CL:"chile",CN:"china",CO:"kolumbien",CD:"kongo-demokratische-republik",
  CG:"kongo-republik",CR:"costa-rica",CI:"cote-d-ivoire",HR:"kroatien",CU:"kuba",CY:"zypern",
  CZ:"tschechien",DK:"daenemark",DJ:"dschibuti",DO:"dominikanische-republik",EC:"ecuador",
  EG:"aegypten",SV:"el-salvador",GQ:"aequatorialguinea",ER:"eritrea",EE:"estland",SZ:"eswatini",
  ET:"aethiopien",FJ:"fidschi",FI:"finnland",FR:"frankreich",GA:"gabun",GM:"gambia",GE:"georgien",
  GH:"ghana",GR:"griechenland",GT:"guatemala",GN:"guinea",GW:"guinea-bissau",GY:"guyana",
  HT:"haiti",HN:"honduras",HU:"ungarn",IS:"island",IN:"indien",ID:"indonesien",IR:"iran",IQ:"irak",
  IE:"irland",IL:"israel",IT:"italien",JM:"jamaika",JP:"japan",JO:"jordanien",KZ:"kasachstan",
  KE:"kenia",KP:"nordkorea",KR:"suedkorea",XK:"kosovo",KW:"kuwait",KG:"kirgisistan",LA:"laos",
  LV:"lettland",LB:"libanon",LS:"lesotho",LR:"liberia",LY:"libyen",LT:"litauen",LU:"luxemburg",
  MG:"madagaskar",MW:"malawi",MY:"malaysia",MV:"malediven",ML:"mali",MT:"malta",MR:"mauretanien",
  MU:"mauritius",MX:"mexiko",MD:"moldau",MN:"mongolei",ME:"montenegro",MA:"marokko",
  MZ:"mosambik",MM:"myanmar",NA:"namibia",NP:"nepal",NL:"niederlande",NZ:"neuseeland",
  NI:"nicaragua",NE:"niger",NG:"nigeria",MK:"nordmazedonien",NO:"norwegen",OM:"oman",
  PK:"pakistan",PA:"panama",PG:"papua-neuguinea",PY:"paraguay",PE:"peru",PH:"philippinen",
  PL:"polen",PT:"portugal",QA:"katar",RO:"rumaenien",RU:"russland",RW:"ruanda",
  SA:"saudi-arabien",SN:"senegal",RS:"serbien",SC:"seychellen",SL:"sierra-leone",SG:"singapur",
  SK:"slowakei",SI:"slowenien",SB:"salomonen",SO:"somalia",ZA:"suedafrika",SS:"suedsudan",
  ES:"spanien",LK:"sri-lanka",SD:"sudan",SR:"suriname",SE:"schweden",CH:"schweiz",SY:"syrien",
  TW:"taiwan",TJ:"tadschikistan",TZ:"tansania",TH:"thailand",TL:"timor-leste",TG:"togo",TO:"tonga",
  TT:"trinidad-und-tobago",TN:"tunesien",TR:"tuerkei",TM:"turkmenistan",UG:"uganda",UA:"ukraine",
  AE:"vereinigte-arabische-emirate",GB:"vereinigtes-koenigreich",US:"vereinigte-staaten",
  UY:"uruguay",UZ:"usbekistan",VU:"vanuatu",VE:"venezuela",VN:"vietnam",YE:"jemen",ZM:"sambia",
  ZW:"simbabwe",
};

const DE_LEVELS: Array<{ pattern: RegExp; raw: string; nl: string; level: Level }> = [
  { pattern: /reisewarnung(?!\s*\/)/i, raw: "Reisewarnung", nl: "Reiswaarschuwing", level: "red" },
  { pattern: /teilreisewarnung/i, raw: "Teilreisewarnung", nl: "Gedeeltelijke reiswaarschuwing", level: "orange" },
  { pattern: /von nicht notwendigen reisen/i, raw: "Von nicht notwendigen Reisen abraten", nl: "Niet-noodzakelijke reizen afgeraden", level: "orange" },
  { pattern: /erh.hte vorsicht/i, raw: "Erhöhte Vorsicht", nl: "Verhoogde voorzichtigheid", level: "yellow" },
  { pattern: /keine besonderen/i, raw: "Keine besonderen Sicherheitshinweise", nl: "Geen bijzondere waarschuwingen", level: "green" },
];

// ── Denmark ──
const DK_SLUGS: Record<string, string> = {
  AF:"afghanistan",AL:"albanien",DZ:"algeriet",AO:"angola",AR:"argentina",AM:"armenien",
  AT:"oestrig",AZ:"aserbajdsjan",BH:"bahrain",BD:"bangladesh",BB:"barbados",BY:"hviderusland",
  BE:"belgien",BZ:"belize",BJ:"benin",BT:"bhutan",BO:"bolivia",BA:"bosnien-hercegovina",
  BW:"botswana",BR:"brasilien",BN:"brunei",BG:"bulgarien",BF:"burkina-faso",BI:"burundi",
  CV:"cabo-verde",KH:"cambodja",CM:"cameroun",CA:"canada",CF:"den-centralafrikanske-republik",
  TD:"tchad",CL:"chile",CN:"kina",CO:"colombia",CD:"den-demokratiske-republik-congo",
  CG:"congo-brazzaville",CR:"costa-rica",CI:"elfenbenskysten",HR:"kroatien",CU:"cuba",CY:"cypern",
  CZ:"tjekkiet",DK:"danmark",DJ:"djibouti",DO:"den-dominikanske-republik",EC:"ecuador",
  EG:"egypten",SV:"el-salvador",GQ:"aekvatorialguinea",ER:"eritrea",EE:"estland",SZ:"eswatini",
  ET:"etiopien",FJ:"fiji",FI:"finland",FR:"frankrig",GA:"gabon",GM:"gambia",GE:"georgien",
  DE:"tyskland",GH:"ghana",GR:"graekenland",GT:"guatemala",GN:"guinea",GW:"guinea-bissau",
  GY:"guyana",HT:"haiti",HN:"honduras",HU:"ungarn",IS:"island",IN:"indien",ID:"indonesien",
  IR:"iran",IQ:"irak",IE:"irland",IL:"israel",IT:"italien",JM:"jamaica",JP:"japan",JO:"jordan",
  KZ:"kasakhstan",KE:"kenya",KP:"nordkorea",KR:"sydkorea",XK:"kosovo",KW:"kuwait",
  KG:"kirgisistan",LA:"laos",LV:"letland",LB:"libanon",LS:"lesotho",LR:"liberia",LY:"libyen",
  LT:"litauen",LU:"luxembourg",MG:"madagaskar",MW:"malawi",MY:"malaysia",MV:"maldiverne",
  ML:"mali",MT:"malta",MR:"mauretanien",MU:"mauritius",MX:"mexico",MD:"moldova",MN:"mongoliet",
  ME:"montenegro",MA:"marokko",MZ:"mozambique",MM:"myanmar",NA:"namibia",NP:"nepal",
  NL:"holland",NZ:"new-zealand",NI:"nicaragua",NE:"niger",NG:"nigeria",MK:"nordmakedonien",
  NO:"norge",OM:"oman",PK:"pakistan",PA:"panama",PG:"papua-ny-guinea",PY:"paraguay",PE:"peru",
  PH:"filippinerne",PL:"polen",PT:"portugal",QA:"qatar",RO:"rumaenien",RU:"rusland",RW:"rwanda",
  SA:"saudi-arabien",SN:"senegal",RS:"serbien",SC:"seychellerne",SL:"sierra-leone",SG:"singapore",
  SK:"slovakiet",SI:"slovenien",SB:"salomonoerne",SO:"somalia",ZA:"sydafrika",SS:"sydsudan",
  ES:"spanien",LK:"sri-lanka",SD:"sudan",SR:"surinam",SE:"sverige",CH:"schweiz",SY:"syrien",
  TW:"taiwan",TJ:"tadsjikistan",TZ:"tanzania",TH:"thailand",TL:"timor-leste",TG:"togo",TO:"tonga",
  TT:"trinidad-og-tobago",TN:"tunesien",TR:"tyrkiet",TM:"turkmenistan",UG:"uganda",UA:"ukraine",
  AE:"de-forenede-arabiske-emirater",GB:"storbritannien",US:"usa",UY:"uruguay",UZ:"usbekistan",
  VU:"vanuatu",VE:"venezuela",VN:"vietnam",YE:"yemen",ZM:"zambia",ZW:"zimbabwe",
};

const DK_LEVELS: Array<{ pattern: RegExp; raw: string; nl: string; level: Level }> = [
  { pattern: /rejse frarådes/i, raw: "Rejse frarådes", nl: "Reizen afgeraden", level: "red" },
  { pattern: /fraråd[^\w]*ikke.nødvendige/i, raw: "Fraråd ikke-nødvendige rejser", nl: "Niet-noodzakelijke reizen afgeraden", level: "orange" },
  { pattern: /vær forsigtig/i, raw: "Vær forsigtig", nl: "Wees voorzichtig", level: "yellow" },
  { pattern: /ingen særlige/i, raw: "Ingen særlige advarsler", nl: "Geen bijzondere waarschuwingen", level: "green" },
];

// ── Sweden ──
const SE_SLUGS: Record<string, string> = {
  AF:"afghanistan",AL:"albanien",DZ:"algeriet",AO:"angola",AR:"argentina",AM:"armenien",
  AT:"oesterrike",AZ:"azerbajdzjan",BH:"bahrain",BD:"bangladesh",BB:"barbados",BY:"vitryssland",
  BE:"belgien",BZ:"belize",BJ:"benin",BT:"bhutan",BO:"bolivia",BA:"bosnien-hercegovina",
  BW:"botswana",BR:"brasilien",BN:"brunei",BG:"bulgarien",BF:"burkina-faso",BI:"burundi",
  CV:"kap-verde",KH:"kambodja",CM:"kamerun",CA:"kanada",CF:"centralafrikanska-republiken",
  TD:"tchad",CL:"chile",CN:"kina",CO:"colombia",CD:"kongo-kinshasa",CG:"kongo-brazzaville",
  CR:"costa-rica",CI:"elfenbenskusten",HR:"kroatien",CU:"kuba",CY:"cypern",CZ:"tjeckien",
  DJ:"djibouti",DO:"dominikanska-republiken",EC:"ecuador",EG:"egypten",SV:"el-salvador",
  ER:"eritrea",EE:"estland",ET:"etiopien",FJ:"fiji",FI:"finland",FR:"frankrike",GA:"gabon",
  GE:"georgien",GH:"ghana",GR:"grekland",GT:"guatemala",GN:"guinea",GW:"guinea-bissau",
  GY:"guyana",HT:"haiti",HN:"honduras",HU:"ungern",IN:"indien",ID:"indonesien",IR:"iran",
  IQ:"irak",IE:"irland",IL:"israel",IT:"italien",JM:"jamaica",JP:"japan",JO:"jordanien",
  KZ:"kazakstan",KE:"kenya",KG:"kirgizistan",KW:"kuwait",LA:"laos",LV:"lettland",LB:"libanon",
  LR:"liberia",LY:"libyen",LT:"litauen",LU:"luxemburg",MG:"madagaskar",MW:"malawi",MY:"malaysia",
  MV:"maldiverna",ML:"mali",MT:"malta",MA:"marocko",MR:"mauretanien",MU:"mauritius",MX:"mexiko",
  MD:"moldavien",MN:"mongoliet",ME:"montenegro",MZ:"mocambique",MM:"myanmar",NA:"namibia",
  NP:"nepal",NZ:"nya-zeeland",NI:"nicaragua",NE:"niger",NG:"nigeria",MK:"nordmakedonien",
  NO:"norge",OM:"oman",PK:"pakistan",PA:"panama",PG:"papua-nya-guinea",PY:"paraguay",PE:"peru",
  PH:"filippinerna",PL:"polen",PT:"portugal",QA:"qatar",RO:"rumanien",RU:"ryssland",RW:"rwanda",
  SA:"saudiarabien",SN:"senegal",RS:"serbien",SL:"sierra-leone",SG:"singapore",SK:"slovakien",
  SI:"slovenien",SO:"somalia",ZA:"sydafrika",KR:"sydkorea",SS:"sydsudan",ES:"spanien",
  LK:"sri-lanka",SD:"sudan",SR:"surinam",CH:"schweiz",SY:"syrien",TJ:"tadzjikistan",TW:"taiwan",
  TZ:"tanzania",TH:"thailand",TG:"togo",TO:"tonga",TT:"trinidad-och-tobago",TN:"tunisien",
  TM:"turkmenistan",TR:"turkiet",UG:"uganda",UA:"ukraina",AE:"uae",US:"usa",UY:"uruguay",
  UZ:"uzbekistan",VU:"vanuatu",VE:"venezuela",VN:"vietnam",YE:"jemen",ZM:"zambia",ZW:"zimbabwe",
};

const SE_LEVELS: Array<{ pattern: RegExp; raw: string; nl: string; level: Level }> = [
  { pattern: /avråd[^\w]*från resor/i, raw: "Avråd från resor", nl: "Reizen afgeraden", level: "red" },
  { pattern: /avråd[^\w]*från icke nödvändiga/i, raw: "Avråd från icke nödvändiga resor", nl: "Niet-noodzakelijke reizen afgeraden", level: "orange" },
  { pattern: /var försiktig/i, raw: "Var försiktig", nl: "Wees voorzichtig", level: "yellow" },
  { pattern: /inga särskilda/i, raw: "Inga särskilda restriktioner", nl: "Geen bijzondere beperkingen", level: "green" },
];

function extractFromHtml(html: string): string {
  const clean = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const match = clean.match(/<article[^>]*>([\s\S]{0,5000})/i)
    ?? clean.match(/<main[^>]*>([\s\S]{0,5000})/i)
    ?? clean.match(/<div[^>]*class="[^"]*(?:body|content)[^"]*"[^>]*>([\s\S]{0,5000})/i);
  return (match?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// ── Source definitions ──

const SOURCE_CONFIGS: Record<string, SourceConfig> = {
  uk: {
    flag: "🇬🇧", nameNl: "Verenigd Koninkrijk",
    getUrl: (iso2) => {
      const slug = UK_SLUGS[iso2];
      return slug ? `https://www.gov.uk/api/content/foreign-travel-advice/${slug}` : null;
    },
    extract: (body) => {
      const level = extractUk(body);
      if (!level) return null;
      const info = UK_LEVEL_NL[level];
      return { rawLevel: info.raw, labelNl: info.nl, level, summary: "" };
    },
  },
  us: {
    flag: "🇺🇸", nameNl: "Verenigde Staten",
    getUrl: (iso2) => {
      const slug = US_SLUGS[iso2];
      return slug ? `https://travel.state.gov/en/international-travel/travel-advisories/${slug.toLowerCase()}.html` : null;
    },
    extract: (body) => {
      // Try JSON API first
      try {
        const data = JSON.parse(body);
        const entries = Array.isArray(data) ? data : data?.value ?? data?.data ?? [];
        for (const entry of entries) {
          const levelNum = String(entry.advisoryLevel ?? entry.level ?? entry.Level ?? entry.AdvisoryLevel ?? "");
          const info = US_LEVELS[levelNum];
          if (!info) continue;
          const levelText = entry.advisoryText ?? entry.levelText ?? entry.LevelText ?? entry.AdvisoryText ?? "";
          const summary = (entry.advisoryDescription ?? entry.description ?? entry.Description ?? entry.summary ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
          return {
            rawLevel: levelText || `Level ${levelNum}`,
            labelNl: info.nl,
            level: info.level,
            summary,
          };
        }
      } catch { /* not JSON, try HTML */ }
      // Fallback: HTML parsing
      const m = body.match(/Level\s+(\d+):\s+([^<\n]+)/i);
      if (!m) return null;
      const info = US_LEVELS[m[1]];
      if (!info) return null;
      return { rawLevel: `Level ${m[1]}: ${m[2].trim()}`, labelNl: info.nl, level: info.level, summary: extractFromHtml(body) };
    },
  },
  germany: {
    flag: "🇩🇪", nameNl: "Duitsland",
    getUrl: (iso2) => {
      const slug = DE_SLUGS[iso2];
      return slug ? `https://www.auswaertiges-amt.de/de/aussenpolitik/laender/${slug}-node/sicherheit` : null;
    },
    extract: (body) => {
      for (const l of DE_LEVELS) {
        if (l.pattern.test(body)) return { rawLevel: l.raw, labelNl: l.nl, level: l.level, summary: extractFromHtml(body) };
      }
      return { rawLevel: "Keine besonderen Sicherheitshinweise", labelNl: "Geen bijzondere waarschuwingen", level: "green" as Level, summary: "" };
    },
  },
  france: {
    flag: "🇫🇷", nameNl: "Frankrijk",
    getUrl: (iso2) => {
      const slug = FR_SLUGS[iso2];
      return slug ? `https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/${slug}/` : null;
    },
    extract: (body) => {
      for (const l of FR_LEVELS) {
        if (l.pattern.test(body)) return { rawLevel: l.raw, labelNl: l.nl, level: l.level, summary: extractFromHtml(body) };
      }
      return null;
    },
  },
  canada: {
    flag: "🇨🇦", nameNl: "Canada",
    getUrl: (iso2) => {
      const slug = CA_SLUGS[iso2];
      return slug ? `https://travel.gc.ca/destinations/${slug}` : null;
    },
    extract: (body) => {
      const text = body.replace(/<[^>]+>/g, " ");
      const SEVERITY: Record<Level, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
      // Pick the LEAST severe matching level — regional zone warnings should not override the general country level
      let best: (typeof CA_LEVELS)[0] | null = null;
      for (const l of CA_LEVELS) {
        if (l.pattern.test(text)) {
          if (!best || SEVERITY[l.level] < SEVERITY[best.level]) best = l;
        }
      }
      return best ? { rawLevel: best.raw, labelNl: best.nl, level: best.level, summary: extractFromHtml(body) } : null;
    },
  },
  australia: {
    flag: "🇦🇺", nameNl: "Australië",
    getUrl: (iso2) => {
      const slug = AU_SLUGS[iso2];
      return slug ? `https://www.smartraveller.gov.au/destinations/${slug}` : null;
    },
    extract: (body) => {
      const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
      const SEVERITY_AU: Record<Level, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
      // Find all matching levels; return the LEAST severe (= general country level).
      // "Do not travel" may appear only for specific border zones, not the whole country.
      let best: (typeof AU_LEVELS)[0] | null = null;
      for (const l of AU_LEVELS) {
        if (text.includes(l.pattern)) {
          if (!best || SEVERITY_AU[l.level] < SEVERITY_AU[best.level]) {
            best = l;
          }
        }
      }
      if (!best) return null;
      const levelIdx = text.indexOf(best.pattern);
      const surrounding = text.slice(Math.max(0, levelIdx - 50), levelIdx + 400);
      // Find a clean sentence containing the level keyword
      const sentences = surrounding.split(/(?<=[.!?])\s+/);
      const relevant = sentences.filter(s =>
        s.toLowerCase().includes(best.pattern) ||
        /travel|safety|caution|risk|advice/i.test(s)
      ).slice(0, 3).join(" ");
      const cleaned = (relevant.length > 30 ? relevant : surrounding)
        .replace(/home\s+destinations[^.]*\./gi, "")
        .replace(/latest update[^.]*\./gi, "")
        .replace(/still current[^.]*\./gi, "")
        .replace(/download\b[^.]{0,80}/gi, "")
        .replace(/local emergency contacts[^.]{0,100}/gi, "")
        .replace(/(?:fire|police|ambulance|medical emergencies?)[^.]{0,40}/gi, "")
        .replace(/call\s+\d+[^.]{0,30}/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      return { rawLevel: best.raw, labelNl: best.nl, level: best.level, summary: cleaned.slice(0, 300) };
    },
  },
  denmark: {
    flag: "🇩🇰", nameNl: "Denemarken",
    getUrl: (iso2) => {
      const slug = DK_SLUGS[iso2];
      return slug ? `https://um.dk/rejse-og-ophold/rejse-til-udlandet/rejsevejledninger/${slug}` : null;
    },
    extract: (body) => {
      const noAdvisory = /vi har ingen rejsevejledning|ingen rejsevejledning for/i.test(body);
      if (noAdvisory) return null;
      for (const l of DK_LEVELS) {
        if (l.pattern.test(body)) return { rawLevel: l.raw, labelNl: l.nl, level: l.level, summary: extractFromHtml(body) };
      }
      return null;
    },
  },
  sweden: {
    flag: "🇸🇪", nameNl: "Zweden",
    getUrl: (iso2) => {
      const slug = SE_SLUGS[iso2];
      return slug ? `https://www.swedenabroad.se/sv/om-utlandet-f%C3%B6r-svenska-medborgare/${slug}/reseinformation/` : null;
    },
    extract: (body) => {
      for (const l of SE_LEVELS) {
        if (l.pattern.test(body)) return { rawLevel: l.raw, labelNl: l.nl, level: l.level, summary: extractFromHtml(body) };
      }
      return { rawLevel: "Inga särskilda restriktioner", labelNl: "Geen bijzondere beperkingen", level: "green" as Level, summary: "" };
    },
  },
};

// ── Component ──

interface LiveAdvisoryProps {
  sourceId: string;
  iso2: string;
  aiSummary?: string | null;
}

export function LiveAdvisory({ sourceId, iso2, aiSummary }: LiveAdvisoryProps) {
  const [state, setState] = useState<"loading" | "found" | "not-found" | "error">("loading");
  const [result, setResult] = useState<AdvisoryResult | null>(null);

  const config = SOURCE_CONFIGS[sourceId];

  useEffect(() => {
    if (!config) { setState("not-found"); return; }
    const url = config.getUrl(iso2);
    if (!url) { setState("not-found"); return; }

    let cancelled = false;

    async function doFetch() {
      // Build list of URLs to try
      const urls = [url!];
      if (sourceId === "us") {
        const slug = US_SLUGS[iso2];
        if (slug) {
          urls.push(`https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${slug.toLowerCase()}-travel-advisory.html`);
          urls.push(`https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/${slug}.html`);
        }
      }

      for (const tryUrl of urls) {
        if (cancelled) return;
        const body = await fetchViaProxy(tryUrl);
        if (cancelled) return;
        if (!body) continue;

        const extracted = config!.extract(body);
        if (cancelled) return;
        if (!extracted) continue;

        setResult({
          ...extracted,
          summary: aiSummary || extracted.summary,
          url: sourceId === "uk"
            ? `https://www.gov.uk/foreign-travel-advice/${UK_SLUGS[iso2]}`
            : tryUrl,
        });
        setState("found");
        return;
      }

      if (!cancelled) setState("error");
    }

    doFetch();
    return () => { cancelled = true; };
  }, [sourceId, iso2, config]);

  if (!config) return null;

  const displayUrl = config.getUrl(iso2) ?? undefined;
  const sourceLabel = `${config.flag} ${config.nameNl}`;

  if (state === "loading") {
    return (
      <tr className="hover:bg-gray-50 transition-colors opacity-60">
        <td className="px-4 py-3"><span className="font-medium text-gray-900">{sourceLabel}</span></td>
        <td className="px-4 py-3"><span className="text-xs text-gray-400 animate-pulse">Laden...</span></td>
        <td className="px-4 py-3" colSpan={2}><span className="text-xs text-gray-400 italic animate-pulse">Reisadvies wordt opgehaald...</span></td>
        <td className="px-4 py-3"><span className="text-gray-400">—</span></td>
        <td className="px-4 py-3 text-center">
          {displayUrl && <a href={sourceId === "uk" ? `https://www.gov.uk/foreign-travel-advice/${UK_SLUGS[iso2]}` : displayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors" title="Officiële bron"><ExternalLink className="w-4 h-4" /></a>}
        </td>
      </tr>
    );
  }

  if (state !== "found" || !result) {
    return (
      <tr className="hover:bg-gray-50 transition-colors opacity-60">
        <td className="px-4 py-3"><span className="font-medium text-gray-900">{sourceLabel}</span></td>
        <td className="px-4 py-3"><span className="text-xs text-gray-400">—</span></td>
        <td className="px-4 py-3" colSpan={2}>
          <p className="text-gray-400 text-sm italic">
            {state === "error" ? "Kon reisadvies niet ophalen" : "Niet beschikbaar"}
          </p>
        </td>
        <td className="px-4 py-3"><span className="text-gray-400">—</span></td>
        <td className="px-4 py-3 text-center">
          {displayUrl && <a href={sourceId === "uk" ? `https://www.gov.uk/foreign-travel-advice/${UK_SLUGS[iso2]}` : displayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors" title="Bekijk bron"><ExternalLink className="w-4 h-4" /></a>}
        </td>
      </tr>
    );
  }

  const badge = BADGE[result.level];

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3"><span className="font-medium text-gray-900">{sourceLabel}</span></td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>{badge.label}</span>
      </td>
      <td className="px-4 py-3">
        <div className="text-xs leading-snug">
          <span className="text-gray-500">•</span>{" "}
          <em className="text-gray-800 not-italic italic">{result.rawLevel}</em>
          <br />
          <span className="text-gray-400 text-[11px]">{result.labelNl}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {result.summary && <p className="text-gray-700 text-xs leading-relaxed line-clamp-3">{result.summary}</p>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500"><span className="text-gray-400">Live opgehaald</span></td>
      <td className="px-4 py-3 text-center">
        <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors" title="Officiële bron"><ExternalLink className="w-4 h-4" /></a>
      </td>
    </tr>
  );
}
