import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center space-y-4 py-16">
      <h1 className="text-4xl font-bold text-gray-300">404</h1>
      <p className="text-gray-600">Land of pagina niet gevonden.</p>
      <Link href="/" className="text-blue-600 hover:underline">← Terug naar overzicht</Link>
    </div>
  );
}
