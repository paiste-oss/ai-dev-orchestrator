"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { chf, fmtBytes } from "@/lib/wallet-utils";

interface StorageAddon {
  key: string;
  label: string;
  bytes: number;
  price_chf: number;
  description: string;
}

interface WalletStatus {
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_extra_bytes: number;
  storage_addon_items: { key: string; bytes: number; added_at: string }[];
  has_active_subscription: boolean;
}

interface Props {
  wallet: WalletStatus;
  addons: StorageAddon[];
  onAddonPurchased: () => void;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function StorageAddons({ wallet, addons, onAddonPurchased }: Props) {
  const [addonBuying, setAddonBuying] = useState<string | null>(null);
  const [addonMsg, setAddonMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const totalStorage = wallet.storage_limit_bytes + wallet.storage_extra_bytes;
  const usagePct = totalStorage > 0 ? wallet.storage_used_bytes / totalStorage : 0;

  const storageColor = usagePct > 0.9 ? "bg-red-500" : usagePct > 0.7 ? "bg-orange-500" : "bg-blue-500";

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
        setAddonMsg({ text: `+${data.label} Speicher hinzugefügt ✓ — wird monatlich zum Abo verrechnet`, ok: true });
        onAddonPurchased();
      }
    } finally { setAddonBuying(null); }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">Speicher</p>
      {/* Usage bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Belegt</span>
          <span>
            {fmtBytes(wallet.storage_used_bytes)} / {fmtBytes(totalStorage)}
            {wallet.storage_extra_bytes > 0 && (
              <span className="ml-1 text-yellow-400/70">(+{fmtBytes(wallet.storage_extra_bytes)} Add-on)</span>
            )}
          </span>
        </div>
        <ProgressBar value={wallet.storage_used_bytes} max={totalStorage} color={storageColor} />
      </div>

      {/* Add-on options */}
      {addons.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Zusatzspeicher buchen:</p>
            <span className="text-[10px] text-blue-400 bg-blue-950/30 border border-blue-800/30 px-2 py-0.5 rounded-lg">Monatlich zum Abo</span>
          </div>

          {!wallet.has_active_subscription ? (
            <div className="flex items-start gap-3 bg-yellow-950/20 border border-yellow-800/30 rounded-xl px-3 py-2.5">
              <span className="text-yellow-400 shrink-0">🔒</span>
              <div>
                <p className="text-xs font-medium text-yellow-300">Abo erforderlich</p>
                <p className="text-xs text-gray-500 mt-0.5">Speicher Add-ons sind nur mit einem aktiven Abo buchbar.</p>
                <a href="/user/billing" className="inline-block mt-1 text-xs text-yellow-400 hover:text-yellow-300 underline underline-offset-2">Abo abschliessen →</a>
              </div>
            </div>
          ) : (
            <>
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
                    <span className="text-xs font-semibold text-white">{chf(a.price_chf)}/Mt.</span>
                    <span className="text-xs text-gray-500">{addonBuying === a.key ? "Buche…" : "Zum Abo"}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600">
                Wird monatlich zusammen mit deinem Abo abgerechnet.
                {wallet.storage_addon_items.length > 0 && (
                  <span className="ml-1 text-blue-400">
                    {wallet.storage_addon_items.length} aktive{wallet.storage_addon_items.length === 1 ? "s" : ""} Add-on{wallet.storage_addon_items.length > 1 ? "s" : ""}.
                  </span>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
