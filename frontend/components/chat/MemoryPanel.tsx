"use client";

import React from "react";
import { MemoryItem } from "@/lib/chat-types";
import { useT } from "@/lib/i18n";

interface MemoryPanelProps {
  memories: MemoryItem[];
  buddyName: string;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function MemoryPanel({ memories, buddyName, onDelete, onClose }: MemoryPanelProps) {
  const t = useT();

  return (
    <aside className="w-80 shrink-0 border-l border-white/5 bg-gray-950 flex flex-col overflow-hidden">
      <div className="px-4 py-3.5 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-semibold text-sm text-white">🧠 {t("mem.panel_title")}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t("mem.subtitle", { name: buddyName })}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {memories.length === 0 && (
          <p className="text-xs text-gray-600 pt-4 text-center leading-relaxed px-2">
            {t("mem.empty")}<br />{t("mem.empty_detail", { name: buddyName })}
          </p>
        )}
        {memories.map((m) => (
          <div key={m.id} className="group flex items-start gap-2 bg-white/4 hover:bg-white/6 rounded-xl px-3 py-2.5 text-xs transition-colors">
            <div className="flex-1 min-w-0">
              <span className="text-gray-300 leading-relaxed">{m.content}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.category === "style" ? "bg-violet-500/15 text-violet-400" : "bg-sky-500/15 text-sky-400"}`}>
                  {m.category === "style" ? t("mem.cat_style") : t("mem.cat_fact")}
                </span>
                <span className="text-[10px] text-gray-600">
                  {new Date(m.created_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </span>
              </div>
            </div>
            <button
              onClick={() => onDelete(m.id)}
              className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5 p-0.5 rounded hover:bg-red-500/10"
              title={t("mem.delete")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
