"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { CustomerNote } from "@/lib/customer-admin-utils";

interface Props {
  customerId: string;
}

export default function CustomerNotesTab({ customerId }: Props) {
  const [notes, setNotes]     = useState<CustomerNote[]>([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/notes`);
      if (res.ok) setNotes(await res.json());
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const text = input.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/notes`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setInput("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (noteId: string) => {
    setDeleting(noteId);
    try {
      await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/notes/${noteId}`, { method: "DELETE" });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } finally {
      setDeleting(null);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      {/* Eingabe */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) submit(); }}
          rows={3}
          placeholder="Notiz eingeben… (Ctrl+Enter zum Speichern)"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!input.trim() || saving}
            className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-semibold text-sm transition-colors"
          >
            {saving ? "Speichern…" : "Notiz speichern"}
          </button>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-8">Noch keine Notizen</p>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <div key={note.id} className="group bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-1">{fmt(note.created_at)}</p>
                <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{note.text}</p>
              </div>
              <button
                onClick={() => remove(note.id)}
                disabled={deleting === note.id}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-sm mt-0.5"
              >
                {deleting === note.id ? "…" : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
