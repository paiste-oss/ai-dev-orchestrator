"use client";

import { useRouter } from "next/navigation";

interface RecentCustomer {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface ServiceStatus {
  ok: boolean;
  error?: string;
}

interface SystemStatus {
  ok: boolean;
  services: {
    backend?: ServiceStatus;
    db?: ServiceStatus;
    redis?: ServiceStatus;
    ai?: ServiceStatus;
  };
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-white/5 animate-pulse ${className}`} />;
}

function formatRelTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tagen`;
}

interface Props {
  recent: RecentCustomer[];
  sysStatus: SystemStatus | null;
  loading: boolean;
}

export default function RecentActivity({ recent, sysStatus, loading }: Props) {
  const router = useRouter();

  return (
    <section className="lg:col-span-2 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Letzte Kunden</h2>
        <button
          onClick={() => router.push("/admin/customers")}
          className="text-xs text-gray-600 hover:text-yellow-400 transition-colors"
        >
          Alle →
        </button>
      </div>

      <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-2xl mb-3">◎</div>
            <p className="text-sm text-gray-400 font-medium">Noch keine Kunden</p>
            <p className="text-xs text-gray-600 mt-1">Registrierte Kunden erscheinen hier</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {recent.map((c) => (
              <li
                key={c.id}
                onClick={() => router.push(`/admin/customers/${c.id}`)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border border-white/5 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                    {c.name}
                  </p>
                  <p className="text-xs text-gray-600 truncate">{formatRelTime(c.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* System-Status */}
      <div className="bg-gray-900 border border-white/5 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">System-Status</h3>
        <div className="space-y-2">
          {[
            { label: "Backend API", key: "backend" as const },
            { label: "Datenbank",   key: "db"      as const },
            { label: "KI-Modelle",  key: "ai"      as const },
            { label: "Redis / Cache", key: "redis" as const },
          ].map(({ label, key }) => {
            const svc = sysStatus?.services?.[key];
            const isLoading = loading || !sysStatus;
            const ok = svc?.ok ?? false;
            return (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{label}</span>
                <div className="flex items-center gap-1.5">
                  {isLoading ? (
                    <span className="w-12 h-3 rounded bg-white/5 animate-pulse inline-block" />
                  ) : (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
                      <span className={`text-xs ${ok ? "text-emerald-500" : "text-red-500"}`}>{ok ? "Online" : "Fehler"}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
