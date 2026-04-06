"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { useRouter } from "next/navigation";

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

export default function PaketPage() {
  const [assembly, setAssembly]       = useState<Assembly | null>(null);
  const [loading, setLoading]         = useState(true);
  const [draft, setDraft]             = useState("");
  const [original, setOriginal]       = useState("");
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const router = useRouter();

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
        const r = await apiFetch(`${BACKEND_URL}/v1/admin/system-prompts/assembly`);
        if (r.ok) setAssembly(await r.json());
      }
    } finally {
      setSaving(false);
    }
  }

  const isDirty = draft !== original;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Uhrwerk</p>
              <h1 className="text-2xl font-bold text-white">Paket</h1>
              <p className="text-gray-400 text-sm mt-1">
                Was bei jedem Chat an Claude gesendet wird — System-Prompt + Messages
              </p>
            </div>
            <button
              onClick={load}
              className="text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              ↻
            </button>
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm py-8 text-center">Laden…</div>
          ) : (
            <>
              {/* ── TEIL 1: SYSTEM-PROMPT ── */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/5" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Teil 1</span>
                    <span className="text-sm font-semibold text-white">system</span>
                    <span className="text-[10px] text-gray-600 font-mono">→ Claude system-Feld</span>
                  </div>
                  <div className="h-px flex-1 bg-white/5" />
                </div>

                <p className="text-xs text-gray-500">
                  Wird einmalig pro Request aufgebaut — gibt Claude seine Persönlichkeit, Fähigkeiten und Kundenwissen.
                </p>

                {/* Info */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300">
                  💡 Änderungen an der Basis-Identität werden sofort in Redis gespeichert und beim nächsten Chat aktiv.
                </div>

                {assembly && (
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
                              {isEditable && (
                                <div className="shrink-0 flex items-center gap-2">
                                  {isDirty && <span className="text-xs text-amber-400">● Ungespeichert</span>}
                                  {saved   && <span className="text-xs text-emerald-400">✓ Gespeichert</span>}
                                </div>
                              )}
                              {!isEditable && layer.edit_path && (
                                <button
                                  onClick={() => router.push(layer.edit_path!)}
                                  className="shrink-0 text-xs text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-700 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  Ansehen →
                                </button>
                              )}
                            </div>

                            {/* Content */}
                            <div className="px-5 pb-5">
                              {isEditable ? (
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
                                <div className="space-y-3">
                                  <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl px-4 py-3">
                                    <p className="text-xs text-purple-300/80 leading-relaxed">{layer.note}</p>
                                  </div>
                                  {layer.example && (
                                    <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 space-y-1">
                                      {layer.example.map((ex, i) => (
                                        <div key={i} className="flex gap-2">
                                          <span className="text-purple-500/50 text-xs shrink-0">-</span>
                                          <span className="text-xs text-gray-400 font-mono italic">{ex}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

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
                  </div>
                )}
              </section>

              {/* ── Trennpfeil zwischen Teil 1 und Teil 2 ── */}
              <div className="flex flex-col items-center gap-1 py-2">
                <div className="w-px h-6 bg-gray-700" />
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-400 font-mono">
                  + zusammengeführt zu einem Claude-Request
                </div>
                <div className="w-px h-6 bg-gray-700" />
              </div>

              {/* ── TEIL 2: MESSAGES ── */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/5" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Teil 2</span>
                    <span className="text-sm font-semibold text-white">messages</span>
                    <span className="text-[10px] text-gray-600 font-mono">→ Claude messages-Feld</span>
                  </div>
                  <div className="h-px flex-1 bg-white/5" />
                </div>

                <p className="text-xs text-gray-500">
                  Der Gesprächsverlauf — gibt Claude den Kontext was vorher gesagt wurde.
                </p>

                {/* History-Karte */}
                <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                  <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-800">
                    <div className="shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-bold bg-gray-700/50 text-gray-400 border-gray-700">
                      H
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white text-sm">Conversation History</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-gray-700/50 text-gray-400 border-gray-700">
                          pro Kunde
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 font-mono">PostgreSQL → letzte 10 Nachrichten</p>
                    </div>
                  </div>
                  <div className="px-5 pb-5 pt-4 space-y-3">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Die letzten 10 Chat-Nachrichten (user + assistant) aus PostgreSQL.
                      Gibt Claude den Kontext des laufenden Gesprächs — damit Folgefragen
                      korrekt beantwortet werden.
                    </p>
                    {/* Beispiel-Visualisierung */}
                    <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 space-y-2">
                      <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Beispiel</p>
                      {[
                        { role: "user",      text: "Was kostet die SBB nach Bern?" },
                        { role: "assistant", text: "Der Preis beträgt CHF 24.—" },
                        { role: "user",      text: "Und zurück?" },
                        { role: "assistant", text: "Gleich teuer, CHF 24.—" },
                        { role: "user",      text: "← aktuelle Anfrage", current: true },
                      ].map((m, i) => (
                        <div key={i} className={`flex gap-2 items-start ${m.current ? "opacity-50" : ""}`}>
                          <span className={`text-[10px] font-mono shrink-0 w-16 mt-0.5 ${
                            m.role === "user" ? "text-blue-400/70" : "text-emerald-400/70"
                          }`}>
                            {m.role}
                          </span>
                          <span className={`text-xs font-mono ${m.current ? "text-gray-600 italic" : "text-gray-400"}`}>
                            {m.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Ergebnis ── */}
              <div className="flex justify-center">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-6 py-3 flex items-center gap-3">
                  <span className="text-yellow-400 text-lg">⚡</span>
                  <div>
                    <p className="text-sm font-semibold text-yellow-400">Paket an Claude gesendet</p>
                    <p className="text-[11px] text-yellow-500/60 mt-0.5">system + messages → Claude API</p>
                  </div>
                </div>
              </div>

            </>
          )}
    </div>
  );
}
