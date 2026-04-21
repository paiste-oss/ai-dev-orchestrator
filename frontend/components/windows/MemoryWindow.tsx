"use client";

import { useMemo, useState } from "react";
import { MemoryItem } from "@/lib/chat-types";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";

interface Props {
  buddyName?: string;
  memories: MemoryItem[];
  onDelete: (id: string) => void;
  onRefresh?: () => void;
}

type CategoryFilter = "all" | "fact" | "style";
type TimeFilter = "all" | "7d" | "30d" | "90d";

export default function MemoryWindow({ buddyName = "Baddi", memories, onDelete, onRefresh }: Props) {
  const t = useT();
  const [catFilter, setCatFilter] = useState<CategoryFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffs: Record<TimeFilter, number> = {
      all: 0,
      "7d": now - 7 * 86400000,
      "30d": now - 30 * 86400000,
      "90d": now - 90 * 86400000,
    };
    return memories
      .filter(m => catFilter === "all" || m.category === catFilter)
      .filter(m => timeFilter === "all" || new Date(m.created_at).getTime() >= cutoffs[timeFilter])
      .sort((a, b) => {
        const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return sortDir === "desc" ? diff : -diff;
      });
  }, [memories, catFilter, timeFilter, sortDir]);

  const catLabels: Record<CategoryFilter, string> = {
    all: t("mem.cat_all"),
    fact: t("mem.cat_fact"),
    style: t("mem.cat_style"),
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/5 shrink-0 flex items-center justify-between">
        <p className="text-xs text-gray-500">{t("mem.subtitle", { name: buddyName })}</p>
        {onRefresh && (
          <button onClick={onRefresh} title={t("mem.refresh")}
            className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded hover:bg-white/5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="px-3 py-2 border-b border-white/5 shrink-0 flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {(["all", "fact", "style"] as CategoryFilter[]).map(f => (
            <button key={f} onClick={() => setCatFilter(f)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                catFilter === f
                  ? f === "fact" ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                    : f === "style" ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                    : "bg-white/10 border-white/20 text-white"
                  : "border-white/10 text-gray-500 hover:text-gray-300"
              }`}>
              {catLabels[f]}
            </button>
          ))}
        </div>
        <div className="w-px h-3 bg-white/10" />
        <div className="flex gap-1">
          {(["all", "7d", "30d", "90d"] as TimeFilter[]).map(f => (
            <button key={f} onClick={() => setTimeFilter(f)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                timeFilter === f
                  ? "bg-white/10 border-white/20 text-white"
                  : "border-white/10 text-gray-500 hover:text-gray-300"
              }`}>
              {f === "all" ? t("mem.time_all") : f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-10 px-4 text-center">
            <span className="text-3xl opacity-30">🧠</span>
            <p className="text-xs text-gray-600 leading-relaxed">
              {memories.length === 0
                ? <>{t("mem.empty")}<br />{t("mem.empty_detail", { name: buddyName })}</>
                : t("mem.no_filter")}
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-gray-500 sticky top-0 bg-gray-950">
                <th className="text-left px-3 py-2 font-medium w-12">{t("mem.col_type")}</th>
                <th className="text-left px-2 py-2 font-medium w-20 cursor-pointer select-none hover:text-gray-300"
                  onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}>
                  {t("mem.col_date")} {sortDir === "desc" ? "↓" : "↑"}
                </th>
                <th className="text-left px-2 py-2 font-medium">{t("mem.col_entry")}</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="group border-b border-white/4 hover:bg-white/4 transition-colors">
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      m.category === "style"
                        ? "bg-violet-500/15 text-violet-400"
                        : "bg-sky-500/15 text-sky-400"
                    }`}>
                      {m.category === "style" ? t("mem.cat_style") : t("mem.cat_fact")}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-gray-500 align-top whitespace-nowrap">{formatDate(m.created_at)}</td>
                  <td className="px-2 py-2 text-gray-300 leading-relaxed align-top">{m.content}</td>
                  <td className="px-2 py-2 align-top">
                    <button onClick={() => onDelete(m.id)} title={t("mem.delete")}
                      className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded hover:bg-red-500/10">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {memories.length > 0 && (
        <div className="px-4 py-2 border-t border-white/5 shrink-0">
          <span className="text-[11px] text-gray-600">
            {t("mem.count", { n: String(filtered.length), total: String(memories.length) })}
          </span>
        </div>
      )}
    </div>
  );
}
