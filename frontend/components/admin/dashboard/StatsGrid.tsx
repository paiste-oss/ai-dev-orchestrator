"use client";

import { useRouter } from "next/navigation";

interface DashboardStats {
  total_customers: number;
  active_buddies: number;
  chats_today: number;
  active_workflows: number;
  pending_entwicklung: number;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-white/5 animate-pulse ${className}`} />;
}

function StatCard({
  label, value, icon, accent, loading, onClick, badge,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent: string;
  loading: boolean;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        group relative overflow-hidden rounded-2xl bg-gray-900 border border-white/5
        p-5 text-left transition-all duration-200
        ${onClick ? "hover:border-white/10 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30" : "cursor-default"}
      `}
    >
      <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${accent} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity duration-500`} />

      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${accent} bg-opacity-10 border border-white/5`}>
            {icon}
          </div>
          <div className="flex items-center gap-1">
            {badge !== undefined && badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {badge}
              </span>
            )}
            {onClick && (
              <span className="text-gray-700 group-hover:text-gray-400 transition-colors text-sm">↗</span>
            )}
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
        )}

        <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">{label}</p>
      </div>
    </button>
  );
}

interface Props {
  stats: DashboardStats | null;
  loading: boolean;
}

export default function StatsGrid({ stats, loading }: Props) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <StatCard
        label="Kunden"
        value={stats?.total_customers ?? "—"}
        icon="◎"
        accent="bg-blue-500"
        loading={loading}
        onClick={() => router.push("/admin/customers")}
      />
      <StatCard
        label="In Entwicklung"
        value={stats?.pending_entwicklung ?? "—"}
        icon="⚗"
        accent="bg-amber-500"
        loading={loading}
        onClick={() => router.push("/admin/entwicklung")}
        badge={stats?.pending_entwicklung}
      />
      <StatCard
        label="Workflows"
        value={stats?.active_workflows ?? "—"}
        icon="⇆"
        accent="bg-violet-500"
        loading={loading}
        onClick={() => router.push("/admin/workflows")}
      />
    </div>
  );
}
