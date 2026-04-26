"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface OaOverrideAggregate {
  doi: string;
  user_count: number;
  titles: string[];
  first_at: string;
  pool_oa_url: string | null;
  pool_oa_status: string | null;
  in_blocklist: boolean;
}

interface BlocklistEntry {
  doi: string;
  removed_at: string;
  reason: string | null;
  pool_title: string | null;
}

export default function LiteraturAdminPage() {
  const [overrides, setOverrides] = useState<OaOverrideAggregate[]>([]);
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDoi, setBusyDoi] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, blRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/system/literature/oa-overrides`),
        apiFetch(`${BACKEND_URL}/v1/system/literature/oa-blocklist`),
      ]);
      if (ovRes.ok) setOverrides(await ovRes.json());
      if (blRes.ok) setBlocklist(await blRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally { setLoading(false); }
  }

  async function confirmRemoval(doi: string) {
    setBusyDoi(doi);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/system/literature/oa-overrides/${encodeURIComponent(doi)}/confirm`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || `Fehler ${res.status}`);
        return;
      }
      await load();
    } finally { setBusyDoi(null); }
  }

  async function removeFromBlocklist(doi: string) {
    if (!confirm(`DOI ${doi} aus Blocklist entfernen? Re-Enrichment kann oa_url wieder setzen.`)) return;
    setBusyDoi(doi);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/system/literature/oa-overrides/${encodeURIComponent(doi)}/blocklist`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || `Fehler ${res.status}`);
        return;
      }
      await load();
    } finally { setBusyDoi(null); }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl text-white font-semibold mb-1">Literatur — OA-Korrekturen</h1>
        <p className="text-xs text-gray-400">
          User können Einträge im Wissenspool als &quot;nicht (mehr) Open Access&quot; markieren wenn der Verlag den OA-Status zurückgezogen hat.
          Hier siehst du alle solchen Markierungen aggregiert pro DOI. Bestätigung schreibt einen Blocklist-Eintrag und nullt
          <code className="mx-1 px-1 bg-white/10 rounded">oa_url</code> im globalen Pool — neue User bekommen die DOI dann nicht mehr als OA angeboten,
          bestehende User-Einträge bleiben.
        </p>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
          ⚠️ {error}
        </div>
      )}

      <section>
        <h2 className="text-sm text-white font-medium mb-2">User-Markierungen ({overrides.length})</h2>
        {loading ? (
          <p className="text-xs text-gray-500">Lade…</p>
        ) : overrides.length === 0 ? (
          <p className="text-xs text-gray-500">Keine User-Markierungen vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {overrides.map(o => (
              <div key={o.doi} className="rounded-lg border border-white/10 bg-white/3 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <code className="text-[11px] font-mono text-blue-300 break-all">{o.doi}</code>
                      <span className="text-[10px] uppercase tracking-wider text-gray-500">
                        {o.user_count} User · seit {new Date(o.first_at).toLocaleDateString("de-CH")}
                      </span>
                      {o.in_blocklist && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                          ⛔ blocklisted
                        </span>
                      )}
                    </div>
                    {o.titles.length > 0 && (
                      <div className="space-y-0.5">
                        {o.titles.map((t, i) => (
                          <p key={i} className="text-xs text-gray-300 truncate" title={t}>{t}</p>
                        ))}
                      </div>
                    )}
                    {o.pool_oa_url && (
                      <p className="text-[10px] text-gray-500 mt-1 truncate">
                        Pool-OA: <a href={o.pool_oa_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 hover:underline">{o.pool_oa_url}</a>
                        {o.pool_oa_status && <span className="ml-2">({o.pool_oa_status})</span>}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col gap-1">
                    {!o.in_blocklist && (
                      <button onClick={() => confirmRemoval(o.doi)} disabled={busyDoi === o.doi}
                        className="px-2 py-1 rounded text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 transition-colors disabled:opacity-40"
                        title="Auf Blocklist setzen + oa_url im Pool nullen">
                        {busyDoi === o.doi ? "…" : "Bestätigen (entfernen)"}
                      </button>
                    )}
                    {o.pool_oa_url && (
                      <a href={o.pool_oa_url} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 text-center transition-colors">
                        Prüfen ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white font-medium mb-2">Blocklist ({blocklist.length})</h2>
        <p className="text-xs text-gray-500 mb-2">DOIs die für alle User als nicht-OA gelten. Re-Enrichment respektiert diese Liste.</p>
        {blocklist.length === 0 ? (
          <p className="text-xs text-gray-500">Leer.</p>
        ) : (
          <div className="space-y-1.5">
            {blocklist.map(b => (
              <div key={b.doi} className="flex items-center gap-3 rounded border border-white/8 bg-white/2 px-3 py-1.5">
                <code className="text-[11px] font-mono text-gray-400 truncate flex-1" title={b.doi}>{b.doi}</code>
                {b.pool_title && <span className="text-[11px] text-gray-500 truncate max-w-[300px]" title={b.pool_title}>{b.pool_title}</span>}
                <span className="text-[10px] text-gray-600">{new Date(b.removed_at).toLocaleDateString("de-CH")}</span>
                <button onClick={() => removeFromBlocklist(b.doi)} disabled={busyDoi === b.doi}
                  className="text-[10px] text-amber-300 hover:underline disabled:opacity-40 shrink-0">
                  Aus Blocklist
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
