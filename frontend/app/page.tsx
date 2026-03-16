"use client";

import { useRouter } from "next/navigation";
import { getSession, getDashboardPath } from "@/lib/auth";
import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/config";
import ImpressumModal from "@/components/ImpressumModal";

const SEGMENTS = [
  {
    key: "show_register_menschen" as const,
    icon: "🧑",
    label: "Menschen",
    desc: "Persönliche KI-Begleiter für jeden",
    href: "/register/person",
    color: "text-rose-300",
    border: "border-rose-800",
    bg: "bg-rose-950/30",
  },
  {
    key: "show_register_firmen" as const,
    icon: "🏢",
    label: "Firmen",
    desc: "Interne Assistenten & Teams",
    href: "/register/firma",
    color: "text-blue-300",
    border: "border-blue-800",
    bg: "bg-blue-950/30",
  },
  {
    key: "show_register_funktionen" as const,
    icon: "⚡",
    label: "Funktionen",
    desc: "Einzelne KI-Funktionen & Integrationen",
    href: "/register/funktionen",
    color: "text-violet-300",
    border: "border-violet-800",
    bg: "bg-violet-950/30",
  },
];

interface PortalSettings {
  show_login: boolean;
  show_register_menschen: boolean;
  show_register_firmen: boolean;
  show_register_funktionen: boolean;
  show_tagline: boolean;
}

const DEFAULTS: PortalSettings = {
  show_login: true,
  show_register_menschen: true,
  show_register_firmen: true,
  show_register_funktionen: true,
  show_tagline: true,
};

const CACHE_KEY = "portal_settings_cache";

export default function LandingPage() {
  const router = useRouter();
  const user = getSession();
  const [cfg, setCfg] = useState<PortalSettings | null>(null);
  const [showImpressum, setShowImpressum] = useState(false);

  useEffect(() => {
    if (user) { router.replace(getDashboardPath(user)); return; }

    // Load cached settings immediately so page shows while backend wakes up
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setCfg({ ...DEFAULTS, ...JSON.parse(cached) });
    } catch {}

    fetch(`${BACKEND_URL}/v1/settings/portal`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCfg({ ...DEFAULTS, ...data });
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
        }
      })
      .catch(() => {
        // Backend offline — keep cached value, fall back to DEFAULTS if nothing cached
        setCfg(c => c ?? DEFAULTS);
      });
  }, []);

  const visibleSegments = cfg ? SEGMENTS.filter(s => cfg[s.key]) : [];

  return (
    <>
      {/* Impressum-Modal */}
      {showImpressum && (
        <ImpressumModal onClose={() => setShowImpressum(false)} />
      )}

      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-between p-6">

        {/* ── Hauptinhalt (zentriert) ── */}
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <div className="max-w-xl w-full text-center space-y-10">

            <div className="space-y-3">
              <h1 className="text-5xl font-bold text-blue-400">Baddi</h1>
              {cfg?.show_tagline !== false && (
                <p className="text-gray-400 text-lg">Persönliche KI-Begleiter für Menschen und Unternehmen</p>
              )}
            </div>

            {visibleSegments.length > 0 && (
              <div className={`grid gap-4 ${visibleSegments.length === 1 ? "grid-cols-1 max-w-xs mx-auto" : visibleSegments.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
                {visibleSegments.map((s) => (
                  <div
                    key={s.label}
                    className={`${s.bg} border ${s.border} rounded-2xl p-5 flex flex-col items-center gap-3`}
                  >
                    <div className="text-4xl">{s.icon}</div>
                    <div className="space-y-0.5">
                      <p className={`font-bold text-sm ${s.color}`}>{s.label}</p>
                      <p className="text-gray-500 text-xs">{s.desc}</p>
                    </div>
                    <button
                      onClick={() => router.push(s.href)}
                      className={`w-full mt-auto text-xs font-semibold py-2 px-3 rounded-lg border ${s.border} ${s.color} hover:bg-white/5 transition-colors`}
                    >
                      Registrieren
                    </button>
                  </div>
                ))}
              </div>
            )}

            {cfg?.show_login && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => router.push("/login")}
                  className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-3 rounded-xl font-bold text-white text-lg"
                >
                  Anmelden
                </button>
              </div>
            )}

          </div>
        </div>

        {/* ── Footer mit Impressum-Link ── */}
        <footer className="w-full max-w-xl mt-10 pt-4 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
          <span>© {new Date().getFullYear()} AI Baddi GmbH · Bern, Schweiz</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowImpressum(true)}
              className="hover:text-gray-400 transition-colors underline underline-offset-2"
            >
              Impressum
            </button>
            <span className="text-gray-800">·</span>
            <span className="text-gray-700">v1.0</span>
          </div>
        </footer>

      </main>
    </>
  );
}
