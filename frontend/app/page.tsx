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
    border: "border-rose-800/60",
    bg: "bg-rose-950/20",
    glow: "group-hover:shadow-rose-500/10",
  },
  {
    key: "show_register_firmen" as const,
    icon: "🏢",
    label: "Firmen",
    desc: "Interne Assistenten & Teams",
    href: "/register/firma",
    color: "text-blue-300",
    border: "border-blue-800/60",
    bg: "bg-blue-950/20",
    glow: "group-hover:shadow-blue-500/10",
  },
  {
    key: "show_register_funktionen" as const,
    icon: "⚡",
    label: "Funktionen",
    desc: "Einzelne KI-Funktionen & Integrationen",
    href: "/register/funktionen",
    color: "text-violet-300",
    border: "border-violet-800/60",
    bg: "bg-violet-950/20",
    glow: "group-hover:shadow-violet-500/10",
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
  const user   = getSession();
  const [cfg,          setCfg]          = useState<PortalSettings | null>(null);
  const [showImpressum, setShowImpressum] = useState(false);

  useEffect(() => {
    if (user) { router.replace(getDashboardPath(user)); return; }

    // Gecachte Settings sofort laden
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
        setCfg(c => c ?? DEFAULTS);
      });
  }, []);

  const visibleSegments = cfg ? SEGMENTS.filter(s => cfg[s.key]) : [];

  return (
    <>
      {showImpressum && (
        <ImpressumModal onClose={() => setShowImpressum(false)} />
      )}

      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-between p-6 relative overflow-hidden">

        {/* Hintergrund-Glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/5 blur-3xl" />
        </div>

        {/* ── Hauptinhalt ── */}
        <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10">
          <div className="max-w-xl w-full text-center space-y-10 animate-fade-in">

            {/* Logo + Tagline */}
            <div className="space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 shadow-2xl shadow-blue-500/30 mb-2">
                <span className="text-white font-black text-2xl">B</span>
              </div>
              <h1 className="text-5xl font-bold text-white tracking-tight">Baddi</h1>
              {cfg?.show_tagline !== false && (
                <p className="text-gray-400 text-lg leading-relaxed">
                  Persönliche KI-Begleiter für<br className="hidden sm:block" /> Menschen und Unternehmen
                </p>
              )}
            </div>

            {/* Segment-Auswahl */}
            {visibleSegments.length > 0 && (
              <div className={`
                grid gap-3
                ${visibleSegments.length === 1
                  ? "grid-cols-1 max-w-xs mx-auto"
                  : visibleSegments.length === 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-3"
                }
              `}>
                {visibleSegments.map((s) => (
                  <div
                    key={s.label}
                    onClick={() => router.push(s.href)}
                    className={`
                      group relative ${s.bg} border ${s.border} rounded-2xl p-5
                      flex flex-col items-center gap-3 cursor-pointer
                      hover:bg-opacity-40 hover:border-opacity-80
                      hover:shadow-lg ${s.glow}
                      transition-all duration-200 hover:-translate-y-0.5
                    `}
                  >
                    <div className="text-4xl">{s.icon}</div>
                    <div className="space-y-0.5">
                      <p className={`font-bold text-sm ${s.color}`}>{s.label}</p>
                      <p className="text-gray-500 text-xs">{s.desc}</p>
                    </div>
                    <span className={`
                      w-full text-center text-xs font-semibold py-2 px-3 rounded-xl
                      border ${s.border} ${s.color}
                      group-hover:bg-white/5 transition-colors
                    `}>
                      Registrieren
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Login-Button */}
            {cfg?.show_login && (
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => router.push("/login")}
                  className="w-full bg-white text-gray-950 hover:bg-gray-100 transition-colors py-3.5 rounded-2xl font-bold text-base shadow-lg shadow-white/5"
                >
                  Anmelden
                </button>
                <p className="text-xs text-gray-700">
                  Bereits registriert? Einfach anmelden.
                </p>
              </div>
            )}

          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="relative z-10 w-full max-w-xl mt-10 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-700">
          <span>© {new Date().getFullYear()} AI Baddi GmbH · Bern, Schweiz</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowImpressum(true)}
              className="hover:text-gray-400 transition-colors"
            >
              Impressum
            </button>
            <span className="text-gray-800">·</span>
            <span>v1.0</span>
          </div>
        </footer>

      </main>
    </>
  );
}
