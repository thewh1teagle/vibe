"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

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
  UY:"Uruguay",UZ:"Uzbekistan",VU:"Vanuatu",VA:"Vatican-City",VE:"Venezuela",VN:"Vietnam",
  YE:"Yemen",ZM:"Zambia",ZW:"Zimbabwe",
};

const LEVEL_REGEX = /Level\s+(\d+):\s+([^<\n]+)/i;

const LEVEL_COLORS: Record<string, { color: string; labelNl: string; badge: string }> = {
  "1": { color: "bg-emerald-100 text-emerald-800 border-emerald-300", labelNl: "Normale voorzorgsmaatregelen", badge: "Veilig" },
  "2": { color: "bg-yellow-100 text-yellow-800 border-yellow-300", labelNl: "Verhoogde voorzichtigheid", badge: "Voorzichtig" },
  "3": { color: "bg-orange-100 text-orange-800 border-orange-300", labelNl: "Reis heroverwegen", badge: "Risicovol" },
  "4": { color: "bg-red-100 text-red-800 border-red-300", labelNl: "Niet reizen", badge: "Gevaarlijk" },
};

const PROXIES = [
  (url: string) => `https://jolly-queen-1584.nederlander.workers.dev/?${url}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
];

interface USAdvisoryProps {
  iso2: string;
}

export function USAdvisory({ iso2 }: USAdvisoryProps) {
  const [state, setState] = useState<"loading" | "found" | "not-found" | "error">("loading");
  const [advisory, setAdvisory] = useState<{ rawLevel: string; labelNl: string; color: string; badge: string; summary: string; url: string } | null>(null);

  const slug = ISO2_TO_SLUG[iso2];

  useEffect(() => {
    if (!slug) { setState("not-found"); return; }

    let cancelled = false;
    const urls = [
      `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${slug.toLowerCase()}-travel-advisory.html`,
      `https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/${slug}.html`,
    ];

    async function tryFetch() {
      for (const targetUrl of urls) {
        for (const buildProxy of PROXIES) {
          try {
            const res = await fetch(buildProxy(targetUrl), { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) continue;
            const html = await res.text();
            if (html.length < 200) continue;

            const match = html.match(LEVEL_REGEX);
            if (!match) continue;

            const levelNum = match[1];
            const levelText = match[2].trim();
            const info = LEVEL_COLORS[levelNum];
            if (!info) continue;

            const rawLevel = `Level ${levelNum}: ${levelText}`;

            let summary = "";
            const summaryPatterns = [
              /Level\s+\d[^<]*<\/[^>]+>\s*(?:<[^>]+>\s*)*<p[^>]*>([\s\S]*?)<\/p>/i,
              /<p[^>]*>([^<]{60,})<\/p>/i,
            ];
            for (const pat of summaryPatterns) {
              const m = html.match(pat);
              if (m) {
                const text = m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
                if (text.length > 30) { summary = text.slice(0, 300); break; }
              }
            }

            if (cancelled) return;
            setAdvisory({ rawLevel, labelNl: info.labelNl, color: info.color, badge: info.badge, summary, url: targetUrl });
            setState("found");
            return;
          } catch { /* try next */ }
        }
      }
      if (!cancelled) setState("not-found");
    }

    tryFetch();
    return () => { cancelled = true; };
  }, [slug]);

  const displayUrl = slug
    ? `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${slug.toLowerCase()}-travel-advisory.html`
    : undefined;

  if (state === "loading") {
    return (
      <tr className="hover:bg-gray-50 transition-colors opacity-60">
        <td className="px-4 py-3"><span className="font-medium text-gray-900">🇺🇸 Verenigde Staten</span></td>
        <td className="px-4 py-3"><span className="text-xs text-gray-400 animate-pulse">Laden...</span></td>
        <td className="px-4 py-3" colSpan={2}><span className="text-xs text-gray-400 italic animate-pulse">Reisadvies wordt opgehaald...</span></td>
        <td className="px-4 py-3"><span className="text-gray-400">—</span></td>
        <td className="px-4 py-3 text-center">
          {displayUrl && <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors" title="Officiële bron"><ExternalLink className="w-4 h-4" /></a>}
        </td>
      </tr>
    );
  }

  if (state === "error" || state === "not-found" || !advisory) {
    return (
      <tr className="hover:bg-gray-50 transition-colors opacity-60">
        <td className="px-4 py-3"><span className="font-medium text-gray-900">🇺🇸 Verenigde Staten</span></td>
        <td className="px-4 py-3"><span className="text-xs text-gray-400">—</span></td>
        <td className="px-4 py-3" colSpan={2}><p className="text-gray-400 text-sm italic">Niet beschikbaar</p></td>
        <td className="px-4 py-3"><span className="text-gray-400">—</span></td>
        <td className="px-4 py-3 text-center">
          {displayUrl && <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors" title="Bekijk op State.gov"><ExternalLink className="w-4 h-4" /></a>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3"><span className="font-medium text-gray-900">🇺🇸 Verenigde Staten</span></td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${advisory.color}`}>{advisory.badge}</span>
      </td>
      <td className="px-4 py-3">
        <p className="text-gray-800 font-medium text-sm">{advisory.rawLevel}</p>
        <p className="text-gray-500 text-xs mt-0.5">{advisory.labelNl}</p>
      </td>
      <td className="px-4 py-3">
        {advisory.summary && <p className="text-gray-700 text-xs leading-relaxed line-clamp-3">{advisory.summary}</p>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500"><span className="text-gray-400">Live opgehaald</span></td>
      <td className="px-4 py-3 text-center">
        <a href={advisory.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-blue-500 hover:text-blue-700 transition-colors" title="Officiële bron"><ExternalLink className="w-4 h-4" /></a>
      </td>
    </tr>
  );
}
