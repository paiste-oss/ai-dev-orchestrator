"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface CeleryTask {
  name: string;
  label: string;
  description: string;
  schedule: string;
  type: "scheduled" | "manual" | "event";
  cost: "lokal" | "api";
  cost_detail: string;
}

export default function BackendTasksPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tasks, setTasks] = useState<CeleryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggered, setTriggered] = useState<string | null>(null);

  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") router.replace("/login");
    apiFetch(`${BACKEND_URL}/v1/workflows/celery`)
      .then(r => r.json())
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const trigger = async (taskName: string) => {
    setTriggering(taskName);
    try {
      const res = await apiFetch(
        `${BACKEND_URL}/v1/workflows/celery/${encodeURIComponent(taskName)}/trigger`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error();
      setTriggered(taskName);
      setTimeout(() => setTriggered(null), 3000);
    } catch {
      alert("Fehler beim Auslösen des Tasks");
    } finally {
      setTriggering(null);
    }
  };


  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto">

        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">⏰ Backend Tasks</h1>
            <p className="text-gray-400 text-sm mt-0.5">Celery-Tasks — geplant und manuell auslösbar</p>
          </div>
        </div>

        {/* Info-Box */}
        <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl px-4 py-3 text-xs text-blue-300 space-y-0.5">
          <p className="font-semibold">ℹ️ Wie funktioniert das?</p>
          <p className="text-blue-400">Geplante Tasks laufen automatisch über Celery Beat. Mit «Jetzt starten» kannst du jeden Task sofort manuell auslösen.</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <span className="animate-spin text-2xl mr-3">⏳</span> Tasks werden geladen…
          </div>
        )}

        {!loading && (
          <div className="space-y-3">
            {tasks.map(task => (
              <div key={task.name} className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4">
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0 mt-0.5">
                    {task.type === "scheduled" ? "⏰" : task.type === "event" ? "⚡" : "▶️"}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm">{task.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        task.type === "scheduled"
                          ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                          : task.type === "event"
                          ? "bg-violet-500/10 text-violet-300 border-violet-500/20"
                          : "bg-gray-600/40 text-gray-400 border-gray-600/30"
                      }`}>
                        {task.schedule}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        task.cost === "lokal"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                      }`}>
                        {task.cost === "lokal" ? "🖥 Lokal" : "☁ API"}
                      </span>
                      <span className="text-xs text-gray-500">{task.cost_detail}</span>
                    </div>
                    <code className="text-[11px] text-gray-600 mt-1.5 block">{task.name}</code>
                  </div>

                  <button
                    onClick={() => trigger(task.name)}
                    disabled={triggering === task.name}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                      triggered === task.name
                        ? "border-green-500/30 text-green-300 bg-green-500/10"
                        : "border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                    }`}
                  >
                    {triggering === task.name ? "…" : triggered === task.name ? "✓ Gestartet" : "Jetzt starten"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
