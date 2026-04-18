"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { chf } from "@/lib/wallet-utils";

interface WalletStatus {
  balance_chf: number;
  monthly_limit_chf: number;
  per_tx_limit_chf: number;
  monthly_spent_chf: number;
  monthly_remaining_chf: number;
  auto_topup_enabled: boolean;
  auto_topup_threshold_chf: number;
  auto_topup_amount_chf: number;
  has_saved_card: boolean;
  has_active_subscription: boolean;
}

interface BankTransfer {
  reference: string;
  amount_chf: number;
  iban: string;
  recipient: string;
  note: string;
}

interface Props {
  wallet: WalletStatus;
  overageRateChfPer1k: number;
  onSaved: (updated: Partial<WalletStatus>) => void;
}

const AMOUNTS = [10, 20, 50, 100];

const inputCls =
  "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors";

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function WalletPanel({ wallet, overageRateChfPer1k, onSaved }: Props) {
  const [topupMode, setTopupMode] = useState<"stripe" | "bank" | null>(null);
  const [topupAmount, setTopupAmount] = useState("20");
  const [topupLoading, setTopupLoading] = useState(false);
  const [bankTransfer, setBankTransfer] = useState<BankTransfer | null>(null);
  const [topupError, setTopupError] = useState("");
  const [copied, setCopied] = useState("");

  const [settings, setSettings] = useState({
    monthly_limit_chf: String(wallet.monthly_limit_chf),
    per_tx_limit_chf: String(wallet.per_tx_limit_chf),
    auto_topup_enabled: wallet.auto_topup_enabled,
    auto_topup_threshold_chf: String(wallet.auto_topup_threshold_chf),
    auto_topup_amount_chf: String(wallet.auto_topup_amount_chf),
  });
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  function copy(val: string, key: string) {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  async function doStripeTopup() {
    setTopupError("");
    setTopupLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/billing/wallet/topup/stripe`, {
        method: "POST",
        body: JSON.stringify({ amount_chf: parseFloat(topupAmount) }),
      });
      const data = await res.json();
      if (!res.ok) { setTopupError(data.detail || "Fehler"); return; }
      window.location.href = data.checkout_url;
    } finally { setTopupLoading(false); }
  }

  async function doBankTopup() {
    setTopupError("");
    setTopupLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/billing/wallet/topup/bank`, {
        method: "POST",
        body: JSON.stringify({ amount_chf: parseFloat(topupAmount) }),
      });
      const data = await res.json();
      if (!res.ok) { setTopupError(data.detail || "Fehler"); return; }
      setBankTransfer(data);
    } finally { setTopupLoading(false); }
  }

  async function saveSettings() {
    setSaving(true);
    setSaveOk(false);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/billing/wallet/settings`, {
        method: "PUT",
        body: JSON.stringify({
          monthly_limit_chf: parseFloat(settings.monthly_limit_chf) || null,
          per_tx_limit_chf: parseFloat(settings.per_tx_limit_chf) || null,
          auto_topup_enabled: settings.auto_topup_enabled,
          auto_topup_threshold_chf: parseFloat(settings.auto_topup_threshold_chf) || null,
          auto_topup_amount_chf: parseFloat(settings.auto_topup_amount_chf) || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSaved(updated);
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 3000);
      }
    } finally { setSaving(false); }
  }

  const spendColor =
    wallet.monthly_spent_chf / wallet.monthly_limit_chf > 0.8 ? "bg-red-500" : "bg-blue-500";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800">

      {/* ── Zeile 1: Aktuelles Guthaben + Aufladen nebeneinander ──────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-800">

        {/* Aktuelles Guthaben */}
        <div className="p-5 space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Aktuelles Guthaben</p>
          <p className="text-xl font-bold text-white">{chf(wallet.balance_chf)}</p>
          <p className="text-xs text-gray-600 pt-0.5">
            Overage: CHF {(overageRateChfPer1k * 100).toFixed(2)}/100k Tokens
          </p>
          {wallet.auto_topup_enabled && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg text-xs font-medium border bg-green-950/40 border-green-800/40 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              Auto: {chf(wallet.auto_topup_amount_chf)} wenn &lt; {chf(wallet.auto_topup_threshold_chf)}
            </div>
          )}
        </div>

        {/* Aufladen */}
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Guthaben aufladen</p>

          {!wallet.has_active_subscription ? (
            <div className="flex items-start gap-2 bg-yellow-950/20 border border-yellow-800/30 rounded-xl px-3 py-2.5">
              <span className="text-yellow-400 shrink-0">🔒</span>
              <div>
                <p className="text-xs font-medium text-yellow-300">Abo erforderlich</p>
                <p className="text-xs text-gray-400 mt-0.5">Nur mit aktivem Abo aufladbar.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 flex-wrap items-center">
                {AMOUNTS.map(a => (
                  <button
                    key={a}
                    onClick={() => setTopupAmount(String(a))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      topupAmount === String(a)
                        ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    {chf(a)}
                  </button>
                ))}
                <input
                  type="number" min="5" max="500"
                  value={topupAmount}
                  onChange={e => setTopupAmount(e.target.value)}
                  className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                  placeholder="CHF"
                />
              </div>
              <p className="text-xs text-gray-600">Für zusätzliche Tokens (Overage).</p>

              {topupMode === null && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setTopupMode("stripe"); setBankTransfer(null); setTopupError(""); }}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-indigo-800/50 bg-indigo-950/30 hover:bg-indigo-950/50 transition-colors"
                  >
                    <span>💳</span>
                    <div className="text-left">
                      <p className="text-xs font-medium text-indigo-300">Kreditkarte</p>
                      <p className="text-[10px] text-gray-500">Sofort via Stripe</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setTopupMode("bank"); setBankTransfer(null); setTopupError(""); }}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-cyan-800/50 bg-cyan-950/30 hover:bg-cyan-950/50 transition-colors"
                  >
                    <span>🏦</span>
                    <div className="text-left">
                      <p className="text-xs font-medium text-cyan-300">Banküberweisung</p>
                      <p className="text-[10px] text-gray-500">1–2 Werktage</p>
                    </div>
                  </button>
                </div>
              )}

              {topupMode === "stripe" && (
                <div className="bg-indigo-950/20 border border-indigo-800/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-indigo-300">Kreditkarte — {chf(parseFloat(topupAmount) || 0)}</p>
                    <button onClick={() => setTopupMode(null)} className="text-gray-500 hover:text-white text-xs">✕</button>
                  </div>
                  {topupError && <p className="text-red-400 text-xs">{topupError}</p>}
                  <button
                    onClick={doStripeTopup}
                    disabled={topupLoading || parseFloat(topupAmount) < 5}
                    className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                  >
                    {topupLoading ? "Weiterleitung…" : `${chf(parseFloat(topupAmount) || 0)} via Stripe →`}
                  </button>
                </div>
              )}

              {topupMode === "bank" && (
                <div className="bg-cyan-950/20 border border-cyan-800/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-cyan-300">Banküberweisung — {chf(parseFloat(topupAmount) || 0)}</p>
                    <button onClick={() => { setTopupMode(null); setBankTransfer(null); }} className="text-gray-500 hover:text-white text-xs">✕</button>
                  </div>
                  {topupError && <p className="text-red-400 text-xs">{topupError}</p>}
                  {!bankTransfer ? (
                    <>
                      <p className="text-xs text-gray-400">Eindeutige Referenz, Gutschrift nach 1–2 Werktagen.</p>
                      <button
                        onClick={doBankTopup}
                        disabled={topupLoading || parseFloat(topupAmount) < 10}
                        className="w-full py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                      >
                        {topupLoading ? "Generiere…" : "Zahlungsdetails →"}
                      </button>
                      <p className="text-[10px] text-gray-600">Min. CHF 10.00.</p>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      {[
                        { label: "Empfänger", value: bankTransfer.recipient },
                        { label: "IBAN", value: bankTransfer.iban },
                        { label: "Betrag", value: chf(bankTransfer.amount_chf) },
                        { label: "Referenz", value: bankTransfer.reference },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-[10px] text-gray-500">{label}</p>
                            <p className="text-xs font-mono text-white">{value}</p>
                          </div>
                          <button onClick={() => copy(value, label)} className="text-gray-500 hover:text-blue-400 text-xs px-1.5 py-0.5 rounded transition-colors">
                            {copied === label ? "✓" : "⎘"}
                          </button>
                        </div>
                      ))}
                      <p className="text-[10px] text-yellow-500/70">{bankTransfer.note}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Monatsausgaben ─────────────────────────────────────────────────────── */}
      <div className="p-5 space-y-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Monatsausgaben</p>

        {/* Laufbalken */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Verbraucht</span>
            <span>{chf(wallet.monthly_spent_chf)} / {chf(wallet.monthly_limit_chf)}</span>
          </div>
          <ProgressBar value={wallet.monthly_spent_chf} max={wallet.monthly_limit_chf} color={spendColor} />
          <p className="text-xs text-gray-600">
            Noch {chf(wallet.monthly_remaining_chf)} verfügbar · Max. {chf(wallet.per_tx_limit_chf)} pro Transaktion
          </p>
        </div>

        {/* Limits */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">Max. / Monat (CHF)</label>
            <input type="number" step="10" min="0" value={settings.monthly_limit_chf}
              onChange={e => setSettings(s => ({ ...s, monthly_limit_chf: e.target.value }))}
              className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">Max. / Transaktion (CHF)</label>
            <input type="number" step="5" min="0" value={settings.per_tx_limit_chf}
              onChange={e => setSettings(s => ({ ...s, per_tx_limit_chf: e.target.value }))}
              className={inputCls} />
          </div>
        </div>

        {/* Auto-Topup */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">Auto-Nachzahlen</p>
            <button
              onClick={() => setSettings(s => ({ ...s, auto_topup_enabled: !s.auto_topup_enabled }))}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.auto_topup_enabled ? "bg-blue-500" : "bg-gray-700"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.auto_topup_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {settings.auto_topup_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Auslösen wenn &lt; (CHF)</label>
                <input type="number" step="1" min="1" value={settings.auto_topup_threshold_chf}
                  onChange={e => setSettings(s => ({ ...s, auto_topup_threshold_chf: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Nachzahlen (CHF)</label>
                <input type="number" step="5" min="5" value={settings.auto_topup_amount_chf}
                  onChange={e => setSettings(s => ({ ...s, auto_topup_amount_chf: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>
          )}

          {settings.auto_topup_enabled && !wallet.has_saved_card && (
            <p className="text-xs text-yellow-500 bg-yellow-950/20 border border-yellow-900/30 rounded-xl px-3 py-2">
              Für Auto-Nachzahlen benötigst du eine gespeicherte Karte. Lade das Wallet einmal via Stripe auf — deine Karte wird dann gespeichert.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-white/8 border border-white/10 hover:bg-white/12 text-white text-xs font-semibold disabled:opacity-40 transition-all"
          >
            {saving ? "Speichere…" : "Speichern"}
          </button>
          {saveOk && <span className="text-xs text-green-400">✓ Gespeichert</span>}
        </div>
      </div>

    </div>
  );
}
