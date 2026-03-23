"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface WalletStatus {
  monthly_limit_chf: number;
  per_tx_limit_chf: number;
  auto_topup_enabled: boolean;
  auto_topup_threshold_chf: number;
  auto_topup_amount_chf: number;
  has_saved_card: boolean;
}

interface Props {
  wallet: WalletStatus;
  onClose: () => void;
  onSaved: (updated: WalletStatus) => void;
}

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-yellow-400 transition-colors";

export default function WalletSettingsModal({ wallet, onClose, onSaved }: Props) {
  const [settings, setSettings] = useState({
    monthly_limit_chf: String(wallet.monthly_limit_chf),
    per_tx_limit_chf: String(wallet.per_tx_limit_chf),
    auto_topup_enabled: wallet.auto_topup_enabled,
    auto_topup_threshold_chf: String(wallet.auto_topup_threshold_chf),
    auto_topup_amount_chf: String(wallet.auto_topup_amount_chf),
  });
  const [saving, setSaving] = useState(false);

  async function saveSettings() {
    setSaving(true);
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
        onClose();
      }
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-bold text-white">Wallet-Einstellungen</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
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
          <button onClick={saveSettings} disabled={saving}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold py-2 rounded-xl text-sm transition-colors">
            {saving ? "Speichere…" : "Speichern"}
          </button>
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
