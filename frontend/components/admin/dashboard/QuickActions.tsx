"use client";

import { useRouter } from "next/navigation";

interface DashboardStats {
  pending_entwicklung: number;
}

function QuickAction({
  icon, label, sub, onClick, highlight,
}: {
  icon: string;
  label: string;
  sub?: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group flex items-center gap-3 rounded-xl p-3.5 transition-all duration-150 text-left w-full border
        ${highlight
          ? "bg-yellow-500/8 border-yellow-500/20 hover:bg-yellow-500/12 hover:border-yellow-500/30"
          : "bg-gray-900 border-white/5 hover:border-white/10 hover:bg-gray-800/60"
        }
      `}
    >
      <span className={`w-9 h-9 flex items-center justify-center rounded-lg text-base shrink-0 transition-colors border
        ${highlight
          ? "bg-yellow-500/15 border-yellow-500/30 text-yellow-400"
          : "bg-white/5 border-white/5 text-gray-400 group-hover:bg-white/8 group-hover:text-white"
        }
      `}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-tight ${highlight ? "text-yellow-300" : "text-gray-200 group-hover:text-white"} transition-colors`}>
          {label}
        </p>
        {sub && <p className="text-xs text-gray-600 mt-0.5 truncate">{sub}</p>}
      </div>
      <span className={`text-sm transition-colors shrink-0 ${highlight ? "text-yellow-600 group-hover:text-yellow-400" : "text-gray-700 group-hover:text-gray-400"}`}>→</span>
    </button>
  );
}

interface Props {
  stats: DashboardStats | null;
  statsLoading: boolean;
}

export default function QuickActions({ stats, statsLoading }: Props) {
  const router = useRouter();

  return (
    <section className="lg:col-span-3 space-y-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Schnellzugriff</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <QuickAction
          icon="⚗"
          label="Entwicklung"
          sub="Neue Fähigkeiten für Baddis"
          onClick={() => router.push("/admin/entwicklung")}
          highlight={!statsLoading && (stats?.pending_entwicklung ?? 0) > 0}
        />
        <QuickAction
          icon="◎"
          label="Kunden"
          sub="Alle Kunden verwalten"
          onClick={() => router.push("/admin/customers")}
        />
        <QuickAction
          icon="◈"
          label="Baddis"
          sub="Persönliche KI-Begleiter"
          onClick={() => router.push("/admin/buddies")}
        />
        <QuickAction
          icon="⌥"
          label="Dev Orchestrator"
          sub="AI-Tasks & Code-Agenten"
          onClick={() => router.push("/admin/devtool")}
        />
        <QuickAction
          icon="◐"
          label="Design"
          sub="Erscheinungsbild & Branding"
          onClick={() => router.push("/admin/design")}
        />
        <QuickAction
          icon="⚙"
          label="Uhrwerk"
          sub="Chat-Pipeline & Konfiguration"
          onClick={() => router.push("/admin/uhrwerk/system-prompt")}
        />
        <QuickAction
          icon="▤"
          label="Finanzen & Kosten"
          sub="API-Kosten & Übersicht"
          onClick={() => router.push("/admin/finanzen/kosten")}
        />
        <QuickAction
          icon="⇆"
          label="n8n Workflows"
          sub="Automationen & Services"
          onClick={() => router.push("/admin/workflows")}
        />
      </div>
    </section>
  );
}
