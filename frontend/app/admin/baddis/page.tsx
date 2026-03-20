"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface BuddyAdmin {
  id: string;
  name: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  usecase_id: string | null;
  segment: string;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  last_message_at: string | null;
  message_count: number;
}

function nameToGradient(name: string) {
  const gradients = [
    "from-violet-500 to-indigo-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-600",
    "from-sky-500 to-blue-600",
    "from-purple-500 to-fuchsia-600",
  ];
  return gradients[(name.charCodeAt(0) ?? 0) % gradients.length];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

export default function BaddisPage() {
  const router = useRouter();
  const user = getSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [buddies, setBuddies] = useState<BuddyAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  if (!user || user.role !== "admin") {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/buddies/admin/list?q=${encodeURIComponent(q)}&page_size=50`);
      if (res.ok) setBuddies(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); load(searchInput); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const segmentLabel: Record<string, string> = {
    personal: "Persönlich",
    corporate: "Unternehmen",
    elderly: "Senior",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {/* Mobile header */}
        <div className="flex items-center gap-3 md:hidden mb-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
          <h1 className="text-lg font-bold text-yellow-400">Baddis</h1>
        </div>

        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="hidden md:block">
              <h2 className="text-2xl font-bold">◈ Baddis</h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {buddies.length} aktive Baddis · je 1:1 mit einem Kunden verknüpft
              </p>
            </div>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Baddi oder Kunde suchen…"
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-yellow-500 w-full sm:w-64"
            />
          </div>

          {/* Erklärung */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 text-xs text-gray-400 flex items-start gap-3">
            <span className="text-lg shrink-0 mt-0.5">⚙</span>
            <div>
              <p className="font-medium text-gray-300 mb-0.5">Wie Baddis funktionieren</p>
              <p>Jeder Kunde hat genau einen persönlichen Baddi. Basierend auf der Anfrage des Kunden aktiviert der Agent Router automatisch die richtigen Tools und Agenten im Uhrwerk. Das Uhrwerk vergisst nach der Ausführung — das Ergebnis bleibt im Gedächtnis des Baddis.</p>
            </div>
          </div>

          {/* Liste */}
          {loading ? (
            <div className="text-center py-20 text-gray-600">Lade Baddis…</div>
          ) : buddies.length === 0 ? (
            <div className="text-center py-20 text-gray-600">
              {search ? "Keine Baddis gefunden" : "Noch keine Baddis — Kunden registrieren um zu beginnen"}
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-medium">Baddi</th>
                    <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Kunde</th>
                    <th className="text-left px-5 py-3 font-medium hidden lg:table-cell">Segment</th>
                    <th className="text-left px-5 py-3 font-medium hidden lg:table-cell">Nachrichten</th>
                    <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Letzte Aktivität</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {buddies.map(b => (
                    <tr
                      key={b.id}
                      onClick={() => router.push(`/admin/customers/${b.customer_id}`)}
                      className="hover:bg-gray-800/40 cursor-pointer transition-colors"
                    >
                      {/* Baddi */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {b.avatar_url ? (
                            <img src={b.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-800 shrink-0" />
                          ) : (
                            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${nameToGradient(b.name)} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                              {b.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-white">{b.name}</p>
                            {b.usecase_id && (
                              <p className="text-xs text-gray-500">{b.usecase_id}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Kunde */}
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-white font-medium">{b.customer_name}</p>
                        <p className="text-xs text-gray-500">{b.customer_email}</p>
                      </td>

                      {/* Segment */}
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                          {segmentLabel[b.segment] ?? b.segment}
                        </span>
                      </td>

                      {/* Nachrichten */}
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className={`text-sm font-medium ${b.message_count > 0 ? "text-white" : "text-gray-600"}`}>
                          {b.message_count}
                        </span>
                      </td>

                      {/* Letzte Aktivität */}
                      <td className="px-5 py-4 hidden md:table-cell text-gray-400 text-xs">
                        {timeAgo(b.last_message_at)}
                      </td>

                      {/* Pfeil */}
                      <td className="px-5 py-4 text-right">
                        <span className="text-gray-600 group-hover:text-yellow-400">→</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
