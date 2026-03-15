"use client";

import { useRouter } from "next/navigation";
import { getSession, getDashboardPath } from "@/lib/auth";
import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/config";

const SEGMENTS = [
  {
    key: "show_register_person" as const,
    icon: "👴",
    label: "Ältere Menschen",
    desc: "Gesellschaft & Unterstützung",
    href: "/register/person",
    color: "text-rose-300",
    border: "border-rose-800",
    bg: "bg-rose-950/30",
  },
  {
    key: "show_register_firma" as const,
    icon: "🏢",
    label: "Unternehmen",
    desc: "Interne Assistenten & Teams",
    href: "/register/firma",
    color: "text-blue-300",
    border: "border-blue-800",
    bg: "bg-blue-950/30",
  },
  {
    key: "show_register_allgemein" as const,
    icon: "🌍",
    label: "Alle",
    desc: "Persönliche Begleiter",
    href: "/register/allgemein",
    color: "text-green-300",
    border: "border-green-800",
    bg: "bg-green-950/30",
  },
];

interface PortalSettings {
  show_login: boolean;
  show_register_person: boolean;
  show_register_firma: boolean;
  show_register_allgemein: boolean;
}

const DEFAULTS: PortalSettings = {
  show_login: true,
  show_register_person: true,
  show_register_firma: true,
  show_register_allgemein: true,
};

export default function LandingPage() {
  const router = useRouter();
  const user = getSession();
  const [cfg, setCfg] = useState<PortalSettings | null>(null);

  useEffect(() => {
    if (user) { router.replace(getDashboardPath(user)); return; }
    fetch(`${BACKEND_URL}/v1/settings/portal`)
      .then(r => r.ok ? r.json() : DEFAULTS)
      .then(setCfg)
      .catch(() => setCfg(DEFAULTS));
  }, []);

  const visibleSegments = cfg ? SEGMENTS.filter(s => cfg[s.key]) : [];

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full text-center space-y-10">

        <div className="space-y-3">
          <h1 className="text-5xl font-bold text-blue-400">Baddi</h1>
          <p className="text-gray-400 text-lg">Persönliche KI-Begleiter für Menschen und Unternehmen</p>
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
    </main>
  );
}
