"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { USE_CASES, getUseCasesBySegment, UseCaseSegment, UseCase } from "@/lib/usecases";
import AdminSidebar from "@/components/AdminSidebar";

interface Props {
  segment: UseCaseSegment;
  title: string;
  description: string;
}

function UseCaseCard({ uc }: { uc: UseCase }) {
  return (
    <div className={`${uc.bgColor} border ${uc.borderColor} rounded-2xl p-5 space-y-3 flex flex-col`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{uc.icon}</span>
          <div>
            <p className={`font-bold text-sm ${uc.color}`}>{uc.name}</p>
            <p className="text-xs text-gray-400 font-medium">{uc.buddyName}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
          uc.status === "active"
            ? "bg-green-500/10 text-green-300 border-green-500/20"
            : "bg-gray-600/20 text-gray-500 border-gray-600/20"
        }`}>
          {uc.status === "active" ? "Aktiv" : "Bald verfügbar"}
        </span>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed flex-1">{uc.tagline}</p>

      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span className="text-xs text-gray-600">{uc.ageRange}</span>
        <span className="text-xs text-gray-600 font-mono">{uc.id}</span>
      </div>
    </div>
  );
}

export default function BuddiesSegmentPage({ segment, title, description }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const u = getSession();
    setMounted(true);
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  const useCases = getUseCasesBySegment(segment);
  const active = useCases.filter(uc => uc.status === "active");
  const comingSoon = useCases.filter(uc => uc.status === "coming_soon");

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto">

        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">🤖 {title}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{description} · {active.length} aktiv</p>
          </div>
        </div>

        {/* Aktive Baddis */}
        {active.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Aktive AI Baddis</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {active.map(uc => <UseCaseCard key={uc.id} uc={uc} />)}
            </div>
          </div>
        )}

        {/* Coming Soon */}
        {comingSoon.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">In Entwicklung</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
              {comingSoon.map(uc => <UseCaseCard key={uc.id} uc={uc} />)}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
