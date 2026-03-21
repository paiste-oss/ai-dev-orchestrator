"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BACKEND_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";

const PLANS = [
  {
    slug: "free",
    name: "Free",
    badge: "1 Monat gratis",
    price: "CHF 0",
    period: "/ 1 Monat",
    tokens: "200'000 Tokens",
    buddies: "1 Baddi",
    highlights: [
      "1 Monat kostenlos testen",
      "200'000 Tokens inklusive",
      "1 persönlicher Baddi",
      "Kein Kreditkarte nötig",
    ],
    color: "border-gray-700 hover:border-gray-500",
    badgeColor: "bg-gray-700 text-gray-200",
    btnClass: "bg-gray-700 hover:bg-gray-600 text-white",
  },
  {
    slug: "basis",
    name: "Basis",
    badge: null,
    price: "CHF 19",
    period: "/ Monat",
    tokens: "500'000 Tokens",
    buddies: "1 Baddi",
    highlights: [
      "500'000 Tokens/Monat",
      "1 persönlicher Baddi",
      "E-Mail-Support",
      "Langzeitgedächtnis",
    ],
    color: "border-indigo-500/50 hover:border-indigo-400",
    badgeColor: null,
    btnClass: "bg-indigo-600 hover:bg-indigo-500 text-white",
  },
  {
    slug: "komfort",
    name: "Komfort",
    badge: "Beliebt",
    price: "CHF 49",
    period: "/ Monat",
    tokens: "2'000'000 Tokens",
    buddies: "3 Baddis",
    highlights: [
      "2'000'000 Tokens/Monat",
      "3 Baddis",
      "SMS & Slack-Integration",
      "Prioritäts-Support",
    ],
    color: "border-violet-500/60 hover:border-violet-400 ring-1 ring-violet-500/30",
    badgeColor: "bg-violet-600 text-white",
    btnClass: "bg-violet-600 hover:bg-violet-500 text-white",
  },
  {
    slug: "premium",
    name: "Premium",
    badge: null,
    price: "CHF 99",
    period: "/ Monat",
    tokens: "10'000'000 Tokens",
    buddies: "10 Baddis",
    highlights: [
      "10'000'000 Tokens/Monat",
      "10 Baddis",
      "Alle Integrationen",
      "Dedizierter Support",
      "API-Zugang",
    ],
    color: "border-yellow-500/40 hover:border-yellow-400",
    badgeColor: "bg-yellow-500 text-gray-900",
    btnClass: "bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold",
  },
];

function PlanPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const firstName = params.get("name") || "du";
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) router.replace("/register");
  }, [router]);

  const choose = async (slug: string) => {
    setError("");
    setLoading(slug);
    try {
      if (slug === "free") {
        router.push("/chat");
        return;
      }
      const res = await fetch(`${BACKEND_URL}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ plan_slug: slug, billing_cycle: "monthly" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Fehler beim Starten der Zahlung.");
        return;
      }
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.slug}
              className={`relative bg-gray-900 rounded-2xl border p-6 flex flex-col gap-4 transition-all ${plan.color}`}
            >
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold ${plan.badgeColor}`}>
                  {plan.badge}
                </span>
              )}

              <div>
                <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                <div className="flex items-end gap-1 mt-1">
                  <span className="text-2xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-gray-500 text-sm pb-0.5">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                    {h}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => choose(plan.slug)}
                disabled={loading !== null}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${plan.btnClass}`}
              >
                {loading === plan.slug
                  ? "Wird geladen…"
                  : plan.slug === "free"
                  ? "Kostenlos starten →"
                  : "Auswählen →"}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-600">
          Alle Preise in CHF inkl. MwSt. · Jederzeit kündbar · Keine versteckten Kosten
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
