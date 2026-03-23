"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { CustomerUsage, MODEL_DISPLAY, fmtBytes } from "@/lib/customer-admin-utils";

interface Props {
  customerId: string;
}

export default function CustomerUsageTab({ customerId }: Props) {
  const [usage, setUsage] = useState<CustomerUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/usage`);
      if (res.ok) setUsage(await res.json());
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !usage) return <p className="text-sm text-gray-500">Verbrauchsdaten werden geladen…</p>;
  if (!usage) return <p className="text-sm text-gray-500">Keine Daten verfügbar.</p>;

  const storagePct = usage.storage.limit_bytes > 0
    ? Math.min(100, (usage.storage.used_bytes / usage.storage.limit_bytes) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
        >
          <span className={loading ? "animate-spin" : ""}>↻</span>
          Aktualisieren
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tokens gesamt",    value: usage.tokens.total.toLocaleString("de-CH"),             icon: "🪙" },
          { label: "Geschätzte Kosten", value: `CHF ${usage.tokens.cost_chf_total.toFixed(4)}`,       icon: "💸" },
          { label: "Konversationen",   value: usage.messages.threads,                                  icon: "💬" },
          { label: "Nachrichten",      value: usage.messages.total,                                    icon: "✉️" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-1">
            <p className="text-xl">{kpi.icon}</p>
            <p className="text-2xl font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Token-Verbrauch nach Modell */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Token-Verbrauch nach Modell</h3>
          <span className="text-xs text-gray-500">Dieser Zeitraum: {usage.tokens.this_period.toLocaleString("de-CH")} Tokens</span>
        </div>
        {Object.keys(usage.tokens.by_model).length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Nutzung erfasst.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 text-xs text-gray-400 font-semibold uppercase">Modell</th>
                <th className="text-left py-2 text-xs text-gray-400 font-semibold uppercase">Typ</th>
                <th className="text-right py-2 text-xs text-gray-400 font-semibold uppercase">Nachrichten</th>
                <th className="text-right py-2 text-xs text-gray-400 font-semibold uppercase">Tokens</th>
                <th className="text-right py-2 text-xs text-gray-400 font-semibold uppercase">Kosten CHF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {Object.entries(usage.tokens.by_model).map(([model, d]) => (
                <tr key={model}>
                  <td className="py-2 text-gray-300 text-xs">{MODEL_DISPLAY[model] ?? model}</td>
                  <td className="py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                      d.type === "lokal"
                        ? "bg-green-950/30 border-green-800/40 text-green-400"
                        : "bg-blue-950/30 border-blue-800/40 text-blue-300"
                    }`}>{d.type === "lokal" ? "Lokal" : "API"}</span>
                  </td>
                  <td className="py-2 text-right text-gray-400 text-xs">{d.messages}</td>
                  <td className="py-2 text-right font-mono text-yellow-400 text-xs">{d.tokens.toLocaleString("de-CH")}</td>
                  <td className="py-2 text-right font-mono text-xs text-gray-300">{d.cost_chf.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-600">
                <td colSpan={2} className="py-2 font-semibold text-white text-xs">Total</td>
                <td className="py-2 text-right font-semibold text-white text-xs">{usage.messages.total}</td>
                <td className="py-2 text-right font-mono font-bold text-yellow-400 text-xs">{usage.tokens.total.toLocaleString("de-CH")}</td>
                <td className="py-2 text-right font-mono font-bold text-white text-xs">CHF {usage.tokens.cost_chf_total.toFixed(4)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="text-[10px] text-gray-600">{usage.compute.note}</p>
      </div>

      {/* Speicher */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Speicher</h3>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{fmtBytes(usage.storage.used_bytes)} belegt</span>
          <span>{fmtBytes(usage.storage.limit_bytes)} gesamt</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${storagePct > 90 ? "bg-red-500" : storagePct > 70 ? "bg-orange-500" : "bg-blue-500"}`}
            style={{ width: `${storagePct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-700/50 rounded-lg p-3">
            <p className="text-gray-500">Plan-Limit</p>
            <p className="font-semibold text-white">{fmtBytes(usage.storage.plan_bytes)}</p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3">
            <p className="text-gray-500">Add-on</p>
            <p className="font-semibold text-white">{fmtBytes(usage.storage.extra_bytes)}</p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-3">
            <p className="text-gray-500">Dokumente</p>
            <p className="font-semibold text-white">{usage.storage.documents}</p>
          </div>
        </div>
      </div>

      {/* Gedächtnis & Compute */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Gedächtnis-Einträge</p>
          <p className="text-2xl font-bold text-white">{usage.memory.entries}</p>
          <p className="text-xs text-gray-500">Langzeit-Erinnerungen in Qdrant</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Rechenleistung</p>
          <div className="flex gap-3 text-xs mt-1">
            <div>
              <p className="text-gray-500">API-Tokens</p>
              <p className="font-semibold text-blue-300">{usage.compute.api_tokens.toLocaleString("de-CH")}</p>
            </div>
            <div>
              <p className="text-gray-500">Lokal-Tokens</p>
              <p className="font-semibold text-green-300">{usage.compute.local_tokens.toLocaleString("de-CH")}</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">Strom/CPU-Tracking bräuchte Server-Monitoring (Prometheus)</p>
        </div>
      </div>
    </div>
  );
}
