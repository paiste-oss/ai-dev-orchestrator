"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";

export function TrustedSendersSection() {
  const [senders, setSenders] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/v1/email/trusted-senders`)
      .then(r => r.json())
      .then(d => setSenders(d.trusted_senders ?? []))
      .finally(() => setLoading(false));
  }, []);

  const add = async () => {
    const email = input.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Ungültige E-Mail-Adresse");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/trusted-senders`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setSenders(data.trusted_senders);
        setInput("");
      } else {
        setError(data.detail ?? "Fehler");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (email: string) => {
    const res = await apiFetch(
      `${BACKEND_URL}/v1/email/trusted-senders/${encodeURIComponent(email)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      const data = await res.json();
      setSenders(data.trusted_senders);
    }
  };

  return (
    <Section title="Vertrauenswürdige Absender" icon="✉️">
      <p className="text-xs text-gray-500">
        Baddi reagiert autonom nur auf E-Mails von diesen Absendern.
        Deine eigene Registrierungs-E-Mail ist automatisch vertrauenswürdig.
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); }}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="arzt@praxis.ch"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={add}
          disabled={saving || !input.trim()}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
        >
          {saving ? "…" : "Hinzufügen"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-600">Lädt…</p>
      ) : senders.length === 0 ? (
        <p className="text-xs text-gray-600">Noch keine Einträge.</p>
      ) : (
        <ul className="space-y-1.5">
          {senders.map(s => (
            <li key={s} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-800 border border-white/5">
              <span className="text-sm font-mono text-gray-300">{s}</span>
              <button
                onClick={() => remove(s)}
                className="text-gray-600 hover:text-red-400 transition-colors text-xs ml-3"
                title="Entfernen"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
