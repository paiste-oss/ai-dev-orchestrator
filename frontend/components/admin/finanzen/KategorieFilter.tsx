"use client";

import { CATEGORIES, chf } from "@/components/admin/finanzen/types";
import type { Category, CostEntry } from "@/components/admin/finanzen/types";

interface Props {
  entries: CostEntry[];
  activeCategory: Category | "alle";
  showInactive: boolean;
  onCategoryChange: (cat: Category | "alle") => void;
  onToggleInactive: () => void;
}

export default function KategorieFilter({
  entries,
  activeCategory,
  showInactive,
  onCategoryChange,
  onToggleInactive,
}: Props) {
  const active = entries.filter(e => e.is_active);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={() => onCategoryChange("alle")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm transition-colors ${
          activeCategory === "alle"
            ? "bg-gray-700 border-gray-600 text-white"
            : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600"
        }`}
      >
        Alle <span className="text-xs opacity-60">{entries.length}</span>
      </button>

      {CATEGORIES.map((cat) => {
        const total = active.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount_chf_monthly, 0);
        const count = entries.filter(e => e.category === cat.key).length;
        return (
          <button
            key={cat.key}
            onClick={() => onCategoryChange(activeCategory === cat.key ? "alle" : cat.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm transition-colors ${
              activeCategory === cat.key
                ? `${cat.bg} ${cat.border} ${cat.color}`
                : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600"
            }`}
          >
            {cat.icon} {cat.label}
            <span className="text-xs opacity-60">{count}</span>
            {total > 0 && (
              <span className={`text-xs font-semibold ${activeCategory === cat.key ? cat.color : "text-gray-600"}`}>
                {chf(total)}
              </span>
            )}
          </button>
        );
      })}

      <button
        onClick={onToggleInactive}
        className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
          showInactive
            ? "bg-gray-800 border-gray-600 text-gray-300"
            : "bg-gray-900 border-gray-800 text-gray-600 hover:border-gray-600"
        }`}
      >
        {showInactive ? "◉" : "○"} Inaktive
      </button>
    </div>
  );
}
