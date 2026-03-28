"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { MemoryItem } from "@/lib/chat-types";

interface Props {
  buddyName?: string;
}

export default function MemoryWindow({ buddyName = "Baddi" }: Props) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/memories`);
      if (res.ok) setMemories(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function deleteMemory(id: string) {
    await apiFetch(`${BACKEND_URL}/v1/chat/memories/${id}`, { method: "DELETE" });
    setMemories(prev => prev.filter(m => m.id !== id));
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 shrink-0 flex items-center justify-between">
        <p className="text-xs text-gray-500">Was {buddyName} über dich weiss</p>
        <button onClick={load} title="Aktualisieren" className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading ? (
          <p className="text-xs text-gray-600 text-center pt-8">Lädt…</p>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-10 px-4 text-center">
            <span className="text-3xl opacity-30">🧠</span>
            <p className="text-xs text-gray-600 leading-relaxed">
              Noch keine Erinnerungen.<br />
              Nach dem Gespräch merkt sich {buddyName} relevante Informationen über dich.
            </p>
          </div>
        ) : (
          memories.map((m) => (
            <div key={m.id} className="group flex items-start gap-2 bg-white/4 hover:bg-white/6 rounded-xl px-3 py-2.5 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 leading-relaxed">{m.content}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.category === "style" ? "bg-violet-500/15 text-violet-400" : "bg-sky-500/15 text-sky-400"}`}>
                    {m.category === "style" ? "Stil" : "Fakt"}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {new Date(m.created_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </span>
                </div>
              </div>
              <button onClick={() => deleteMemory(m.id)} title="Löschen" className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5 p-0.5 rounded hover:bg-red-500/10">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {memories.length > 0 && (
        <div className="px-4 py-2 border-t border-white/5 shrink-0">
          <span className="text-[11px] text-gray-600">{memories.length} Erinnerung{memories.length !== 1 ? "en" : ""}</span>
        </div>
      )}
    </div>
  );
}
