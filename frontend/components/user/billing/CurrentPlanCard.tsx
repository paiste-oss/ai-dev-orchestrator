"use client";

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

function circleColor(s: string) {
  if (s === "active")    return "bg-green-400";
  if (s === "trialing")  return "bg-blue-400";
  if (s === "canceling") return "bg-orange-400";
  if (s === "past_due")  return "bg-yellow-400";
  if (s === "canceled")  return "bg-red-400";
  return "bg-gray-600";
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    active:    "Aktiv",
    trialing:  "Testphase",
    canceling: "Kündigung geplant",
    past_due:  "Zahlung ausstehend",
    canceled:  "Gekündigt",
    inactive:  "Kein Abo",
  };
  return map[s] ?? s;
}

interface Props {
  status: BillingStatus;
  loading: boolean;
  onOpenPortal: () => void;
}

export default function CurrentPlanCard({ status, loading, onOpenPortal }: Props) {
  const isActive = status.subscription_status === "active" || status.subscription_status === "trialing";
  const label = statusLabel(status.subscription_status);
  const planName = status.plan_name ?? "Kein Abo";

  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-3 h-3 rounded-full shrink-0 ${circleColor(status.subscription_status)}`} />
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-lg font-bold text-white">{planName}</span>
        {/* Only show status label if it differs from plan name */}
        {label !== planName && (
          <span className="text-xs text-gray-500">{label}</span>
        )}
        {isActive && (
          <button
            onClick={onOpenPortal}
            disabled={loading}
            className="text-[10px] text-gray-600 hover:text-white transition-colors underline underline-offset-2"
          >
            Karte / Abo verwalten →
          </button>
        )}
      </div>
    </div>
  );
}
