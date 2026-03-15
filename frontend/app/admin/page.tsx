"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { API_ROUTES } from "@/lib/config";

const NAV = [
  { label: "Dashboard", href: "/admin", icon: "🏠" },
  { label: "Kunden", href: "/admin/customers", icon: "👥" },
  { label: "AI Buddies", href: "/admin/buddies", icon: "🤖" },
  { label: "Workflows", href: "/admin/workflows", icon: "⚙️" },
  { label: "Analytik", href: "/admin/analytics", icon: "📊" },
  { label: "Portal", href: "/portal", icon: "🔬" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const user = getSession();

  useEffect(() => {
    if (!user || user.role !== "admin") router.replace("/login");
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-4 space-y-1">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-yellow-400">AI Buddy</h1>
          <p className="text-xs text-gray-500">Admin</p>
        </div>
        {NAV.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className="flex items-center gap-3 text-sm text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-2 rounded transition-colors text-left"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { clearSession(); router.push("/"); }}
          className="flex items-center gap-3 text-sm text-gray-500 hover:text-red-400 px-3 py-2 rounded transition-colors"
        >
          <span>🚪</span><span>Abmelden</span>
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold">Willkommen, {user.name}</h2>
          <p className="text-gray-400 text-sm mt-1">Admin-Übersicht</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Kunden", value: "—", color: "text-blue-400" },
            { label: "Aktive Buddies", value: "—", color: "text-green-400" },
            { label: "Gespräche heute", value: "—", color: "text-purple-400" },
            { label: "Workflows", value: "—", color: "text-yellow-400" },
          ].map((card) => (
            <div key={card.label} className="bg-gray-800 rounded-xl p-5 space-y-1 border border-gray-700">
              <p className="text-sm text-gray-400">{card.label}</p>
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="font-semibold text-gray-200 mb-4">Schnellzugriff</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Neuen Kunden anlegen", href: "/admin/customers", icon: "➕" },
              { label: "Buddy konfigurieren", href: "/admin/buddies", icon: "🤖" },
              { label: "n8n Workflows", href: "/admin/workflows", icon: "⚙️" },
              { label: "Metabase Analytik", href: API_ROUTES.metabase, icon: "📊", external: true },
              { label: "API Docs", href: API_ROUTES.apiDocs, icon: "📖", external: true },
              { label: "Portal öffnen", href: "/portal", icon: "🔬" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => item.external ? window.open(item.href, "_blank") : router.push(item.href)}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-lg p-3 text-sm transition-colors text-left"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
