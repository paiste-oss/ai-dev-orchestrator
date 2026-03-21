"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, getToken, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

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
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_extra_bytes: number;
}

interface StorageAddon {
  key: string;
  label: string;
  bytes: number;
  price_chf: number;
  description: string;
}

interface Invoice {
  id: string;
  invoice_number: string | null;
  amount_chf: number;
  description: string;
  payment_type: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

interface BankTransfer {
  reference: string;
  amount_chf: number;
  iban: string;
  recipient: string;
  note: string;
}

function chf(n: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);
}

function fmtBytes(b: number) {
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function WalletPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Top-up modal
  const [topupModal, setTopupModal] = useState<"stripe" | "bank" | null>(null);
  const [topupAmount, setTopupAmount] = useState("20");
  const [topupLoading, setTopupLoading] = useState(false);
  const [bankTransfer, setBankTransfer] = useState<BankTransfer | null>(null);
  const [topupError, setTopupError] = useState("");

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    monthly_limit_chf: "",
    per_tx_limit_chf: "",
    auto_topup_enabled: false,
    auto_topup_threshold_chf: "",
    auto_topup_amount_chf: "",
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [copied, setCopied] = useState("");

  // Storage add-ons
  const [addons, setAddons] = useState<StorageAddon[]>([]);
  const [addonBuying, setAddonBuying] = useState<string | null>(null);
  const [addonMsg, setAddonMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!getSession()) { router.replace("/login"); return; }
    load();
  }, []);

  if (!mounted) return null;

  async function load() {
    setLoading(true);
    try {
      const [wRes, iRes, aRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/billing/wallet`),
        apiFetch(`${BACKEND_URL}/v1/billing/invoices`),
        apiFetch(`${BACKEND_URL}/v1/billing/storage/addons`),
      ]);
      if (wRes.ok) {
        const w: WalletStatus = await wRes.json();
        setWallet(w);
        setSettings({
          monthly_limit_chf: String(w.monthly_limit_chf),
          per_tx_limit_chf: String(w.per_tx_limit_chf),
          auto_topup_enabled: w.auto_topup_enabled,
          auto_topup_threshold_chf: String(w.auto_topup_threshold_chf),
          auto_topup_amount_chf: String(w.auto_topup_amount_chf),
        });
      }
      if (iRes.ok) setInvoices(await iRes.json());
      if (aRes.ok) setAddons(await aRes.json());
    } finally { setLoading(false); }
  }

  async function buyAddon(key: string) {
    setAddonMsg(null);
    setAddonBuying(key);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/billing/storage/addon`, {
        method: "POST",
        body: JSON.stringify({ addon_key: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddonMsg({ text: data.detail || "Fehler", ok: false });
      } else {
        setAddonMsg({ text: `${data.addon} hinzugefügt ✓ · Neues Guthaben: CHF ${data.new_balance_chf.toFixed(2)}`, ok: true });
        await load();
      }
    } finally { setAddonBuying(null); }
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
    setSettingsSaving(true);
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
      if (res.ok) { setWallet(await res.json()); setSettingsOpen(false); }
    } finally { setSettingsSaving(false); }
  }

  function copy(val: string, key: string) {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  const AMOUNTS = [10, 20, 50, 100];

  const TYPE_LABEL: Record<string, string> = {
    topup: "Aufladung (Karte)",
    auto_topup: "Auto-Aufladung",
    bank_transfer: "Banküberweisung",
    wallet_debit: "Ausgabe",
    subscription: "Abo-Zahlung",
  };

  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-yellow-400 transition-colors";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-xl font-bold">Wallet</h1>
            <p className="text-xs text-gray-500">Guthaben, Limits & Transaktionen</p>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-gray-600 py-16">Lade…</p>
        ) : wallet ? (
          <>
            {/* ── Balance Card ── */}
            <div className="bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/20 rounded-2xl p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Guthaben</p>
                  <p className="text-4xl font-extrabold text-yellow-400 mt-1">{chf(wallet.balance_chf)}</p>
                </div>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="text-gray-500 hover:text-white text-xs px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  ⚙ Einstellungen
                </button>
              </div>

              {/* Monatslimit */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Monatsausgaben</span>
                  <span>{chf(wallet.monthly_spent_chf)} / {chf(wallet.monthly_limit_chf)}</span>
                </div>
                <ProgressBar
                  value={wallet.monthly_spent_chf}
                  max={wallet.monthly_limit_chf}
                  color={wallet.monthly_spent_chf / wallet.monthly_limit_chf > 0.8 ? "bg-red-500" : "bg-yellow-500"}
                />
                <p className="text-xs text-gray-600">Noch {chf(wallet.monthly_remaining_chf)} verfügbar · Max. {chf(wallet.per_tx_limit_chf)} pro Transaktion</p>
              </div>

              {/* Auto-Topup Badge */}
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
                wallet.auto_topup_enabled
                  ? "bg-green-950/40 border-green-800/40 text-green-400"
                  : "bg-gray-800/60 border-gray-700 text-gray-500"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${wallet.auto_topup_enabled ? "bg-green-400" : "bg-gray-600"}`} />
                {wallet.auto_topup_enabled
                  ? `Auto-Nachzahlen: ${chf(wallet.auto_topup_amount_chf)} wenn < ${chf(wallet.auto_topup_threshold_chf)}`
                  : "Auto-Nachzahlen deaktiviert"}
              </div>
            </div>

            {/* ── Aufladen ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-white">Guthaben aufladen</h2>

              {/* Betrag wählen */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Betrag (CHF)</p>
                <div className="flex gap-2 flex-wrap">
                  {AMOUNTS.map(a => (
                    <button
                      key={a}
                      onClick={() => setTopupAmount(String(a))}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        topupAmount === String(a)
                          ? "bg-yellow-400/10 border-yellow-400/50 text-yellow-400"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {chf(a)}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="5"
                    max="500"
                    value={topupAmount}
                    onChange={e => setTopupAmount(e.target.value)}
                    className="w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-yellow-400"
                    placeholder="Betrag"
                  />
                </div>
              </div>

              {/* Methode wählen */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setTopupModal("stripe"); setBankTransfer(null); setTopupError(""); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-indigo-800/50 bg-indigo-950/30 hover:bg-indigo-950/50 transition-colors"
                >
                  <span className="text-2xl">💳</span>
                  <span className="text-sm font-medium text-indigo-300">Kreditkarte</span>
                  <span className="text-xs text-gray-500">Sofort via Stripe</span>
                </button>
                <button
                  onClick={() => { setTopupModal("bank"); setBankTransfer(null); setTopupError(""); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-cyan-800/50 bg-cyan-950/30 hover:bg-cyan-950/50 transition-colors"
                >
                  <span className="text-2xl">🏦</span>
                  <span className="text-sm font-medium text-cyan-300">Banküberweisung</span>
                  <span className="text-xs text-gray-500">1–2 Werktage</span>
                </button>
              </div>
            </div>

            {/* ── Stripe Confirm Modal ── */}
            {topupModal === "stripe" && (
              <div className="bg-gray-900 border border-indigo-800/40 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-indigo-300">Kreditkarte — {chf(parseFloat(topupAmount) || 0)}</h3>
                  <button onClick={() => setTopupModal(null)} className="text-gray-500 hover:text-white">✕</button>
                </div>
                {topupError && <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2">{topupError}</p>}
                <button
                  onClick={doStripeTopup}
                  disabled={topupLoading || !topupAmount || parseFloat(topupAmount) < 5}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {topupLoading ? "Weiterleitung…" : `${chf(parseFloat(topupAmount) || 0)} via Stripe bezahlen →`}
                </button>
                <p className="text-xs text-gray-600 text-center">Sicherer Checkout via Stripe. Du wirst weitergeleitet.</p>
              </div>
            )}

            {/* ── Bank Transfer Confirm / Result ── */}
            {topupModal === "bank" && (
              <div className="bg-gray-900 border border-cyan-800/40 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-cyan-300">Banküberweisung — {chf(parseFloat(topupAmount) || 0)}</h3>
                  <button onClick={() => { setTopupModal(null); setBankTransfer(null); }} className="text-gray-500 hover:text-white">✕</button>
                </div>
                {topupError && <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2">{topupError}</p>}

                {!bankTransfer ? (
                  <>
                    <p className="text-xs text-gray-400">Nach dem Klick erhältst du die Zahlungsdetails mit einer eindeutigen Referenz. Das Guthaben wird nach Eingang manuell gutgeschrieben (1–2 Werktage).</p>
                    <button
                      onClick={doBankTopup}
                      disabled={topupLoading || !topupAmount || parseFloat(topupAmount) < 10}
                      className="w-full py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                      {topupLoading ? "Generiere…" : "Zahlungsdetails anzeigen →"}
                    </button>
                    <p className="text-xs text-gray-600 text-center">Mindestbetrag CHF 10.00 für Banküberweisung.</p>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-green-400 font-medium">Bitte überweise exakt den angegebenen Betrag mit der Referenz:</p>
                    {[
                      { label: "Empfänger", value: bankTransfer.recipient },
                      { label: "IBAN", value: bankTransfer.iban },
                      { label: "Betrag", value: chf(bankTransfer.amount_chf) },
                      { label: "Referenz / Zahlungszweck", value: bankTransfer.reference },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className="text-sm font-mono text-white">{value}</p>
                        </div>
                        <button onClick={() => copy(value, label)} className="text-gray-500 hover:text-yellow-400 text-xs px-2 py-1 rounded-lg hover:bg-yellow-400/10 transition-colors">
                          {copied === label ? "✓" : "⎘"}
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-gray-500">{bankTransfer.note}</p>
                    <p className="text-xs text-yellow-500/70 bg-yellow-950/20 border border-yellow-900/30 rounded-xl px-3 py-2">
                      Das Guthaben wird nach Eingang der Zahlung manuell gutgeschrieben (1–2 Werktage).
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Speicher ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-white">Speicher</h2>

              {/* Usage bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Belegt</span>
                  <span>
                    {fmtBytes(wallet.storage_used_bytes)} / {fmtBytes(wallet.storage_limit_bytes + wallet.storage_extra_bytes)}
                    {wallet.storage_extra_bytes > 0 && (
                      <span className="ml-1 text-yellow-400/70">(+{fmtBytes(wallet.storage_extra_bytes)} Add-on)</span>
                    )}
                  </span>
                </div>
                <ProgressBar
                  value={wallet.storage_used_bytes}
                  max={wallet.storage_limit_bytes + wallet.storage_extra_bytes}
                  color={
                    wallet.storage_used_bytes / (wallet.storage_limit_bytes + wallet.storage_extra_bytes) > 0.9
                      ? "bg-red-500"
                      : wallet.storage_used_bytes / (wallet.storage_limit_bytes + wallet.storage_extra_bytes) > 0.7
                        ? "bg-orange-500"
                        : "bg-blue-500"
                  }
                />
              </div>

              {/* Add-on options */}
              {addons.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Zusatzspeicher kaufen (einmalig vom Guthaben):</p>
                  {addonMsg && (
                    <p className={`text-xs px-3 py-2 rounded-xl border ${addonMsg.ok ? "bg-green-950/30 border-green-800/40 text-green-400" : "bg-red-950/30 border-red-900/40 text-red-400"}`}>
                      {addonMsg.text}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {addons.map(a => (
                      <button
                        key={a.key}
                        onClick={() => buyAddon(a.key)}
                        disabled={addonBuying === a.key}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl border border-gray-700 bg-gray-800 hover:border-blue-600/50 hover:bg-blue-950/20 transition-colors disabled:opacity-50"
                      >
                        <span className="text-base font-bold text-blue-300">+{a.label}</span>
                        <span className="text-xs font-semibold text-white">{chf(a.price_chf)}</span>
                        <span className="text-xs text-gray-500">{addonBuying === a.key ? "Kaufe…" : "Sofort"}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600">Speicher wird sofort vom Wallet-Guthaben abgezogen und dauerhaft hinzugefügt.</p>
                </div>
              )}
            </div>

            {/* ── Transaktionshistorie ── */}
            {invoices.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="font-semibold text-white">Transaktionen</h2>
                </div>
                <div className="divide-y divide-gray-800/50">
                  {invoices.slice(0, 20).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm text-white">{inv.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {TYPE_LABEL[inv.payment_type] ?? inv.payment_type}
                          {inv.invoice_number && <span className="ml-2 font-mono">{inv.invoice_number}</span>}
                          <span className="ml-2">{new Date(inv.created_at).toLocaleDateString("de-CH")}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${
                          inv.payment_type === "wallet_debit" ? "text-red-400" : "text-green-400"
                        }`}>
                          {inv.payment_type === "wallet_debit" ? "−" : "+"}{chf(inv.amount_chf)}
                        </p>
                        <span className={`text-xs ${inv.status === "succeeded" ? "text-gray-600" : "text-yellow-500"}`}>
                          {inv.status === "succeeded" ? "✓" : inv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-gray-600 py-16">Wallet nicht verfügbar.</p>
        )}
      </div>

      {/* ── Settings Modal ── */}
      {settingsOpen && wallet && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white">Wallet-Einstellungen</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Limits */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ausgabelimits</p>
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
              </div>

              {/* Auto-Topup */}
              <div className="space-y-3 border-t border-gray-800 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Auto-Nachzahlen</p>
                  <button
                    onClick={() => setSettings(s => ({ ...s, auto_topup_enabled: !s.auto_topup_enabled }))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${settings.auto_topup_enabled ? "bg-yellow-400" : "bg-gray-700"}`}
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
                    Für Auto-Nachzahlen benötigst du eine gespeicherte Karte. Lade das Wallet einmal via Stripe auf — deine Karte wird automatisch gespeichert.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
              <button onClick={saveSettings} disabled={settingsSaving}
                className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold py-2 rounded-xl text-sm transition-colors">
                {settingsSaving ? "Speichere…" : "Speichern"}
              </button>
              <button onClick={() => setSettingsOpen(false)}
                className="px-5 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
