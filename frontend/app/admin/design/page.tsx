"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import { useTheme } from "@/components/ThemeProvider";
import { THEMES, type Theme, type ThemeId } from "@/lib/theme";

// ─── Mini-Vorschau eines Layouts ──────────────────────────────────────────────

function ThemePreview({ theme }: { theme: Theme }) {
  const p = theme.preview;
  return (
    <div
      className="w-full aspect-[4/3] rounded-xl overflow-hidden border"
      style={{ background: p.bg, borderColor: p.border }}
    >
      <div className="flex h-full">
        {/* Mini-Sidebar */}
        <div className="w-1/4 h-full flex flex-col gap-1.5 p-2" style={{ background: p.sidebar }}>
          {/* Logo */}
          <div className="flex items-center gap-1 mb-2 px-1">
            <div className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-black"
              style={{ background: p.accent, color: "#000" }}>B</div>
            <div className="h-1.5 rounded w-8" style={{ background: p.accentText, opacity: 0.5 }} />
          </div>
          {/* Nav-Items */}
          {[0.7, 0.5, 0.5, 0.3, 0.5].map((op, i) => (
            <div key={i} className="flex items-center gap-1 px-1 py-0.5 rounded"
              style={{ background: i === 0 ? `${p.accent}22` : "transparent" }}>
              <div className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: i === 0 ? p.accent : p.subtext, opacity: op }} />
              <div className="h-1 rounded flex-1"
                style={{ background: i === 0 ? p.accentText : p.subtext, opacity: op * 0.6 }} />
            </div>
          ))}
        </div>

        {/* Mini-Content */}
        <div className="flex-1 p-2 flex flex-col gap-2">
          {/* Header */}
          <div className="flex items-center gap-1">
            <div className="h-2 rounded w-16" style={{ background: p.text, opacity: 0.8 }} />
            <div className="ml-auto w-5 h-5 rounded-full"
              style={{ background: `${p.accent}33`, border: `1.5px solid ${p.accent}55` }} />
          </div>

          {/* Stat-Karten */}
          <div className="grid grid-cols-2 gap-1.5">
            {[p.accent, p.accentText, p.subtext, p.subtext].map((col, i) => (
              <div key={i} className="rounded p-1.5"
                style={{ background: p.surface, border: `1px solid ${p.border}` }}>
                <div className="w-3 h-3 rounded mb-1" style={{ background: col, opacity: i < 2 ? 0.8 : 0.3 }} />
                <div className="h-2 rounded w-5 mb-0.5" style={{ background: p.text, opacity: 0.7 }} />
                <div className="h-1 rounded w-8" style={{ background: p.subtext, opacity: 0.5 }} />
              </div>
            ))}
          </div>

          {/* Alert-Banner */}
          <div className="rounded px-2 py-1 flex items-center gap-1"
            style={{ background: `${p.accent}18`, border: `1px solid ${p.accent}40` }}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.accent }} />
            <div className="h-1 rounded flex-1" style={{ background: p.accentText, opacity: 0.6 }} />
          </div>

          {/* Tabelle */}
          <div className="flex-1 rounded overflow-hidden"
            style={{ background: p.surface, border: `1px solid ${p.border}` }}>
            {[0.6, 0.4, 0.4].map((op, i) => (
              <div key={i} className="flex items-center gap-1 px-2 py-1"
                style={{ borderBottom: i < 2 ? `1px solid ${p.border}` : "none" }}>
                <div className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: p.subtext, opacity: op }} />
                <div className="h-1 rounded flex-1"
                  style={{ background: p.text, opacity: op * 0.7 }} />
                <div className="h-1 rounded w-6"
                  style={{ background: p.accent, opacity: op * 0.5 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Theme-Karte ──────────────────────────────────────────────────────────────

function ThemeCard({
  theme, active, onSelect,
}: {
  theme: Theme;
  active: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  const [applying, setApplying] = useState(false);

  const handleSelect = async () => {
    if (active) return;
    setApplying(true);
    await new Promise(r => setTimeout(r, 120));
    onSelect(theme.id);
    setApplying(false);
  };

  return (
    <button
      onClick={handleSelect}
      disabled={active}
      className={`group relative flex flex-col text-left rounded-2xl overflow-hidden border transition-all duration-200
        ${active
          ? "border-2 shadow-lg scale-[1.01]"
          : "border hover:border-white/15 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40"
        }
      `}
      style={{
        background: theme.preview.surface,
        borderColor: active ? theme.preview.accent : theme.preview.border,
        boxShadow: active ? `0 0 0 1px ${theme.preview.accent}40, 0 8px 32px ${theme.preview.accent}20` : undefined,
      }}
    >
      {/* Aktiv-Badge */}
      {active && (
        <div
          className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5"
          style={{ background: `${theme.preview.accent}25`, color: theme.preview.accent, border: `1px solid ${theme.preview.accent}50` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: theme.preview.accent }} />
          Aktiv
        </div>
      )}

      {/* Vorschau */}
      <div className="p-3">
        <ThemePreview theme={theme} />
      </div>

      {/* Info */}
      <div className="px-4 pb-4 space-y-1">
        <div className="flex items-center gap-2">
          {/* Farbpunkt */}
          <span className="w-3 h-3 rounded-full shrink-0 border border-white/20"
            style={{ background: theme.preview.accent }} />
          <p className="text-sm font-semibold" style={{ color: theme.preview.text }}>
            {theme.name}
          </p>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: theme.preview.subtext }}>
          {theme.description}
        </p>
      </div>

      {/* Hover-Overlay: Anwenden */}
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          <span className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: theme.preview.accent, color: "#000" }}>
            {applying ? "Anwenden..." : "Layout anwenden"}
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function DesignPage() {
  const router = useRouter();
  const { theme: activeTheme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleSelect = (id: ThemeId) => {
    setTheme(id);
    const name = THEMES.find(t => t.id === id)?.name ?? id;
    setToast(`Layout "${name}" angewendet`);
    setTimeout(() => setToast(null), 2500);
  };

  const active = THEMES.find(t => t.id === activeTheme) ?? THEMES[0];

  return (
    <div className="min-h-screen flex" style={{ background: "var(--t-bg)", color: "var(--t-text)" }}>
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile Top-Bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b md:hidden"
          style={{ background: "var(--t-bg)", borderColor: "var(--t-border)" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.05)", color: "#9ca3af" }}
          >☰</button>
          <span className="font-bold text-sm" style={{ color: "var(--t-accent-hex)" }}>Design</span>
        </header>

        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-10">

          {/* ── Header ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/admin/settings")}
                className="text-sm transition-colors"
                style={{ color: "var(--t-subtext)" }}
              >
                ← Einstellungen
              </button>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Design & Layout</h1>
            <p className="text-sm" style={{ color: "var(--t-subtext)" }}>
              Wähle ein Layout für das Admin-Center. Die Änderung wird sofort übernommen.
            </p>
          </div>

          {/* ── Aktuelles Layout ── */}
          <div className="rounded-2xl p-5 flex items-center gap-4 border"
            style={{ background: `${active.preview.accent}10`, borderColor: `${active.preview.accent}30` }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: `${active.preview.accent}20` }}>
              🎨
            </div>
            <div>
              <p className="text-sm font-semibold">Aktuelles Layout: <span style={{ color: active.preview.accent }}>{active.name}</span></p>
              <p className="text-xs mt-0.5" style={{ color: "var(--t-subtext)" }}>{active.description}</p>
            </div>
          </div>

          {/* ── Layout-Grid ── */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: "var(--t-subtext)" }}>
              Verfügbare Layouts
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {THEMES.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  active={activeTheme === theme.id}
                  onSelect={handleSelect}
                />
              ))}

              {/* Platzhalter: Mehr demnächst */}
              <div className="rounded-2xl border flex flex-col items-center justify-center py-12 px-6 text-center"
                style={{ borderStyle: "dashed", borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                <div className="text-3xl mb-2 opacity-30">+</div>
                <p className="text-sm font-medium opacity-40">Mehr Layouts</p>
                <p className="text-xs mt-1 opacity-25">Demnächst verfügbar</p>
              </div>
            </div>
          </div>

          {/* ── Info ── */}
          <div className="rounded-xl px-4 py-3 text-xs border"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "var(--t-border)", color: "var(--t-subtext)" }}>
            Das gewählte Layout wird pro Browser gespeichert. Jeder Admin kann sein eigenes Layout verwenden.
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl"
          style={{ background: `${active.preview.accent}`, color: "#000" }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
