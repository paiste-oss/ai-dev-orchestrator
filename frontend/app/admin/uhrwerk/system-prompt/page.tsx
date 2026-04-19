"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { useRouter } from "next/navigation";

interface CacheInfo {
  static_tokens_approx: number;
  cache_ttl_seconds: number;
  provider: string;
}

interface Layer {
  step: number;
  name: string;
  source: string;
  type: "static" | "dynamic";
  cache_block: "static" | "dynamic";
  tokens_approx?: number;
  content?: string | string[];
  note?: string;
  example?: string[];
  editable?: boolean;
  edit_path?: string;
}

interface Assembly {
  cache_info: CacheInfo;
  layers: Layer[];
}

function TokenBadge({ tokens }: { tokens?: number }) {
  if (!tokens) return null;
  return (
    <span className="text-[10px] font-mono text-gray-600 bg-gray-800/60 border border-gray-700/50 px-1.5 py-0.5 rounded">
      ~{tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} Tokens
    </span>
  );
}

function LayerCard({
  layer,
  isLast,
  draft,
  setDraft,
  isDirty,
  saving,
  saved,
  onSave,
}: {
  layer: Layer;
  isLast: boolean;
  draft?: string;
  setDraft?: (v: string) => void;
  isDirty?: boolean;
  saving?: boolean;
  saved?: boolean;
  onSave?: () => void;
}) {
  const router = useRouter();
  const isEditable = layer.editable && draft !== undefined;

  return (
    <div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-gray-800/60">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-6 h-6 rounded-md bg-gray-800 border border-gray-700 flex items-center justify-center text-[11px] font-bold text-gray-400">
              {layer.step}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-white text-sm">{layer.name}</p>
                <TokenBadge tokens={layer.tokens_approx} />
                {layer.type === "dynamic" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-purple-500/10 text-purple-400 border-purple-500/20">
                    pro Request
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-600 mt-0.5 font-mono truncate">{layer.source}</p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {isEditable && isDirty && <span className="text-xs text-amber-400">● Ungespeichert</span>}
            {isEditable && saved    && <span className="text-xs text-emerald-400">✓ Gespeichert</span>}
            {!isEditable && layer.edit_path && (
              <button
                onClick={() => router.push(layer.edit_path!)}
                className="text-xs text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-700 px-2.5 py-1 rounded-lg transition-colors"
              >
                Ansehen →
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 pt-3">
          {isEditable && draft !== undefined && setDraft && onSave ? (
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
                  onClick={onSave}
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
          ) : layer.note ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 leading-relaxed">{layer.note}</p>
              {layer.example && (
                <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 space-y-1">
                  {layer.example.map((ex, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-700 text-xs shrink-0">›</span>
                      <span className="text-xs text-gray-500 font-mono italic">{ex}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : Array.isArray(layer.content) ? (
            <ul className="space-y-1">
              {(layer.content as string[]).map((item, i) => (
                <li key={i} className="text-xs text-gray-400 font-mono flex gap-2">
                  <span className="text-gray-700 shrink-0">›</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <pre className="text-xs text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">
              {layer.content as string}
            </pre>
          )}
        </div>
      </div>

      {!isLast && (
        <div className="flex justify-center py-1">
          <div className="w-px h-4 bg-gray-800" />
        </div>
      )}
    </div>
  );
}

export default function PaketPage() {
  const [assembly, setAssembly] = useState<Assembly | null>(null);
  const [loading, setLoading]   = useState(true);
  const [draft, setDraft]       = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

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

  const staticLayers  = assembly?.layers.filter(l => l.cache_block === "static")  ?? [];
  const dynamicLayers = assembly?.layers.filter(l => l.cache_block === "dynamic") ?? [];

  const staticTokens  = staticLayers.reduce((s, l)  => s + (l.tokens_approx ?? 0), 0);
  const dynamicTokens = dynamicLayers.reduce((s, l) => s + (l.tokens_approx ?? 0), 0);
  const totalTokens   = staticTokens + dynamicTokens;

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
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/5" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Teil 1</span>
                <span className="text-sm font-semibold text-white">system</span>
                <span className="text-[10px] text-gray-600 font-mono">→ Claude system-Feld</span>
              </div>
              <div className="h-px flex-1 bg-white/5" />
            </div>

            {/* Token-Übersicht */}
            {assembly && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-950/30 border border-green-800/30 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-green-500/70 mb-1">Gecachte Tokens</p>
                  <p className="text-lg font-bold text-green-400">~{staticTokens.toLocaleString()}</p>
                  <p className="text-[10px] text-green-600/70 mt-0.5">10% des Preises bei Cache-Hit</p>
                </div>
                <div className="bg-purple-950/20 border border-purple-800/20 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-purple-400/70 mb-1">Dynamische Tokens</p>
                  <p className="text-lg font-bold text-purple-400">~{dynamicTokens.toLocaleString()}</p>
                  <p className="text-[10px] text-purple-600/70 mt-0.5">Normaler Preis, per Request</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total Input-Tokens</p>
                  <p className="text-lg font-bold text-white">~{totalTokens.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">pro Chat-Anfrage (geschätzt)</p>
                </div>
              </div>
            )}

            {/* ── STATISCHER BLOCK ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-green-950/40 border border-green-800/30 rounded-lg px-3 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-semibold text-green-400">Statischer Block — gecacht</span>
                  <span className="text-[10px] text-green-600 font-mono">cache_control: ephemeral · TTL 5 min</span>
                </div>
                <div className="h-px flex-1 bg-green-900/20" />
              </div>

              <div className="border border-green-900/20 rounded-xl p-3 space-y-0 bg-green-950/5">
                <p className="text-xs text-green-600/80 mb-3 px-1">
                  Diese {staticLayers.length} Layer werden als ein gecachter Block an Claude übergeben.
                  Bei jedem Folge-Request im gleichen Gespräch werden sie nur zu 10% des normalen Token-Preises berechnet.
                </p>
                {staticLayers.map((layer, idx) => (
                  <LayerCard
                    key={layer.step}
                    layer={layer}
                    isLast={idx === staticLayers.length - 1}
                    draft={layer.editable ? draft : undefined}
                    setDraft={layer.editable ? setDraft : undefined}
                    isDirty={layer.editable ? isDirty : undefined}
                    saving={layer.editable ? saving : undefined}
                    saved={layer.editable ? saved : undefined}
                    onSave={layer.editable ? savePrompt : undefined}
                  />
                ))}
              </div>
            </div>

            {/* Trennpfeil zwischen den Blöcken */}
            <div className="flex justify-center">
              <div className="flex flex-col items-center gap-0.5">
                <div className="w-px h-3 bg-gray-800" />
                <span className="text-gray-700 text-xs">▼</span>
                <div className="w-px h-3 bg-gray-800" />
              </div>
            </div>

            {/* ── DYNAMISCHER BLOCK ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-purple-950/30 border border-purple-800/20 rounded-lg px-3 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <span className="text-xs font-semibold text-purple-400">Dynamischer Block — per Request</span>
                  <span className="text-[10px] text-purple-600 font-mono">user-/anfrage-spezifisch</span>
                </div>
                <div className="h-px flex-1 bg-purple-900/10" />
              </div>

              <div className="border border-purple-900/15 rounded-xl p-3 space-y-0 bg-purple-950/5">
                <p className="text-xs text-purple-600/70 mb-3 px-1">
                  Diese {dynamicLayers.length} Layer werden bei jeder Anfrage frisch aufgebaut —
                  Memories, Dokumente, Wissen und Zeit ändern sich pro Request.
                </p>
                {dynamicLayers.map((layer, idx) => (
                  <LayerCard
                    key={layer.step}
                    layer={layer}
                    isLast={idx === dynamicLayers.length - 1}
                    draft={layer.editable ? draft : undefined}
                    setDraft={layer.editable ? setDraft : undefined}
                    isDirty={layer.editable ? isDirty : undefined}
                    saving={layer.editable ? saving : undefined}
                    saved={layer.editable ? saved : undefined}
                    onSave={layer.editable ? savePrompt : undefined}
                  />
                ))}
              </div>
            </div>
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
                    <span className="text-[10px] font-mono text-gray-600 bg-gray-800/60 border border-gray-700/50 px-1.5 py-0.5 rounded">
                      ~1–3k Tokens
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 font-mono">PostgreSQL → letzte 10 Nachrichten</p>
                </div>
              </div>
              <div className="px-5 pb-5 pt-4 space-y-3">
                <p className="text-xs text-gray-400 leading-relaxed">
                  Die letzten 10 Chat-Nachrichten (user + assistant) aus PostgreSQL.
                  Gibt Claude den Kontext des laufenden Gesprächs.
                </p>
                <div className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Beispiel</p>
                  {[
                    { role: "user",      text: "Was kostet die SBB nach Bern?" },
                    { role: "assistant", text: "Der Preis beträgt CHF 24.—" },
                    { role: "user",      text: "Und zurück?" },
                    { role: "assistant", text: "Gleich teuer, CHF 24.—" },
                    { role: "user",      text: "← aktuelle Anfrage", current: true },
                  ].map((m, i) => (
                    <div key={i} className={`flex gap-2 items-start ${(m as { current?: boolean }).current ? "opacity-50" : ""}`}>
                      <span className={`text-[10px] font-mono shrink-0 w-16 mt-0.5 ${
                        m.role === "user" ? "text-blue-400/70" : "text-emerald-400/70"
                      }`}>
                        {m.role}
                      </span>
                      <span className={`text-xs font-mono ${(m as { current?: boolean }).current ? "text-gray-600 italic" : "text-gray-400"}`}>
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
                <p className="text-[11px] text-yellow-500/60 mt-0.5">system (static+dynamic) + messages → Claude API</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
