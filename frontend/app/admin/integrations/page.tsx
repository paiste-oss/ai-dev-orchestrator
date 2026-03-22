"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

interface WebhookEntry {
  name: string;
  url: string;
  description: string;
  manage_url: string;
  keys: string[];
}

interface ServiceItem {
  name: string;
  keys: string[];
  manage_url: string | null;
}

interface ServiceCategory {
  category: string;
  items: ServiceItem[];
}

interface IntegrationsData {
  webhooks: WebhookEntry[];
  services: ServiceCategory[];
  key_status: Record<string, boolean>;
}

function KeyBadge({ envKey, status }: { envKey: string; status: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md font-mono
      ${status
        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
        : "bg-red-500/10 text-red-400 border border-red-500/20"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status ? "bg-emerald-400" : "bg-red-400"}`} />
      {envKey}
    </span>
  );
}

export default function IntegrationsPage() {
  const router = useRouter();
  const [mounted, setMounted]       = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData]             = useState<IntegrationsData | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    setMounted(true);
    const user = getSession();
    if (!user || user.role !== "admin") router.replace("/login");
  }, []);

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/v1/admin/integrations`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (!mounted) return null;

  const allOk = data
    ? Object.values(data.key_status).every(Boolean)
    : false;

  const missingCount = data
    ? Object.values(data.key_status).filter(v => !v).length
    : 0;

  return (
    <div className="h-[100dvh] bg-gray-950 text-white flex overflow-hidden">

      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Header */}
        <header className="bg-gray-900/80 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-400 hover:text-white text-xl"
          >☰</button>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-white leading-none">Integrationen</h1>
            <p className="text-[10px] text-gray-600 mt-0.5">Webhooks, API Keys & externe Dienste</p>
          </div>
          {!loading && (
            <div className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
              allOk
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {allOk ? "Alle Keys gesetzt" : `${missingCount} Key${missingCount !== 1 ? "s" : ""} fehlt`}
            </div>
          )}
        </header>

        {loading && (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
            Lädt…
          </div>
        )}

        {data && (
          <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto w-full space-y-8">

            {/* Webhooks */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Webhooks</h2>
              <div className="space-y-3">
                {data.webhooks.map(wh => {
                  const allSet = wh.keys.every(k => data.key_status[k]);
                  return (
                    <div key={wh.name} className="bg-gray-900 border border-white/5 rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${allSet ? "bg-emerald-400" : "bg-red-400"}`} />
                            <span className="text-sm font-medium text-white">{wh.name}</span>
                          </div>
                          <p className="text-xs text-gray-500">{wh.description}</p>
                        </div>
                        <a
                          href={wh.manage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-[11px] text-gray-500 hover:text-yellow-400 border border-white/10 hover:border-yellow-500/30 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Verwalten ↗
                        </a>
                      </div>
                      <div className="bg-gray-950/60 rounded-lg px-3 py-2 font-mono text-xs text-gray-300 break-all">
                        {wh.url}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {wh.keys.map(k => (
                          <KeyBadge key={k} envKey={k} status={data.key_status[k]} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Services nach Kategorie */}
            {data.services.map(cat => (
              <section key={cat.category}>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  {cat.category}
                </h2>
                <div className="bg-gray-900 border border-white/5 rounded-xl divide-y divide-white/5">
                  {cat.items.map(item => {
                    const allSet = item.keys.every(k => data.key_status[k]);
                    const anyMissing = item.keys.some(k => !data.key_status[k]);
                    return (
                      <div key={item.name} className="flex items-center gap-4 px-4 py-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          allSet ? "bg-emerald-400" : anyMissing ? "bg-red-400" : "bg-gray-600"
                        }`} />
                        <span className="text-sm text-gray-300 w-40 shrink-0">{item.name}</span>
                        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                          {item.keys.map(k => (
                            <KeyBadge key={k} envKey={k} status={data.key_status[k]} />
                          ))}
                        </div>
                        {item.manage_url && (
                          <a
                            href={item.manage_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-[11px] text-gray-600 hover:text-yellow-400 transition-colors"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

          </div>
        )}
      </div>
    </div>
  );
}
