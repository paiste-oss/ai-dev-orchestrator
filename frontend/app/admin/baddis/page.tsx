"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";
import { USE_CASES, UseCaseSegment } from "@/lib/usecases";

const FILTERS: { key: "alle" | UseCaseSegment; label: string; icon: string }[] = [
  { key: "alle",       label: "Alle",       icon: "🔍" },
  { key: "menschen",   label: "Menschen",   icon: "🧑" },
  { key: "firmen",     label: "Firmen",     icon: "🏢" },
  { key: "funktionen", label: "Funktionen", icon: "⚡" },
];

export default function BaddisPage() {
  const router = useRouter();
  const user = getSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState<"alle" | UseCaseSegment>("alle");
  const [search, setSearch] = useState("");

  if (!user || user.role !== "admin") {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  const visible = USE_CASES.filter((uc) => {
    if (filter !== "alle" && uc.segment !== filter) return false;
    if (search && !uc.name.toLowerCase().includes(search.toLowerCase()) &&
        !uc.buddyName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const active   = visible.filter(uc => uc.status === "active");
  const planned  = visible.filter(uc => uc.status === "coming_soon");

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 md:hidden mb-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
          <h1 className="text-lg font-bold text-yellow-400">Baddis</h1>
        </div>

        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold hidden md:block">🤖 Baddis</h2>
              <p className="text-gray-400 text-sm mt-0.5">{USE_CASES.length} Archetypen · {USE_CASES.filter(u => u.status === "active").length} aktiv</p>
            </div>

            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suchen…"
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-yellow-500 w-full sm:w-56"
            />
          </div>

          {/* Segment filter */}
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  filter === f.key
                    ? "bg-yellow-500 border-yellow-400 text-black"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>

          {/* Active */}
          {active.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Aktiv ({active.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {active.map(uc => (
                  <button
                    key={uc.id}
                    onClick={() => router.push(`/admin/baddis/${uc.id}`)}
                    className={`group text-left rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-xl ${uc.bgColor} ${uc.borderColor} border`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-3xl">{uc.icon}</span>
                      <span className="font-mono text-xs text-yellow-500 bg-black/30 px-2 py-0.5 rounded-lg">{uc.baddiD}</span>
                    </div>
                    <p className={`font-bold text-sm ${uc.color}`}>{uc.buddyName}</p>
                    <p className="text-white font-medium text-sm mt-0.5">{uc.name}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{uc.tagline}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-500">{uc.ageRange}</span>
                      <span className="text-xs text-gray-600 group-hover:text-yellow-400 transition-colors">Einrichten →</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Coming soon */}
          {planned.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-widest">In Entwicklung ({planned.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {planned.map(uc => (
                  <button
                    key={uc.id}
                    onClick={() => router.push(`/admin/baddis/${uc.id}`)}
                    className={`group text-left rounded-2xl border p-5 transition-all opacity-50 hover:opacity-70 ${uc.bgColor} ${uc.borderColor} border`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-3xl grayscale">{uc.icon}</span>
                      <span className="font-mono text-xs text-gray-600 bg-black/30 px-2 py-0.5 rounded-lg">{uc.baddiD}</span>
                    </div>
                    <p className="font-bold text-sm text-gray-400">{uc.buddyName}</p>
                    <p className="text-gray-300 font-medium text-sm mt-0.5">{uc.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{uc.tagline}</p>
                    <div className="mt-3">
                      <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Bald verfügbar</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {visible.length === 0 && (
            <p className="text-center text-gray-600 py-16">Keine Baddis gefunden</p>
          )}
        </div>
      </main>
    </div>
  );
}
