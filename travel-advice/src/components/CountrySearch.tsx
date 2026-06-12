"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface Country {
  isoAlpha2: string;
  nameNl: string;
  nameEn: string;
  regionNl: string;
}

interface Props {
  countries: Country[];
}

export function CountrySearch({ countries }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const filtered =
    query.length >= 1
      ? countries
          .filter(
            (c) =>
              c.nameNl.toLowerCase().includes(query.toLowerCase()) ||
              c.nameEn.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 8)
      : [];

  function navigate(iso: string) {
    setOpen(false);
    setQuery("");
    startTransition(() => router.push(`/country/${iso.toLowerCase()}`));
  }

  return (
    <div className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Zoek een bestemming…"
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm text-base"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map((c) => (
            <li key={c.isoAlpha2}>
              <button
                type="button"
                onMouseDown={() => navigate(c.isoAlpha2)}
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between gap-2 transition-colors"
              >
                <span className="font-medium text-gray-900">{c.nameNl}</span>
                <span className="text-sm text-gray-400">{c.regionNl}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
