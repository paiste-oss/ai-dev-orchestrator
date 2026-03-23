"use client";

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
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface Props {
  wallet: WalletStatus;
  onOpenSettings: () => void;
}

export default function WalletBalanceCard({ wallet, onOpenSettings }: Props) {
  return (
    <div className="bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/20 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Guthaben</p>
          <p className="text-4xl font-extrabold text-yellow-400 mt-1">{chf(wallet.balance_chf)}</p>
        </div>
        <button
          onClick={onOpenSettings}
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
        <p className="text-xs text-gray-600">
          Noch {chf(wallet.monthly_remaining_chf)} verfügbar · Max. {chf(wallet.per_tx_limit_chf)} pro Transaktion
        </p>
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
  );
}
