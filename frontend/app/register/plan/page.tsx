"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BACKEND_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";

interface Plan {
  id: string;
  slug: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
  included_tokens: number;
  daily_token_limit: number | null;
  requests_per_hour: number | null;
  features: { highlights?: string[] };
}

const PLAN_STYLE: Record<string, { color: string; badge: string; btn: string; trialBadge?: string }> = {
  basis:   {
    color: "border-indigo-500/50 hover:border-indigo-400",
    badge: "bg-indigo-600 text-white",
    btn:   "bg-indigo-600 hover:bg-indigo-500 text-white",
    trialBadge: "14 Tage gratis testen",
  },
  komfort: {
    color: "border-violet-500/60 hover:border-violet-400 ring-1 ring-violet-500/30",
    badge: "bg-violet-600 text-white",
    btn:   "bg-violet-600 hover:bg-violet-500 text-white",
  },
  premium: {
    color: "border-yellow-500/40 hover:border-yellow-400",
    badge: "bg-yellow-500 text-gray-900",
    btn:   "bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold",
  },
};

const POPULAR_SLUG = "komfort";

function PlanPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const firstName = params.get("name") || "du";

  const [plans, setPlans]     = useState<Plan[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!getToken()) { router.replace("/register"); return; }
    fetch(`${BACKEND_URL}/v1/billing/plans`)
      .then(r => r.json())
      .then(setPlans)
      .catch(() => setError("Pläne konnten nicht geladen werden."))
      .finally(() => setPlanLoading(false));
  }, [router]);

  const choose = async (slug: string) => {
    setError("");
    setLoading(slug);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ plan_slug: slug, billing_cycle: "monthly" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Fehler beim Starten der Zahlung."); return; }
      window.location.href = data.checkout_url;
    } catch {
      setError("Server nicht erreichbar. Bitte später nochmals versuchen.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-8">

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl mx-auto shadow-xl mb-4">
            🤖
          </div>
          <h1 className="text-3xl font-bold text-white">Willkommen, {firstName}!</h1>
          <p className="text-gray-400 text-sm">Wähle das passende Abo für deinen persönlichen Baddi.</p>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 border border-red-800/50 rounded-xl px-4 py-3 text-center">
            {error}
          </p>
        )}

        {planLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 rounded-2xl bg-gray-900 border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const style = PLAN_STYLE[plan.slug] ?? {
                color: "border-gray-700 hover:border-gray-500",
                badge: "bg-gray-700 text-white",
                btn: "bg-gray-700 hover:bg-gray-600 text-white",
              };
              const isPopular = plan.slug === POPULAR_SLUG;
              const badgeLabel = style.trialBadge ?? (isPopular ? "Beliebt" : null);

              return (
                <div
                  key={plan.id}
                  className={`relative bg-gray-900 rounded-2xl border p-6 flex flex-col gap-4 transition-all ${style.color}`}
                >
                  {badgeLabel && (
                    <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${style.badge}`}>
                      {badgeLabel}
                    </span>
                  )}

                  <div>
                    <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                    <div className="flex items-end gap-1 mt-1">
                      <span className="text-2xl font-extrabold text-white">CHF {plan.monthly_price.toFixed(0)}</span>
                      <span className="text-gray-500 text-sm pb-0.5">/ Monat</span>
                    </div>
                    {style.trialBadge && (
                      <p className="text-xs text-indigo-300 mt-0.5">danach CHF {plan.monthly_price.toFixed(0)}/Monat</p>
                    )}
                  </div>

                  <ul className="space-y-2 flex-1">
                    {(plan.features?.highlights ?? []).map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                        {h}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => choose(plan.slug)}
                    disabled={loading !== null}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${style.btn}`}
                  >
                    {loading === plan.slug
                      ? "Wird geladen…"
                      : plan.slug === "basis"
                      ? "Gratis testen →"
                      : "Auswählen →"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-600">
          Alle Preise in CHF inkl. MwSt. · Jederzeit kündbar · 14 Tage gratis beim Personal-Plan · Keine versteckten Kosten
        </p>
      </div>
    </main>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Lädt…</p>
      </div>
    }>
      <PlanPageContent />
    </Suspense>
  );
}
