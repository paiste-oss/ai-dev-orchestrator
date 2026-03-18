"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import VoiceButton from "@/components/VoiceButton";
import { API_ROUTES } from "@/lib/config";

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV = [
  { label: "Übersicht",    href: "/enterprise",              icon: "⬡" },
  { label: "Meine Baddis", href: "/enterprise/buddies",      icon: "◈" },
  { label: "Gespräche",    href: "/enterprise/conversations", icon: "💬" },
  { label: "Auslastung",   href: "/enterprise/usage",        icon: "📈" },
  { label: "Einstellungen",href: "/enterprise/settings",     icon: "⊙" },
];

// ─── Stat-Karte ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, sub,
}: {
  label: string;
  value: string | number;
  icon: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 space-y-3">
      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-base">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
      </div>
      <p className="text-xs text-gray-500 font-medium tracking-widest uppercase">{label}</p>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function EnterpriseDashboard() {
  const router = useRouter();
  const [mounted,     setMounted]     = useState(false);
  const [user,        setUser]        = useState<ReturnType<typeof getSession>>(null);
  const [prompt,      setPrompt]      = useState("");
  const [response,    setResponse]    = useState("");
  const [loading,     setLoading]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u || u.role !== "enterprise") router.replace("/login");
  }, []);

  if (!mounted || !user) return null;

  const handleChat = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch(API_ROUTES.agentRun, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: "auto" }),
      });
      const data = await res.json();
      const out = Array.isArray(data) ? data[0]?.output : data.output;
      setResponse(out || "Keine Antwort erhalten.");
    } catch {
      setResponse("Verbindung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">

      {/* ── Mobile Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60
        bg-gray-900/95 backdrop-blur-md border-r border-white/5
        flex flex-col transition-transform duration-300 ease-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0
      `}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white font-black text-sm">B</span>
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-none">Baddi</p>
              <p className="text-[10px] text-blue-400/70 font-medium tracking-widest uppercase mt-0.5">Enterprise</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >✕</button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
          {NAV.map((item) => (
            <button
              key={item.href}
              onClick={() => { router.push(item.href); setSidebarOpen(false); }}
              className="w-full flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl text-left
                text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-150"
            >
              <span className="text-base w-5 text-center text-gray-600">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          {/* User Info */}
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate">{user.name}</p>
              <p className="text-[10px] text-gray-600 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="w-full flex items-center gap-3 text-sm text-gray-500 hover:text-red-400 px-3 py-2.5 rounded-xl hover:bg-red-500/5 transition-all duration-150"
          >
            <span className="w-5 text-center text-base">⎋</span>
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* ── Hauptinhalt ── */}
      <main className="flex-1 overflow-y-auto">

        {/* Mobile Header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3
          bg-gray-950/80 backdrop-blur-md border-b border-white/5 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >☰</button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <span className="text-white font-black text-xs">B</span>
            </div>
            <span className="font-bold text-sm text-blue-400">Enterprise</span>
          </div>
        </header>

        <div className="p-5 md:p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">

          {/* ── Begrüßung ── */}
          <div>
            <p className="text-xs text-gray-600 font-medium tracking-widest uppercase mb-1">
              {new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Willkommen, {user.name.split(" ")[0]} 👋
            </h1>
            <p className="text-gray-500 text-sm mt-1">Enterprise-Übersicht</p>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <StatCard label="Aktive Baddis"    value="—" icon="◈" sub="Zugewiesene KI-Agenten" />
            <StatCard label="Gespräche heute"  value="—" icon="💬" sub="Interaktionen im heutigen Tag" />
            <StatCard label="Aktive Nutzer"    value="—" icon="◎" sub="Nutzer im Unternehmen" />
          </div>

          {/* ── Schnell-Chat ── */}
          <section className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-base">
                💬
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Baddi — Schnell-Chat</h3>
                <p className="text-xs text-gray-600">Direkter Zugang zu deinem KI-Assistenten</p>
              </div>
            </div>

            {/* Eingabe */}
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChat()}
                  placeholder="Stell deinem Baddi eine Frage…"
                  className="flex-1 bg-gray-800 border border-white/5 focus:border-blue-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition-colors"
                />
                <VoiceButton
                  onResult={(text) => setPrompt((prev) => prev ? `${prev} ${text}` : text)}
                  className="w-11 h-11 shrink-0"
                />
                <button
                  onClick={handleChat}
                  disabled={loading || !prompt.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                    px-5 py-3 rounded-xl font-semibold text-sm transition-colors shrink-0"
                >
                  {loading ? (
                    <span className="inline-block animate-spin">↻</span>
                  ) : "Senden"}
                </button>
              </div>

              {/* Antwort */}
              {response && (
                <div className="bg-gray-800/50 border border-white/5 rounded-xl p-4 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-xs">◈</span>
                    <span className="text-xs text-gray-500 font-medium">Baddi</span>
                  </div>
                  {response}
                </div>
              )}
            </div>
          </section>

          {/* ── Aktivitäts-Bereich (Platzhalter) ── */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Letzte Aktivitäten
            </h2>
            <div className="bg-gray-900 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl mb-3">📈</div>
              <p className="text-sm text-gray-400 font-medium">Noch keine Aktivitäten</p>
              <p className="text-xs text-gray-600 mt-1">Gespräche und Ereignisse erscheinen hier</p>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
