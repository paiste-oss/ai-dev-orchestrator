"use client";

import { useRouter } from "next/navigation";

interface BillingStatus {
  plan_name: string | null;
  plan_slug: string | null;
  subscription_status: string;
  billing_cycle: string;
  subscription_period_end: string | null;
  tokens_used_this_period: number;
  tokens_included: number;
  token_balance_chf: number;
  overage_rate_chf_per_1k: number;
  tos_accepted: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function statusColor(s: string) {
  if (s === "active") return "text-green-400 bg-green-400/10 border-green-400/20";
  if (s === "trialing") return "text-blue-400 bg-blue-400/10 border-blue-400/20";
  if (s === "past_due") return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  if (s === "canceled") return "text-red-400 bg-red-400/10 border-red-400/20";
  return "text-gray-400 bg-gray-400/10 border-gray-400/20";
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    active: "Aktiv",
    trialing: "Testphase",
    past_due: "Zahlung ausstehend",
    canceled: "Gekündigt",
    inactive: "Kein Abo",
  };
  return map[s] ?? s;
}

interface Props {
  status: BillingStatus;
  loading: boolean;
  onOpenPortal: () => void;
}

export default function CurrentPlanCard({ status, loading, onOpenPortal }: Props) {
  const router = useRouter();
  const isActive = status.subscription_status === "active" || status.subscription_status === "trialing";

  const tokenPct = Math.min(100, (status.tokens_used_this_period / Math.max(1, status.tokens_included)) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Aktueller Plan</p>
        <p className="text-base font-bold text-white">{status.plan_name ?? "Kein Abo"}</p>
        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(status.subscription_status)}`}>
          {statusLabel(status.subscription_status)}
        </span>
        {isActive && (
          <div className="pt-1">
            <button
              onClick={onOpenPortal}
              disabled={loading}
              className="text-[10px] text-gray-500 hover:text-white transition-colors underline underline-offset-2"
            >
              Karte / Abo verwalten →
            </button>
          </div>
        )}
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Tokens diesen Monat</p>
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold text-white">{formatTokens(status.tokens_used_this_period)}</span>
          <span className="text-xs text-gray-600">/ {formatTokens(status.tokens_included)}</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${tokenPct > 90 ? "bg-red-500" : tokenPct > 70 ? "bg-yellow-500" : "bg-blue-500"}`}
            style={{ width: `${tokenPct}%` }}
          />
        </div>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Prepaid-Guthaben</p>
        <p className="text-base font-bold text-white">CHF {status.token_balance_chf.toFixed(2)}</p>
        <p className="text-xs text-gray-600">
          Overage: CHF {(status.overage_rate_chf_per_1k * 100).toFixed(2)}/100k Tokens
        </p>
        <button
          onClick={() => router.push("/user/billing")}
          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          Wallet verwalten →
        </button>
      </div>
    </div>
  );
}
