"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface Layer {
  step: number;
  name: string;
  source: string;
  type: "static" | "dynamic";
  content?: string | string[];
  note?: string;
  example?: string[];
  editable?: boolean;
  edit_path?: string;
}

interface Assembly {
  layers: Layer[];
}

const STEP_COLORS: Record<number, { border: string; badge: string }> = {
  1: { border: "border-yellow-500/30", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  2: { border: "border-blue-500/30",   badge: "bg-blue-500/15 text-blue-400 border-blue-500/30"     },
  3: { border: "border-purple-500/30", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  4: { border: "border-emerald-500/30",badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  5: { border: "border-purple-500/30", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
};

export default function SystemPromptPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assembly, setAssembly]       = useState<Assembly | null>(null);
  const [loading, setLoading]         = useState(true);
  const [preview, setPreview]         = useState(false);

  // Inline-Editor für Schicht 1 (Baddi-Basis-Prompt)
  const [draft, setDraft]     = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [assemblyRes, promptRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/assembly`),
        apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/baddi`),
      ]);
      if (assemblyRes.ok) setAssembly(await assemblyRes.json());
      if (promptRes.ok) {
        const d = await promptRes.json();
        setDraft(d.prompt);
        setOriginal(d.prompt);
      }
    } finally {
      setLoading(false);
    }
  }

  async function savePrompt() {
    setSaving(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/baddi`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: draft }),
      });
      if (res.ok) {
        setOriginal(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        // Assembly neu laden damit Vorschau aktuell bleibt
        const r = await apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/assembly`);
        if (r.ok) setAssembly(await r.json());
      }
    } finally {
      setSaving(false);
    }
  }

  function buildPreview(layers: Layer[]): string {
    return layers.map(layer => {
      if (layer.type === "dynamic") {
        const examples = layer.example?.map(e => `- ${e}`).join("\n") ?? "";
        return (
          `# ── ${layer.name.toUpperCase()} (dynamisch, pro Kunde) ──\n` +
          `# Beispiel:\n${examples}`
        );
      }
      if (Array.isArray(layer.content)) {
        return (
          `# ── ${layer.name.toUpperCase()} ──\n` +
          layer.content.map(h => `- ${h}`).join("\n")
        );
      }
      return layer.content ?? "";
    }).join("\n\n");
  }

  const isDirty = draft !== original;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-gray-950/90 backdrop-blur md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">☰</button>
          <span className="font-bold text-sm text-yellow-400">System-Prompt</span>
        </header>

        <div className="p-6 max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Uhrwerk</p>
              <h1 className="text-2xl font-bold text-white">System-Prompt</h1>
              <p className="text-gray-400 text-sm mt-1">
                Assembly der Instruktionen die Baddi bei jedem Chat-Request erhält
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPreview(p => !p)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  preview
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                }`}
              >
                {preview ? "◀ Assembly" : "Vorschau"}
              </button>
              <button
                onClick={load}
                className="text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300">
            💡 Änderungen an der Basis-Identität werden sofort in Redis gespeichert und beim nächsten Chat-Request aktiv.
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
          ) : !assembly ? (
            <div className="text-red-400 text-sm">Fehler beim Laden.</div>
          ) : preview ? (
            /* ── Vorschau-Modus ── */
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
                <span className="text-sm font-medium text-gray-300">Vollständige Vorschau</span>
                <span className="text-xs text-gray-600">Dynamische Schichten = Platzhalter</span>
              </div>
              <pre className="px-5 py-4 text-xs text-gray-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
                {buildPreview(assembly.layers)}
              </pre>
            </div>
          ) : (
            /* ── Assembly-Modus ── */
            <div className="space-y-0">
              {assembly.layers.map((layer, idx) => {
                const colors = STEP_COLORS[layer.step] ?? STEP_COLORS[1];
                const isLast = idx === assembly.layers.length - 1;
                const isEditable = layer.step === 1;

                return (
                  <div key={layer.step}>
                    <div className={`bg-gray-900 border rounded-xl overflow-hidden ${colors.border}`}>

                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-bold ${colors.badge}`}>
                            {layer.step}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white text-sm">{layer.name}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                layer.type === "dynamic"
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                  : "bg-gray-700/50 text-gray-400 border-gray-700"
                              }`}>
                                {layer.type === "dynamic" ? "pro Kunde" : "global"}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5 font-mono">{layer.source}</p>
                          </div>
                        </div>
                        {/* Status für Schicht 1 */}
                        {isEditable && (
                          <div className="shrink-0 flex items-center gap-2">
                            {isDirty && <span className="text-xs text-amber-400">● Ungespeichert</span>}
                            {saved  && <span className="text-xs text-emerald-400">✓ Gespeichert</span>}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="px-5 pb-5">
                        {isEditable ? (
                          /* Inline-Editor für Schicht 1 */
                          <div className="space-y-3">
                            <textarea
                              value={draft}
                              onChange={e => setDraft(e.target.value)}
                              rows={Math.max(4, draft.split("\n").length + 1)}
                              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:border-yellow-500/50 resize-y transition"
                              spellCheck={false}
                            />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-600">
                                {draft.length} Zeichen · {draft.split("\n").length} Zeilen
                              </span>
                              <button
                                onClick={savePrompt}
                                disabled={saving || !isDirty}
                                className={`text-sm px-4 py-2 rounded-lg font-medium transition-all ${
                                  isDirty
                                    ? "bg-yellow-500 hover:bg-yellow-400 text-gray-900"
                                    : "bg-gray-800 text-gray-600 cursor-default"
                                } disabled:opacity-60`}
                              >
                                {saving ? "Speichere…" : "Speichern"}
                              </button>
                            </div>
                          </div>
                        ) : layer.type === "static" ? (
                          <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3">
                            {Array.isArray(layer.content) ? (
                              <ul className="space-y-1">
                                {(layer.content as string[]).map((item, i) => (
                                  <li key={i} className="text-xs text-gray-300 font-mono flex gap-2">
                                    <span className="text-gray-600 shrink-0">-</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <pre className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">
                                {layer.content as string}
                              </pre>
                            )}
                          </div>
                        ) : (
                          /* Dynamic Layer */
                          <div className="space-y-3">
                            <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl px-4 py-3">
                              <p className="text-xs text-purple-300/80 leading-relaxed">{layer.note}</p>
                            </div>
                            {layer.example && layer.example.length > 0 && (
                              <div>
                                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5 px-1">Beispiele</p>
                                <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 space-y-1">
                                  {layer.example.map((ex, i) => (
                                    <div key={i} className="flex gap-2">
                                      <span className="text-purple-500/50 text-xs shrink-0">-</span>
                                      <span className="text-xs text-gray-400 font-mono italic">{ex}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Connector Arrow */}
                    {!isLast && (
                      <div className="flex justify-center py-1.5">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="w-px h-3 bg-gray-800" />
                          <span className="text-gray-700 text-xs">▼</span>
                          <div className="w-px h-3 bg-gray-800" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Final Result Badge */}
              <div className="mt-3 flex justify-center">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-6 py-3 flex items-center gap-3">
                  <span className="text-yellow-400 text-lg">⚡</span>
                  <div>
                    <p className="text-sm font-semibold text-yellow-400">Fertig assemblierter System-Prompt</p>
                    <p className="text-[11px] text-yellow-500/60 mt-0.5">Wird bei jedem Chat-Request an Claude gesendet</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          {!loading && !preview && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 flex gap-3 text-xs text-gray-500">
              <span className="text-gray-600 shrink-0">ℹ</span>
              <span>
                Statische Schichten sind für alle Kunden gleich. Dynamische Schichten (
                <span className="text-purple-400">pro Kunde</span>) werden zur Laufzeit aus dem Memory System geladen
                und variieren je nach Kunde und Anfrage.
              </span>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
