"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { USE_CASES } from "@/lib/usecases";

export default function UserHub() {
  const router = useRouter();
  const user = getSession();

  useEffect(() => {
    if (!user || user.role !== "user") router.replace("/login");
  }, []);

  if (!user) return null;

  const active = USE_CASES.filter((uc) => uc.status === "active");
  const planned = USE_CASES.filter((uc) => uc.status === "coming_soon");

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-white">AI Buddy</h1>
          <p className="text-xs text-gray-500">Wähle deinen Begleiter</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user.name}</span>
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors"
          >
            Abmelden
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-10">
        {/* Aktive UseCases */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-gray-200">Dein Buddy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((uc) => (
              <button
                key={uc.id}
                onClick={() => router.push(`/user/${uc.id}`)}
                className={`${uc.bgColor} border ${uc.borderColor} rounded-2xl p-5 text-left hover:scale-[1.02] transition-transform space-y-3`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{uc.icon}</span>
                  <span className="text-xs bg-black/30 px-2 py-1 rounded-full text-gray-400">{uc.ageRange}</span>
                </div>
                <div>
                  <p className={`font-bold text-lg ${uc.color}`}>{uc.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{uc.tagline}</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{uc.description}</p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-400">Buddy:</span>
                  <span className={`text-xs font-semibold ${uc.color}`}>{uc.buddyName}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Geplante UseCases */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-gray-500">Bald verfügbar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {planned.map((uc) => (
              <div
                key={uc.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2 opacity-60"
              >
                <div className="text-2xl">{uc.icon}</div>
                <p className="font-semibold text-sm text-gray-400">{uc.name}</p>
                <p className="text-xs text-gray-600">{uc.ageRange}</p>
                <span className="inline-block text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
