/**
 * Wird von Next.js während der Route-Navigation als Suspense-Fallback gezeigt.
 * Das Admin-Layout (Sidebar, Header) ist bereits sichtbar — dieser Skeleton
 * füllt nur den Inhaltsbereich.
 */
export default function AdminLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-12 space-y-6 animate-pulse">
      {/* Seitentitel-Platzhalter */}
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-white/5" />
        <div className="h-8 w-56 rounded-lg bg-white/8" />
      </div>

      {/* Stat-Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-white/5" />
        ))}
      </div>

      {/* Hauptbereich */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 rounded-2xl bg-white/5" />
        <div className="space-y-4">
          <div className="h-40 rounded-2xl bg-white/5" />
          <div className="h-32 rounded-2xl bg-white/5" />
        </div>
      </div>
    </div>
  );
}
