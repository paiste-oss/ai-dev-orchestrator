"use client";

interface Overview {
  total_messages: number;
  unique_sessions: number;
  total_tokens: number;
  avg_tokens: number;
  messages_today: number;
  messages_7d: number;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-2xl border border-white/5 p-5">
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function AnalyticsStatCards({ overview, days }: { overview: Overview; days: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatCard label="Nachrichten" value={overview.total_messages.toLocaleString()} sub={`letzte ${days} Tage`} />
      <StatCard label="Heute" value={overview.messages_today} />
      <StatCard label="7 Tage" value={overview.messages_7d} />
      <StatCard label="Sitzungen" value={overview.unique_sessions} />
      <StatCard label="Tokens gesamt" value={(overview.total_tokens ?? 0).toLocaleString()} />
      <StatCard label="Ø Tokens" value={Math.round(overview.avg_tokens ?? 0)} sub="pro Nachricht" />
    </div>
  );
}
