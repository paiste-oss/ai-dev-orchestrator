"use client";

import { CATEGORIES, chf, billingUrl } from "@/components/admin/finanzen/types";
import type { CostEntry, Category } from "@/components/admin/finanzen/types";

interface Props {
  entries: CostEntry[];
  loading: boolean;
  activeCategory: Category | "alle";
  showInactive: boolean;
  onEdit: (e: CostEntry) => void;
  onRemove: (id: string) => void;
}

export default function KostenTabelle({ entries, loading, activeCategory, showInactive, onEdit, onRemove }: Props) {
  const filtered = entries
    .filter(e => activeCategory === "alle" || e.category === activeCategory)
    .filter(e => showInactive ? true : e.is_active);

  const catInfo = (key: Category) => CATEGORIES.find(c => c.key === key) ?? CATEGORIES[4];

  if (loading) return <p className="text-center text-gray-600 py-12">Lade…</p>;
  if (filtered.length === 0) return <p className="text-center text-gray-600 py-12">Keine Einträge</p>;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-5 py-3">Name / Notiz</th>
            <th className="text-left px-4 py-3 hidden md:table-cell">Anbieter</th>
            <th className="text-left px-4 py-3 hidden lg:table-cell">Kategorie</th>
            <th className="text-left px-4 py-3 hidden sm:table-cell">Turnus</th>
            <th className="text-right px-4 py-3 hidden sm:table-cell">CAPEX inkl. MwSt.</th>
            <th className="text-right px-4 py-3">CHF/Mo</th>
            <th className="text-right px-4 py-3 hidden md:table-cell">Guthaben</th>
            <th className="text-left px-4 py-3 hidden lg:table-cell">Zahlung</th>
            <th className="px-5 py-3 w-32"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(e => {
            const cat = catInfo(e.category);
            return (
              <tr key={e.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${!e.is_active ? "opacity-35" : ""}`}>
                <td className="px-5 py-3">
                  <span className="font-medium text-white">{e.name}</span>
                  {e.notes && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{e.notes}</p>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs">{e.provider || "—"}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cat.bg} ${cat.border} border ${cat.color}`}>
                    {cat.icon} {cat.label}
                  </span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className={`text-xs px-2 py-0.5 rounded-md ${
                    e.billing_cycle === "nutzungsbasiert" ? "bg-violet-950/50 text-violet-400" :
                    e.billing_cycle === "jährlich"        ? "bg-blue-950/50 text-blue-400" :
                    e.billing_cycle === "einmalig"        ? "bg-orange-950/50 text-orange-400" :
                                                            "bg-gray-800 text-gray-400"
                  }`}>{e.billing_cycle}</span>
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  {e.amount_original > 0 ? (
                    <span className="text-sm text-gray-300">
                      {e.amount_original.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {e.currency}
                    </span>
                  ) : <span className="text-gray-700 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.billing_cycle === "nutzungsbasiert" && e.amount_chf_monthly === 0 ? (
                    <span className="text-gray-600 text-xs">variabel</span>
                  ) : (
                    <span className="font-semibold text-white">{chf(e.amount_chf_monthly)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right hidden md:table-cell">
                  {e.balance_chf != null ? (
                    <div className="flex flex-col items-end">
                      <span className={`text-sm font-semibold ${e.balance_chf > 0 ? "text-green-400" : "text-red-400"}`}>
                        {chf(e.balance_chf)}
                      </span>
                      {e.balance_updated_at && (
                        <span className="text-xs text-gray-600">{new Date(e.balance_updated_at).toLocaleDateString("de-CH")}</span>
                      )}
                    </div>
                  ) : <span className="text-gray-700 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {e.payment_method ? (
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-300 capitalize">
                        {e.payment_method === "kreditkarte" ? "Kreditkarte" :
                         e.payment_method === "twint"       ? "Twint" :
                         e.payment_method === "rechnung"    ? "Rechnung" : "Bar"}
                      </span>
                      {e.payment_method === "kreditkarte" && e.card_last4 && (
                        <span className="text-xs text-gray-600">•••• {e.card_last4}</span>
                      )}
                    </div>
                  ) : <span className="text-gray-700 text-xs">—</span>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {billingUrl(e) && (
                      <a href={billingUrl(e)!} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-blue-400 hover:border-blue-800 transition-colors">
                        ↗
                      </a>
                    )}
                    <button onClick={() => onEdit(e)}
                      className="text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-yellow-400 hover:border-yellow-800 transition-colors">
                      ✏
                    </button>
                    <button onClick={() => onRemove(e.id)}
                      className="text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-900 transition-colors">
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-700 bg-gray-800/30">
            <td colSpan={6} className="px-5 py-3 text-xs text-gray-500">
              {filtered.filter(e => e.is_active).length} aktive Einträge · Beträge in CHF, variable Kosten geschätzt
            </td>
            <td className="px-4 py-3 text-right">
              <span className="font-bold text-yellow-400">
                {chf(filtered.filter(e => e.is_active).reduce((s, e) => s + e.amount_chf_monthly, 0))}
              </span>
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
