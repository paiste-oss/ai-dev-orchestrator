"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { chf } from "@/lib/wallet-utils";

interface BankTransfer {
  reference: string;
  amount_chf: number;
  iban: string;
  recipient: string;
  note: string;
}

interface Props {
  hasActiveSubscription: boolean;
}

const AMOUNTS = [10, 20, 50, 100];

export default function TopupModal({ hasActiveSubscription }: Props) {
  const [topupModal, setTopupModal] = useState<"stripe" | "bank" | null>(null);
  const [topupAmount, setTopupAmount] = useState("20");
  const [topupLoading, setTopupLoading] = useState(false);
  const [bankTransfer, setBankTransfer] = useState<BankTransfer | null>(null);
  const [topupError, setTopupError] = useState("");
  const [copied, setCopied] = useState("");

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

  return (
    <>
      {/* Aufladen Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Token-Guthaben aufladen</h2>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-1 rounded-lg">Nur für Overage-Tokens</span>
        </div>

        {!hasActiveSubscription ? (
          <div className="flex items-start gap-3 bg-yellow-950/20 border border-yellow-800/30 rounded-xl px-4 py-3">
            <span className="text-yellow-400 text-lg shrink-0">🔒</span>
            <div>
              <p className="text-sm font-medium text-yellow-300">Abo erforderlich</p>
              <p className="text-xs text-gray-400 mt-0.5">Token-Guthaben kann nur mit einem aktiven Abo aufgeladen werden.</p>
              <a href="/user/billing" className="inline-block mt-2 text-xs text-yellow-400 hover:text-yellow-300 underline underline-offset-2">Jetzt Abo abschliessen →</a>
            </div>
          </div>
        ) : (
          <>
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
              <p className="text-xs text-gray-600">Das Guthaben wird ausschliesslich für zusätzliche Tokens (Overage) verwendet.</p>
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
          </>
        )}
      </div>

      {/* Stripe Confirm */}
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

      {/* Bank Transfer Confirm / Result */}
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
    </>
  );
}
