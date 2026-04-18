"use client";

import { useState } from "react";

interface Plan {
  id: string;
  name: string;
  slug: string;
  monthly_price: number;
  yearly_price: number;
  yearly_monthly_equivalent: number;
  yearly_discount_percent: number;
  included_tokens: number;
  token_overage_chf_per_1k: number;
  max_buddies: number;
  features: { highlights?: string[]; allowed_services?: string[] };
  sort_order: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

const TRIAL_SLUG = "basis";

function PlanCard({
  plan,
  isCurrentPlan,
  cycle,
  onSelect,
  loading,
}: {
  plan: Plan;
  isCurrentPlan: boolean;
  cycle: "monthly" | "yearly";
  onSelect: () => void;
  loading: boolean;
}) {
  const price = cycle === "yearly" ? plan.yearly_monthly_equivalent : plan.monthly_price;
  const highlights = plan.features?.highlights ?? [];
  const hasTrial = plan.slug === TRIAL_SLUG && !isCurrentPlan;

  return (
    <div className={`
      relative rounded-2xl border p-5 flex flex-col gap-4 transition-all
      ${isCurrentPlan
        ? "border-blue-500/60 bg-blue-500/5 shadow-lg shadow-blue-500/10"
        : "border-white/10 bg-white/2 hover:border-white/20"}
    `}>
      {isCurrentPlan && (
        <span className="absolute -top-2.5 left-4 text-[10px] font-bold bg-blue-500 text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          Aktiv
        </span>
      )}
      {hasTrial && (
        <span className="absolute -top-2.5 left-4 text-[10px] font-bold bg-green-500 text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          2 Wochen gratis
        </span>
      )}

      <div>
        <p className="text-base font-bold text-white">{plan.name}</p>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-2xl font-black text-white">CHF {price.toFixed(2)}</span>
          <span className="text-xs text-gray-500">/Monat</span>
        </div>
        {hasTrial && (
          <p className="text-xs text-green-400 mt-0.5">
            Erste 2 Wochen kostenlos · danach CHF {price.toFixed(2)}/Monat
          </p>
        )}
        {cycle === "yearly" && plan.yearly_discount_percent > 0 && (
          <p className="text-xs text-green-400 mt-0.5">
            −{plan.yearly_discount_percent}% bei Jahresabo (CHF {plan.yearly_price.toFixed(2)}/Jahr)
          </p>
        )}
      </div>

      <ul className="space-y-1.5 flex-1">
        <li className="flex items-center gap-2 text-xs text-gray-300">
          <span className="text-blue-400">✓</span>
          {formatTokens(plan.included_tokens)} Tokens/Monat inklusive
        </li>
        <li className="flex items-center gap-2 text-xs text-gray-400">
          <span className="text-gray-600">·</span>
          Overage: CHF {(plan.token_overage_chf_per_1k * 100).toFixed(2)}/100k Tokens
        </li>
        {highlights.filter(h => !/tokens/i.test(h)).map((h) => (
          <li key={h} className="flex items-center gap-2 text-xs text-gray-300">
            <span className="text-blue-400">✓</span>
            {h}
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={loading || isCurrentPlan}
        className={`
          w-full py-2.5 rounded-xl text-xs font-semibold transition-all border
          ${isCurrentPlan
            ? "border-blue-500/30 text-blue-400 cursor-default"
            : "border-white/10 bg-white/5 text-white hover:bg-blue-500 hover:border-blue-500"}
          disabled:opacity-50
        `}
      >
        {isCurrentPlan ? "Aktueller Plan" : `${plan.name} wählen`}
      </button>
    </div>
  );
}

interface Props {
  plans: Plan[];
  currentPlanSlug: string | null;
  currentStatus: string;
  loading: boolean;
  onSelectPlan: (slug: string, cycle: "monthly" | "yearly") => void;
}

export default function PlanGrid({ plans, currentPlanSlug, currentStatus, loading, onSelectPlan }: Props) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-end">
        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-all ${
                cycle === c ? "bg-blue-500 text-white shadow" : "text-gray-400 hover:text-white"
              }`}
            >
              {c === "monthly" ? "Monatlich" : "Jährlich"}
              {c === "yearly" && <span className="ml-1.5 text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">−20%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrentPlan={currentPlanSlug === plan.slug && (currentStatus === "active" || currentStatus === "trialing")}
            cycle={cycle}
            onSelect={() => onSelectPlan(plan.slug, cycle)}
            loading={loading}
          />
        ))}
      </div>

    </section>
  );
}
