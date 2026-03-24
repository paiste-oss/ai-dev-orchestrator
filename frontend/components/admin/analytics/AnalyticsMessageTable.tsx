"use client";

import { useState } from "react";

const RT_COLORS: Record<string, string> = {
  text: "#6366f1", stock_card: "#f59e0b", stock_history: "#10b981",
  image_gallery: "#ec4899", transport_board: "#3b82f6", action_buttons: "#8b5cf6",
};
function rtColor(rt: string) { return RT_COLORS[rt] ?? "#6b7280"; }

interface Message {
  id: string; session_hash: string; user_message: string; assistant_message: string;
  response_type: string; tokens_used: number; language: string; day: string;
  hour_of_day: number; system_prompt_name: string; tools_used: string; memory_facts: string;
}

interface ResponseType { response_type: string; cnt: number; }

interface Props {
  messages: Message[];
  total: number;
  page: number;
  rtData: ResponseType[];
  rtFilter: string;
  onPageChange: (p: number) => void;
  onFilterChange: (v: string) => void;
}

const LIMIT = 20;

export default function AnalyticsMessageTable({ messages, total, page, rtData, rtFilter, onPageChange, onFilterChange }: Props) {
  const [exp, setExp] = useState<string | null>(null);
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="bg-gray-800/60 rounded-2xl border border-white/5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-wrap gap-3">
        <p className="text-sm font-medium text-gray-300">Frage & Antwort ({total.toLocaleString()} Einträge)</p>
        <select value={rtFilter} onChange={e => onFilterChange(e.target.value)}
          className="bg-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 border border-white/5 focus:outline-none">
          <option value="">Alle Typen</option>
          {rtData.map(r => <option key={r.response_type} value={r.response_type}>{r.response_type}</option>)}
        </select>
      </div>

      <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_2fr] border-b border-white/5">
        {["Eingabe (anonym)", "System Prompt · Zeit", "Tools / Workflow", "Antwort Baddi"].map((h, i) => (
          <div key={i} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600">{h}</div>
        ))}
      </div>

      <div className="divide-y divide-white/5">
        {messages.map(msg => (
          <div key={msg.id} className="cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => setExp(exp === msg.id ? null : msg.id)}>
            <div className="md:grid md:grid-cols-[2fr_1fr_1fr_2fr] gap-0">
              <div className="px-4 py-4 min-w-0">
                <p className={`text-sm text-white ${exp !== msg.id ? "line-clamp-2" : "whitespace-pre-wrap"}`}>{msg.user_message}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-gray-600 font-mono">{msg.day}</span>
                  <span className="text-[10px] text-gray-600">{msg.hour_of_day}:00 Uhr</span>
                  <span className="text-[10px] font-mono text-gray-700">{msg.session_hash}</span>
                </div>
              </div>
              <div className="px-4 py-4 min-w-0 flex flex-col justify-start gap-1.5">
                <span className="inline-block text-xs text-indigo-300 bg-indigo-500/10 rounded-lg px-2.5 py-1 font-medium truncate max-w-full">
                  {msg.system_prompt_name || "Standard"}
                </span>
                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium w-fit"
                  style={{ background: rtColor(msg.response_type) + "22", color: rtColor(msg.response_type) }}>
                  {msg.response_type}
                </span>
                <span className="text-[10px] text-gray-600">{msg.tokens_used} Tokens</span>
              </div>
              <div className="px-4 py-4 min-w-0">
                {msg.tools_used ? (
                  <div className="flex flex-wrap gap-1">
                    {msg.tools_used.split(",").map((t, i) => (
                      <span key={i} className="text-[10px] bg-amber-500/10 text-amber-400 rounded px-2 py-0.5 font-mono">{t.trim()}</span>
                    ))}
                  </div>
                ) : <span className="text-[10px] text-gray-700">—</span>}
              </div>
              <div className="px-4 py-4 min-w-0">
                <p className={`text-sm text-gray-300 ${exp !== msg.id ? "line-clamp-3" : "whitespace-pre-wrap"}`}>{msg.assistant_message}</p>
                <span className="text-[10px] text-gray-700 mt-1 block">{exp === msg.id ? "▲ einklappen" : "▼ aufklappen"}</span>
              </div>
            </div>
            {exp === msg.id && msg.memory_facts && (
              <div className="mx-4 mb-4 px-4 py-3 bg-purple-500/8 border border-purple-500/20 rounded-xl">
                <p className="text-[10px] text-purple-400 uppercase tracking-widest mb-2 font-semibold">Memory Manager — ins Langzeitgedächtnis gelegt</p>
                <div className="flex flex-wrap gap-2">
                  {msg.memory_facts.split(" | ").filter(Boolean).map((fact, i) => (
                    <span key={i} className="text-xs text-purple-200 bg-purple-500/10 rounded-lg px-2.5 py-1">{fact}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="px-5 py-12 text-center text-gray-600 text-sm">
            Noch keine Analytics-Daten — sie werden beim nächsten Chat-Turn gespeichert.
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/5">
          <p className="text-xs text-gray-500">{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} von {total}</p>
          <div className="flex gap-2">
            <button onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-xs bg-gray-700 text-gray-300 disabled:opacity-30 hover:bg-gray-600 transition-colors">
              ← Zurück
            </button>
            <button onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-lg text-xs bg-gray-700 text-gray-300 disabled:opacity-30 hover:bg-gray-600 transition-colors">
              Weiter →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
