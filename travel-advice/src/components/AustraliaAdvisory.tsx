"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

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

const LEVEL_MAP: Record<string, { label: string; labelNl: string; color: string; level: string }> = {
  "exercise normal safety precautions": {
    label: "Exercise normal safety precautions",
    labelNl: "Normale veiligheidsmaatregelen",
    color: "bg-emerald-100 text-emerald-800 border-emerald-300",
    level: "green",
  },
  "exercise a high degree of caution": {
    label: "Exercise a high degree of caution",
    labelNl: "Hoge mate van voorzichtigheid",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    level: "yellow",
  },
  "reconsider your need to travel": {
    label: "Reconsider your need to travel",
    labelNl: "Heroverweeg of reizen noodzakelijk is",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    level: "orange",
  },
  "do not travel": {
    label: "Do not travel",
    labelNl: "Niet reizen",
    color: "bg-red-100 text-red-800 border-red-300",
    level: "red",
  },
};

const PROXIES = [
  (url: string) => `https://jolly-queen-1584.nederlander.workers.dev/?${url}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
];

interface AustraliaAdvisoryProps {
  iso2: string;
}

export function AustraliaAdvisory({ iso2 }: AustraliaAdvisoryProps) {
  const [state, setState] = useState<"loading" | "found" | "not-found" | "error">("loading");
  const [advisory, setAdvisory] = useState<{ rawLevel: string; labelNl: string; color: string; level: string; summary: string; url: string } | null>(null);

  const slug = ISO2_TO_SLUG[iso2];
  const url = slug ? `https://www.smartraveller.gov.au/destinations/${slug}` : null;

  useEffect(() => {
    if (!url) {
      setState("not-found");
      return;
    }

    let cancelled = false;

    async function fetchAdvisory() {
      try {
        let html = "";
        for (const buildProxy of PROXIES) {
          try {
            const proxyUrl = buildProxy(url!);
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) continue;
            const text = await res.text();
            if (text.length > 200) { html = text; break; }
          } catch { /* try next proxy */ }
        }
        if (!html) throw new Error("All proxies failed");

        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
        let found: typeof advisory = null;

        for (const [pattern, info] of Object.entries(LEVEL_MAP)) {
          if (text.includes(pattern)) {
            const bodyMatch = html.match(/<div[^>]*class="[^"]*field--name-body[^"]*"[^>]*>([\s\S]{0,3000})/i)
              ?? html.match(/<main[^>]*>([\s\S]{0,3000})/i);
            const summary = (bodyMatch?.[1] ?? "")
              .replace(/<[^>]+>/g, " ")
              .replace(/&[a-z#0-9]+;/gi, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300);

            found = {
              rawLevel: info.label,
              labelNl: info.labelNl,
              color: info.color,
              level: info.level,
              summary,
              url: url!,
            };
            break;
          }
        }

        if (cancelled) return;
        if (found) {
          setAdvisory(found);
          setState("found");
        } else {
          setState("not-found");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    }

    fetchAdvisory();
    return () => { cancelled = true; };
  }, [url]);

  if (state === "loading") {
    return (
      <tr className="hover:bg-gray-50 transition-colors opacity-60">
        <td className="px-4 py-3"><span className="font-medium text-gray-900">🇦🇺 Australië</span></td>
        <td className="px-4 py-3"><span className="text-xs text-gray-400 animate-pulse">Laden...</span></td>
        <td className="px-4 py-3" colSpan={2}><span className="text-xs text-gray-400 italic animate-pulse">Reisadvies wordt opgehaald...</span></td>
        <td className="px-4 py-3"><span className="text-gray-400">—</span></td>
        <td className="px-4 py-3 text-center">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors"
              title="Officiële bron">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </td>
      </tr>
    );
  }

  if (state === "error" || state === "not-found" || !advisory) {
    return (
      <tr className="hover:bg-gray-50 transition-colors opacity-60">
        <td className="px-4 py-3"><span className="font-medium text-gray-900">🇦🇺 Australië</span></td>
        <td className="px-4 py-3"><span className="text-xs text-gray-400">—</span></td>
        <td className="px-4 py-3" colSpan={2}>
          <p className="text-gray-400 text-sm italic">
            {state === "error" ? "Kon reisadvies niet ophalen" : "Niet beschikbaar"}
          </p>
        </td>
        <td className="px-4 py-3"><span className="text-gray-400">—</span></td>
        <td className="px-4 py-3 text-center">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors"
              title="Bekijk op Smartraveller">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3"><span className="font-medium text-gray-900">🇦🇺 Australië</span></td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${advisory.color}`}>
          {advisory.level === "green" ? "Veilig" : advisory.level === "yellow" ? "Voorzichtig" : advisory.level === "orange" ? "Risicovol" : "Gevaarlijk"}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="text-gray-800 font-medium text-sm">{advisory.rawLevel}</p>
        <p className="text-gray-500 text-xs mt-0.5">{advisory.labelNl}</p>
      </td>
      <td className="px-4 py-3">
        {advisory.summary && (
          <p className="text-gray-700 text-xs leading-relaxed line-clamp-3">{advisory.summary}</p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        <span className="text-gray-400">Live opgehaald</span>
      </td>
      <td className="px-4 py-3 text-center">
        <a href={advisory.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors"
          title="Officiële bron">
          <ExternalLink className="w-4 h-4" />
        </a>
      </td>
    </tr>
  );
}
