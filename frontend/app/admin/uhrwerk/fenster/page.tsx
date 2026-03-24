"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import { WINDOW_MODULES, WindowModuleDefinition } from "@/lib/window-registry";

const STATUS_BADGE: Record<WindowModuleDefinition["status"], { label: string; cls: string }> = {
  active:       { label: "Aktiv",        cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  beta:         { label: "Beta",         cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
  coming_soon:  { label: "Bald",         cls: "bg-gray-500/15 text-gray-500 border-gray-500/20" },
};

export default function FensterPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function openInChat(mod: WindowModuleDefinition) {
    // Canvas-State direkt in localStorage vorbereiten, dann zum Chat navigieren
    try {
      const existing = JSON.parse(localStorage.getItem("baddi_canvas_cards") ?? "[]");
      const offset = (existing.length - 1) * 20;
      const newCard = {
        id: `${mod.canvasType}-${Date.now()}`,
        title: `${mod.icon} ${mod.label}`,
        type: mod.canvasType,
        x: 40 + offset,
        y: 40 + offset,
        width: mod.defaultWidth,
        height: mod.defaultHeight,
        minimized: false,
        zIndex: 99,
        data: {},
      };
      localStorage.setItem("baddi_canvas_cards", JSON.stringify([...existing, newCard]));
    } catch { /* ignore */ }
    router.push("/chat");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 overflow-y-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Fenster</h1>
          <p className="text-gray-400 text-sm mt-1">
            Verfügbare Fenster-Module für den Chat-Canvas. Öffne beliebige Module über den „+" Button im Chat.
          </p>
        </div>

        {/* Module Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {WINDOW_MODULES.map(mod => {
            const badge = STATUS_BADGE[mod.status];
            const isAvailable = mod.status !== "coming_soon";
            return (
              <div
                key={mod.id}
                className={`rounded-2xl border p-5 flex flex-col gap-4 transition-all ${
                  isAvailable
                    ? "border-white/8 bg-white/3 hover:bg-white/5 hover:border-white/12"
                    : "border-white/4 bg-white/1 opacity-60"
                }`}
              >
                {/* Icon + Badge */}
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-xl bg-white/6 flex items-center justify-center text-2xl">
                    {mod.icon}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Name + Description */}
                <div>
                  <h3 className="font-semibold text-white text-base">{mod.label}</h3>
                  <p className="text-gray-400 text-sm mt-1 leading-relaxed">{mod.description}</p>
                </div>

                {/* Default size */}
                <p className="text-gray-600 text-xs">
                  Standard: {mod.defaultWidth} × {mod.defaultHeight} px
                </p>

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2">
                  <button
                    onClick={() => isAvailable && openInChat(mod)}
                    disabled={!isAvailable}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all border disabled:cursor-not-allowed
                      bg-indigo-600 hover:bg-indigo-500 border-indigo-500/50 text-white disabled:bg-white/5 disabled:border-white/8 disabled:text-gray-600"
                  >
                    Im Chat öffnen
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info Box */}
        <div className="mt-10 rounded-2xl border border-white/6 bg-white/2 p-6">
          <h2 className="font-semibold text-white mb-2">Wie funktioniert es?</h2>
          <ul className="text-gray-400 text-sm space-y-2">
            <li>→ Im Chat über den <span className="text-white font-medium">„+" Button</span> in der Topbar ein Modul öffnen</li>
            <li>→ Fenster sind <span className="text-white font-medium">verschiebbar, skalierbar und minimierbar</span></li>
            <li>→ Whiteboard-Inhalte werden <span className="text-white font-medium">automatisch im Backend gespeichert</span></li>
            <li>→ Der Canvas-Zustand (Position, Grösse) bleibt nach dem Reload erhalten</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
