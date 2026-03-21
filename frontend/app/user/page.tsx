"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { USE_CASES } from "@/lib/usecases";

// ─── UseCase-Karte (aktiv) ────────────────────────────────────────────────────

function UseCaseCard({ uc, onOpen }: {
  uc: typeof USE_CASES[number];
  onOpen: () => void;
}) {
  return (
    <div className={`
      group relative overflow-hidden rounded-2xl border ${uc.borderColor} ${uc.bgColor}
      p-5 flex flex-col gap-4 transition-all duration-200
      hover:border-opacity-60 hover:-translate-y-0.5
    `}>
      {/* Icon + Alter */}
      <div className="flex items-start justify-between">
        <span className="text-3xl">{uc.icon}</span>
        <span className="text-xs bg-black/30 border border-white/5 px-2.5 py-1 rounded-full text-gray-400">
          {uc.ageRange}
        </span>
      </div>

      {/* Name + Tagline */}
      <div className="flex-1">
        <p className={`font-bold text-base ${uc.color} leading-tight`}>{uc.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{uc.tagline}</p>
      </div>

      {/* Baddi-Info */}
      <div className="flex items-center gap-2 py-2 border-t border-white/5">
        <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
          {uc.buddyName.charAt(0)}
        </div>
        <span className={`text-xs font-semibold ${uc.color}`}>{uc.buddyName}</span>
        <span className="text-xs text-gray-600 ml-0.5">· Dein Baddi</span>
      </div>

      {/* CTA */}
      <button
        onClick={onOpen}
        className={`
          w-full text-xs font-semibold py-2.5 px-4 rounded-xl border ${uc.borderColor} ${uc.color}
          hover:bg-white/5 transition-colors
        `}
      >
        {uc.id === "funktion-chat" ? "💬 Chat öffnen" : "Öffnen →"}
      </button>
    </div>
  );
}

// ─── Geplante Karte ───────────────────────────────────────────────────────────

function ComingSoonCard({ uc }: { uc: typeof USE_CASES[number] }) {
  return (
    <div className="relative bg-gray-900 border border-white/5 rounded-xl p-4 space-y-2 opacity-50">
      <span className="text-2xl">{uc.icon}</span>
      <p className="font-semibold text-sm text-gray-400">{uc.name}</p>
      <p className="text-xs text-gray-600">{uc.ageRange}</p>
      <span className="inline-block text-[10px] bg-white/5 border border-white/5 text-gray-500 px-2 py-0.5 rounded-full">
        Demnächst
      </span>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function UserHub() {
  const router   = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user,    setUser]    = useState<ReturnType<typeof getSession>>(null);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u)                      { router.replace("/login"); return; }
    if (u.role === "customer")   { router.replace("/chat");  return; }
    if (u.role !== "user")       { router.replace("/login"); return; }
  }, []);

  if (!mounted || !user) return null;

  const active  = USE_CASES.filter((uc) => uc.status === "active");
  const planned = USE_CASES.filter((uc) => uc.status === "coming_soon");

  const handleOpen = (uc: typeof USE_CASES[number]) => {
    if (uc.id === "funktion-chat") {
      router.push("/chat");
    } else {
      router.push(`/user/${uc.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-gray-950/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white font-black text-sm">B</span>
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-none">Baddi</p>
              <p className="text-[10px] text-gray-600 tracking-widest uppercase mt-0.5">Dein Begleiter</p>
            </div>
          </div>

          {/* User + Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-300">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-gray-400">{user.name}</span>
            </div>
            <button
              onClick={() => { clearSession(); router.push("/"); }}
              className="text-xs text-gray-600 hover:text-red-400 bg-white/5 hover:bg-red-500/5 border border-white/5 hover:border-red-500/20 px-3 py-1.5 rounded-lg transition-all"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      {/* ── Inhalt ── */}
      <main className="flex-1 p-5 md:p-8 max-w-5xl mx-auto w-full space-y-10 animate-fade-in">

        {/* Begrüßung */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            Hallo, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">Wähle deinen Baddi und starte das Gespräch</p>
        </div>

        {/* ── Aktive Baddis ── */}
        {active.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Deine Baddis
              </h2>
              <span className="text-xs text-gray-700">{active.length} aktiv</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {active.map((uc) => (
                <UseCaseCard key={uc.id} uc={uc} onOpen={() => handleOpen(uc)} />
              ))}
            </div>
          </section>
        )}

        {/* ── Coming Soon ── */}
        {planned.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Bald verfügbar
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {planned.map((uc) => (
                <ComingSoonCard key={uc.id} uc={uc} />
              ))}
            </div>
          </section>
        )}

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-4 px-5">
        <p className="text-xs text-gray-700 text-center">
          © {new Date().getFullYear()} AI Baddi GmbH · Bern, Schweiz
        </p>
      </footer>
    </div>
  );
}
