"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { API_ROUTES } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

export default function AdminDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<ReturnType<typeof getSession>>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const u = getSession();
    setUser(u);
    setMounted(true);
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  if (!mounted || !user) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8 overflow-y-auto">
        <div className="flex items-center gap-3 md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
          <h1 className="text-lg font-bold text-yellow-400">Baddi Admin</h1>
        </div>

        <div>
          <h2 className="text-xl md:text-2xl font-bold">Willkommen, {user.name}</h2>
          <p className="text-gray-400 text-sm mt-1">Admin-Übersicht</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Kunden",          value: "—", color: "text-blue-400"   },
            { label: "Aktive Baddis",   value: "—", color: "text-green-400"  },
            { label: "Gespräche heute", value: "—", color: "text-purple-400" },
            { label: "Workflows",       value: "—", color: "text-yellow-400" },
          ].map((card) => (
            <div key={card.label} className="bg-gray-800 rounded-xl p-4 md:p-5 space-y-1 border border-gray-700">
              <p className="text-xs md:text-sm text-gray-400">{card.label}</p>
              <p className={`text-2xl md:text-3xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-800 rounded-xl p-4 md:p-6 border border-gray-700">
          <h3 className="font-semibold text-gray-200 mb-4">Schnellzugriff</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Dev Orchestrator",    href: "/admin/devtool",   icon: "🛠️" },
              { label: "Neuen Kunden anlegen",href: "/admin/customers", icon: "➕" },
              { label: "Baddi konfigurieren", href: "/admin/buddies",   icon: "🤖" },
              { label: "n8n Workflows",       href: "/admin/workflows", icon: "⚙️" },
              { label: "Metabase Analytik",   href: API_ROUTES.metabase,icon: "📊", external: true },
              { label: "API Docs",            href: API_ROUTES.apiDocs, icon: "📖", external: true },
              { label: "Portal-Einstellungen",href: "/admin/settings",  icon: "🔧" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => item.external ? window.open(item.href, "_blank") : router.push(item.href)}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-lg p-3 text-sm transition-colors text-left"
              >
                <span>{item.icon}</span>
                <span className="text-xs md:text-sm">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
