"use client";

import { useRouter } from "next/navigation";
import { getSession, getDashboardPath } from "@/lib/auth";
import { useEffect, useState } from "react";
import ImpressumModal from "@/components/ImpressumModal";
import { BACKEND_URL } from "@/lib/config";

export default function LandingPage() {
  const router = useRouter();
  const user = getSession();
  const [showImpressum, setShowImpressum] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (user) router.replace(getDashboardPath(user));
    fetch(`${BACKEND_URL}/v1/settings/portal`)
      .then(r => r.json())
      .then(data => {
        setShowRegister(data.show_register_menschen === true);
        setShowLogin(data.show_login !== false);
      })
      .catch(() => {
        // Fallback: Login immer anzeigen, Register nicht
        setShowLogin(true);
      });
  }, []);

  return (
    <>
      {showImpressum && <ImpressumModal onClose={() => setShowImpressum(false)} />}

      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-between p-6 relative overflow-hidden">

        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/5 blur-3xl" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10">
          <div className="max-w-sm w-full text-center space-y-10">

            {/* Logo */}
            <div className="space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30 mb-2">
                <span className="text-white font-black text-2xl">B</span>
              </div>
              <h1 className="text-5xl font-bold text-white tracking-tight">Baddi</h1>
              <p className="text-gray-400 text-lg leading-relaxed">
                Dein persönlicher KI-Begleiter
              </p>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              {showRegister && (
                <button
                  onClick={() => router.push("/register")}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 transition-colors py-3.5 rounded-2xl font-bold text-base shadow-lg shadow-indigo-500/20"
                >
                  Jetzt registrieren
                </button>
              )}
              {showLogin && (
                <button
                  onClick={() => router.push("/login")}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors py-3.5 rounded-2xl font-bold text-base"
                >
                  Anmelden
                </button>
              )}
            </div>

          </div>
        </div>

        <footer className="relative z-10 w-full max-w-sm mt-10 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-700">
          <span>© {new Date().getFullYear()} AI Baddi GmbH · Bern, Schweiz</span>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowImpressum(true)} className="hover:text-gray-400 transition-colors">
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
