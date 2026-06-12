import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Travel Advice Comparator",
  description: "Vergelijk reisadviezen van 8 overheden wereldwijd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={`${geist.className} bg-gray-50 text-gray-900 min-h-screen`}>
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <a
              href="/"
              className="flex items-center gap-2 font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              <span className="text-xl">✈</span>
              <span className="hidden sm:inline">Travel Advice Comparator</span>
              <span className="sm:hidden">TAC</span>
            </a>
            <a
              href="/status"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Databron status
            </a>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="mt-16 border-t border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 py-6 text-sm text-gray-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>Travel Advice Comparator — geen AI-credits vereist voor eindgebruikers</span>
            <span>Gegevens van officiële overheidsbronnen · elke 6 uur bijgewerkt</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
