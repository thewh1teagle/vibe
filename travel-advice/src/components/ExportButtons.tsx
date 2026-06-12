"use client";
import { Download } from "lucide-react";

interface Props {
  iso?: string;
}

export function ExportButtons({ iso }: Props) {
  const base = iso ? `?iso=${iso}` : "";

  return (
    <div className="flex gap-2 flex-wrap">
      <a
        href={`/api/export/csv${base}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        CSV
      </a>
      <a
        href={`/api/export/excel${base}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Excel
      </a>
      <a
        href={`/api/export/pdf${base}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        PDF
      </a>
    </div>
  );
}
