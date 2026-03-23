"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { WalletStatus, fmtBytes, inputCls } from "@/lib/customer-admin-utils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

interface Props {
  customerId: string;
}

export default function CustomerWalletTab({ customerId }: Props) {
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("Manuelle Gutschrift durch Admin");
  const [crediting, setCrediting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/billing/admin/wallet/${customerId}`);
      if (res.ok) setWallet(await res.json());
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const doCredit = async () => {
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) return;
    setCrediting(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/billing/admin/wallet/credit`, {
        method: "POST",
        body: JSON.stringify({ customer_id: customerId, amount_chf: amount, description: creditNote }),
      });
      if (res.ok) {
        const d = await res.json();
        setMsg({ text: `CHF ${amount.toFixed(2)} gutgeschrieben ✓  |  Rechnung: ${d.invoice_number}  |  Neues Guthaben: CHF ${d.new_balance_chf.toFixed(2)}`, ok: true });
        setCreditAmount("");
        await load();
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ text: e.detail ?? "Fehler beim Gutschreiben", ok: false });
      }
    } finally {
      setCrediting(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Wird geladen…</p>;
  if (!wallet) return <p className="text-sm text-red-400">Wallet-Daten nicht verfügbar.</p>;

  const spentPct = wallet.monthly_limit_chf > 0
    ? Math.min(100, (wallet.monthly_spent_chf / wallet.monthly_limit_chf) * 100)
    : 0;

  return (
    <div className="space-y-5">

      {/* KPI-Übersicht */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Guthaben", value: `CHF ${wallet.balance_chf.toFixed(2)}`, icon: "💰", highlight: wallet.balance_chf < 5 ? "text-red-400" : "text-white" },
          { label: "Monats-Limit", value: `CHF ${wallet.monthly_limit_chf.toFixed(2)}`, icon: "📅", highlight: "text-white" },
          { label: "Diesen Monat", value: `CHF ${wallet.monthly_spent_chf.toFixed(2)}`, icon: "📊", highlight: "text-white" },
          { label: "Per-Tx-Limit", value: `CHF ${wallet.per_tx_limit_chf.toFixed(2)}`, icon: "🔒", highlight: "text-white" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-1">
            <p className="text-xl">{kpi.icon}</p>
            <p className={`text-2xl font-bold ${kpi.highlight}`}>{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Monatlicher Verbrauch */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Monatsverbrauch</span>
          <span className="text-gray-300 font-mono">
            CHF {wallet.monthly_spent_chf.toFixed(2)} / {wallet.monthly_limit_chf.toFixed(2)}
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${spentPct > 80 ? "bg-red-500" : spentPct > 50 ? "bg-yellow-400" : "bg-green-400"}`}
            style={{ width: `${spentPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">
          Verbleibend: CHF {wallet.monthly_remaining_chf.toFixed(2)}
          {wallet.auto_topup_enabled && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 text-xs">
              Auto-Topup aktiv (ab CHF {wallet.auto_topup_threshold_chf.toFixed(2)} → +CHF {wallet.auto_topup_amount_chf.toFixed(2)})
              {wallet.has_saved_card ? " · Karte gespeichert" : " · ⚠ keine Karte"}
            </span>
          )}
        </p>
      </div>

      {/* Speicher */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Speicher</h3>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Belegt</span>
          <span className="text-gray-300 font-mono">
            {fmtBytes(wallet.storage_used_bytes)} / {fmtBytes(wallet.storage_limit_bytes + wallet.storage_extra_bytes)}
            {wallet.storage_extra_bytes > 0 && (
              <span className="ml-2 text-xs text-yellow-400/80">(+{fmtBytes(wallet.storage_extra_bytes)} Add-on)</span>
            )}
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          {(() => {
            const total = wallet.storage_limit_bytes + wallet.storage_extra_bytes;
            const pct = total > 0 ? Math.min(100, (wallet.storage_used_bytes / total) * 100) : 0;
            return (
              <div
                className={`h-full rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-orange-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            );
          })()}
        </div>
        <p className="text-xs text-gray-500">
          Plan-Limit: {fmtBytes(wallet.storage_limit_bytes)} · Add-on: {fmtBytes(wallet.storage_extra_bytes)} · Gesamt: {fmtBytes(wallet.storage_limit_bytes + wallet.storage_extra_bytes)}
        </p>
      </div>

      {/* Manuell Gutschreiben */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Manuell Gutschreiben</h3>
        <p className="text-xs text-gray-500">Wird als Rechnung erfasst (Banküberweisung-Bestätigung o.ä.).</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Betrag (CHF)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)}
              placeholder="z.B. 50.00"
              className={inputCls}
            />
          </Field>
          <Field label="Beschreibung">
            <input
              value={creditNote}
              onChange={e => setCreditNote(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Schnellauswahl */}
        <div className="flex flex-wrap gap-2">
          {[10, 20, 50, 100, 200].map(v => (
            <button
              key={v}
              onClick={() => setCreditAmount(v.toFixed(2))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                creditAmount === v.toFixed(2)
                  ? "bg-yellow-400 text-gray-900 border-yellow-400"
                  : "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
              }`}
            >
              CHF {v}
            </button>
          ))}
        </div>

        {msg && (
          <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? "bg-green-500/15 text-green-300 border border-green-500/30" : "bg-red-500/15 text-red-300 border border-red-500/30"}`}>
            {msg.text}
          </p>
        )}

        <button
          onClick={doCredit}
          disabled={crediting || !creditAmount || parseFloat(creditAmount) <= 0}
          className="px-5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {crediting ? "Wird gebucht…" : "Gutschreiben"}
        </button>
      </div>
    </div>
  );
}
