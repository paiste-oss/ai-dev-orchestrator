"use client";

import { useRouter } from "next/navigation";
import { getSession, getDashboardPath } from "@/lib/auth";
import { useEffect } from "react";

export default function LandingPage() {
  const router = useRouter();
  const user = getSession();

  useEffect(() => {
    // Eingeloggter Nutzer direkt zum Dashboard
    if (user) router.replace(getDashboardPath(user));
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-5xl font-bold text-blue-400">AI Buddy</h1>
          <p className="text-gray-400 text-lg">
            Persönliche KI-Begleiter für Menschen und Unternehmen
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            { icon: "👴", label: "Ältere Menschen", desc: "Gesellschaft & Unterstützung" },
            { icon: "🏢", label: "Unternehmen", desc: "Interne Assistenten" },
            { icon: "🌍", label: "Alle", desc: "Persönliche Begleiter" },
          ].map((item) => (
            <div key={item.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-1">
              <div className="text-2xl">{item.icon}</div>
              <div className="font-semibold text-gray-200">{item.label}</div>
              <div className="text-gray-500 text-xs">{item.desc}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-3 rounded-xl font-bold text-white text-lg"
          >
            Anmelden
          </button>
          <button
            onClick={() => router.push("/portal")}
            className="w-full bg-gray-800 hover:bg-gray-700 transition-colors py-3 rounded-xl text-gray-300 border border-gray-700"
          >
            Developer Portal öffnen
          </button>
        </div>
      </div>
    </main>
  );
}
