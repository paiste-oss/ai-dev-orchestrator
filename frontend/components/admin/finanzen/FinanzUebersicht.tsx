"use client";

import { chf } from "@/components/admin/finanzen/types";
import type { Revenue } from "@/components/admin/finanzen/types";

function MarginBar({ margin }: { margin: number }) {
  const pct = Math.min(Math.max(margin, -100), 100);
  const positive = pct >= 0;
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${positive ? "bg-green-500" : "bg-red-500"}`}
        style={{ width: `${Math.abs(pct)}%`, marginLeft: positive ? 0 : `${100 - Math.abs(pct)}%` }}
      />
    </div>
  );
}

interface Props {
  revenue: Revenue | null;
  totalCostsMonthly: number;
}

export default function FinanzUebersicht({ revenue, totalCostsMonthly }: Props) {
  const revenueMonthly = revenue?.total_monthly_chf ?? 0;
  const margin = revenueMonthly - totalCostsMonthly;
  const marginPct = revenueMonthly > 0 ? (margin / revenueMonthly) * 100 : -100;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-gray-900 border border-green-900/40 rounded-2xl p-5 space-y-1">
        <p className="text-xs text-gray-500">Einnahmen / Monat</p>
        <p className="text-2xl font-bold text-green-400">{chf(revenueMonthly)}</p>
        <p className="text-xs text-gray-600">{revenue?.paying_customers ?? "—"} zahlende Kunden</p>
      </div>
      <div className="bg-gray-900 border border-red-900/40 rounded-2xl p-5 space-y-1">
        <p className="text-xs text-gray-500">Ausgaben / Monat</p>
        <p className="text-2xl font-bold text-red-400">{chf(totalCostsMonthly)}</p>
        <p className="text-xs text-gray-600">geschätzt, inkl. variabel</p>
      </div>
      <div className={`bg-gray-900 border rounded-2xl p-5 space-y-2 ${margin >= 0 ? "border-green-800/40" : "border-red-800/40"}`}>
        <p className="text-xs text-gray-500">Marge / Monat</p>
        <p className={`text-2xl font-bold ${margin >= 0 ? "text-green-400" : "text-red-400"}`}>{chf(margin)}</p>
        <MarginBar margin={marginPct} />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-1">
        <p className="text-xs text-gray-500">Jahresprojektion</p>
        <p className="text-2xl font-bold text-yellow-400">{chf(margin * 12)}</p>
        <p className="text-xs text-gray-600">Marge × 12</p>
      </div>
    </div>
  );
}
