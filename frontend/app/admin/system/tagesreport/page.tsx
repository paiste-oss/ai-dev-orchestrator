"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface Report {
  id: string;
  created_at: string;
  content: string;
}

export default function TagesreportPage() {
  const [reports, setReports]       = useState<Report[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Report | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [waitingFor, setWaitingFor] = useState<number | null>(null); // Sekunden-Countdown
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/system/tagesreport`);
      if (res.ok) setReports(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function triggerNow() {
    setTriggering(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/system/tagesreport/trigger`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? `Fehler ${res.status}`);
        return;
      }
      // Claude Haiku braucht ~10–20s — Countdown + auto-reload
      let secs = 20;
      setWaitingFor(secs);
      const iv = setInterval(() => {
        secs -= 1;
        if (secs <= 0) {
          clearInterval(iv);
          setWaitingFor(null);
          load();
        } else {
          setWaitingFor(secs);
        }
      }, 1000);
    } finally {
      setTriggering(false);
    }
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("de-CH", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  // Vorschau: erste 120 Zeichen des Inhalts (ohne Markdown-Symbole)
  function preview(content: string) {
    return content.replace(/#{1,3}\s/g, "").slice(0, 120) + "…";
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tagesreport</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Tägliche Zusammenfassung um 20:00 · Claude Haiku · gespeichert in PostgreSQL
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerNow}
            disabled={triggering || waitingFor !== null}
            className="text-sm border border-indigo-700/50 text-indigo-300 hover:border-indigo-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {triggering
            ? "Starte…"
            : waitingFor !== null
            ? `⏳ ${waitingFor}s…`
            : "▶ Jetzt generieren"}
          </button>
          <button
            onClick={load}
            className="text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            ↻ Aktualisieren
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300">
        💡 Berichte werden täglich um 20:00 automatisch generiert. Über „Jetzt generieren" kann ein Bericht sofort ausgelöst werden — er erscheint nach ~20 Sekunden automatisch in der Liste.
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-xs text-red-400">
          Fehler: {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Laden…</div>
      ) : reports.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center text-gray-500 text-sm">
          Noch keine Berichte vorhanden. Über „Jetzt generieren" den ersten erstellen.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Datum</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vorschau</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {reports.map(r => (
                <tr
                  key={r.id}
                  className={`transition-colors cursor-pointer ${
                    selected?.id === r.id ? "bg-indigo-950/30" : "hover:bg-gray-800/40"
                  }`}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}
                >
                  <td className="px-5 py-3 text-gray-300 whitespace-nowrap font-mono text-xs">
                    {fmt(r.created_at)}
                  </td>
                  <td className="px-5 py-3 text-gray-500 truncate max-w-0">
                    <span className="block truncate">{preview(r.content)}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-xs text-indigo-400 hover:text-indigo-300">
                      {selected?.id === r.id ? "Schliessen" : "Öffnen"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail-Ansicht */}
      {selected && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
            <span className="text-sm font-medium text-white">{fmt(selected.created_at)}</span>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-500 hover:text-white text-xs transition-colors"
            >
              ✕ Schliessen
            </button>
          </div>
          <div className="p-6">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed font-sans">
              {selected.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
