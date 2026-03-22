"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface Category {
  id: string;
  label: string;
  description: string;
  examples: string[];
  severity: "critical" | "high" | "medium";
}

interface GuardInfo {
  active: boolean;
  mode: string;
  categories: Category[];
  total_patterns: number;
}

interface TestResult {
  blocked: boolean;
  matched_pattern: string | null;
  matched_category: string | null;
  message_preview: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-300 border border-red-500/30",
  high:     "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  medium:   "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Kritisch",
  high:     "Hoch",
  medium:   "Mittel",
};

export default function RouterAdminPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [guard, setGuard]     = useState<GuardInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [testMsg, setTestMsg]       = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting]       = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/router/content-guard`);
      if (res.ok) setGuard(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function runTest() {
    if (!testMsg.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/router/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMsg }),
      });
      if (res.ok) setTestResult(await res.json());
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile Header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-950/90 backdrop-blur md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-sm text-red-400">🛡 Content Guard</span>
        </header>

        <div className="p-6 max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                🛡 Content Guard
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Regex-Blockliste — schützt vor illegalen Inhalten vor jedem API-Aufruf
              </p>
            </div>
            <button
              onClick={load}
              className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↻ Aktualisieren
            </button>
          </div>

          {/* Status Banner */}
          <div className={`flex items-center gap-4 rounded-xl px-5 py-4 border ${
            guard?.active
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            <div className={`w-3 h-3 rounded-full shrink-0 ${guard?.active ? "bg-emerald-400" : "bg-red-400"} shadow-lg`} />
            <div className="flex-1">
              <p className={`font-semibold ${guard?.active ? "text-emerald-300" : "text-red-300"}`}>
                {loading ? "Lade…" : guard?.active ? "Content Guard aktiv" : "Content Guard inaktiv"}
              </p>
              {guard && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Modus: <span className="text-gray-400">{guard.mode.toUpperCase()}</span>
                  {" · "}
                  {guard.total_patterns} Muster in {guard.categories.length} Kategorien
                  {" · "}
                  Latenz: &lt;1 ms
                </p>
              )}
            </div>
          </div>

          {/* Kategorien */}
          {guard && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Blockierte Kategorien</h2>
              <div className="grid gap-3">
                {guard.categories.map(cat => (
                  <div key={cat.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{cat.label}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_STYLE[cat.severity]}`}>
                            {SEVERITY_LABEL[cat.severity]}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">{cat.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cat.examples.map(ex => (
                        <code key={ex} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700">
                          {ex}
                        </code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test-Tool */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Nachricht testen</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <p className="text-xs text-gray-500">
                Prüfe ob eine Nachricht vom Content Guard blockiert würde — nützlich beim Erweitern der Blockliste.
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={testMsg}
                  onChange={e => setTestMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && runTest()}
                  placeholder="Testnachricht eingeben…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 transition-colors"
                />
                <button
                  onClick={runTest}
                  disabled={testing || !testMsg.trim()}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {testing ? "…" : "Testen"}
                </button>
              </div>

              {testResult && (
                <div className={`rounded-lg px-4 py-3 border ${
                  testResult.blocked
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-emerald-500/10 border-emerald-500/30"
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{testResult.blocked ? "🚫" : "✅"}</span>
                    <p className={`font-semibold text-sm ${testResult.blocked ? "text-red-300" : "text-emerald-300"}`}>
                      {testResult.blocked ? "Blockiert" : "Erlaubt"}
                    </p>
                  </div>
                  {testResult.blocked && (
                    <div className="mt-2 space-y-1">
                      {testResult.matched_category && (
                        <p className="text-xs text-gray-400">
                          Kategorie: <span className="text-red-300">{testResult.matched_category}</span>
                        </p>
                      )}
                      {testResult.matched_pattern && (
                        <p className="text-xs text-gray-400">
                          Muster: <code className="text-red-300 bg-red-500/10 px-1 rounded">{testResult.matched_pattern}</code>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300 space-y-1">
            <p className="font-semibold">Wie funktioniert der Content Guard?</p>
            <p className="text-blue-400/70">
              Jede eingehende Nachricht wird vor dem ersten API-Aufruf durch einen Regex-Filter geprüft.
              Bei einem Treffer wird die Anfrage sofort mit HTTP 400 abgewiesen — ohne Token-Verbrauch.
              Die Tool-Auswahl für erlaubte Nachrichten übernimmt Claude selbst (natives Tool Use).
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
