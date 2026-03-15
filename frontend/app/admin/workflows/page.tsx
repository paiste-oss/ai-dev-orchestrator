"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  tags?: { name: string }[];
}

export default function N8nWorkflowsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    const u = getSession();
    setMounted(true);
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/workflows`);
      const data = await res.json();
      setWorkflows(data?.data ?? data ?? []);
    } catch {
      setError("n8n nicht erreichbar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) load();
  }, [mounted, load]);

  const toggle = async (wf: N8nWorkflow) => {
    setToggling(wf.id);
    try {
      const action = wf.active ? "deactivate" : "activate";
      await apiFetch(`${BACKEND_URL}/v1/workflows/${wf.id}/${action}`, { method: "POST" });
      setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, active: !w.active } : w));
    } catch {
      alert("Fehler beim Umschalten");
    } finally {
      setToggling(null);
    }
  };

  if (!mounted) return null;

  const active = workflows.filter(w => w.active).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto">

        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl md:hidden">☰</button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold">🔗 n8n Workflows</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {loading ? "Wird geladen…" : `${workflows.length} Workflows · ${active} aktiv`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs bg-gray-800 border border-gray-700 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            ↻ Aktualisieren
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <span className="animate-spin text-2xl mr-3">⏳</span> Workflows werden geladen…
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <span className="text-3xl">⚠️</span>
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={load} className="text-xs bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors">
              Erneut versuchen
            </button>
          </div>
        )}

        {!loading && !error && workflows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-500">
            <span className="text-3xl">📭</span>
            <p className="text-sm">Keine n8n-Workflows gefunden.</p>
            <p className="text-xs">Erstelle Workflows direkt in n8n.</p>
          </div>
        )}

        {!loading && !error && workflows.length > 0 && (
          <div className="space-y-3">
            {workflows.map(wf => (
              <div key={wf.id} className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 flex items-center gap-4">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${wf.active ? "bg-green-400" : "bg-gray-500"}`} />

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{wf.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      wf.active
                        ? "bg-green-500/10 text-green-300 border-green-500/20"
                        : "bg-gray-600/40 text-gray-400 border-gray-600/30"
                    }`}>
                      {wf.active ? "Aktiv" : "Inaktiv"}
                    </span>
                    {wf.tags?.map(t => (
                      <span key={t.name} className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{t.name}</span>
                    ))}
                    {wf.updatedAt && (
                      <span className="text-xs text-gray-600">
                        {new Date(wf.updatedAt).toLocaleDateString("de-CH")}
                      </span>
                    )}
                    <span className="text-xs text-gray-700 font-mono">ID: {wf.id}</span>
                  </div>
                </div>

                <button
                  onClick={() => toggle(wf)}
                  disabled={toggling === wf.id}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                    wf.active
                      ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                      : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                  }`}
                >
                  {toggling === wf.id ? "…" : wf.active ? "Deaktivieren" : "Aktivieren"}
                </button>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
