"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";
import { useT } from "@/lib/i18n";

export function TrustedSendersSection() {
  const t = useT();
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
      setError(t("s.trusted_invalid"));
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
        setError(data.detail ?? t("s.error"));
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
    <Section title={t("s.trusted_title")} icon="✉️">
      <p className="text-xs text-gray-500">
        {t("s.trusted_desc", { buddy: "Baddi" })}
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); }}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="arzt@praxis.ch"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={add}
          disabled={saving || !input.trim()}
          className="px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors disabled:opacity-40"
        >
          {saving ? "…" : t("s.trusted_add")}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-600">{t("settings.loading")}</p>
      ) : senders.length === 0 ? (
        <p className="text-xs text-gray-600">{t("s.trusted_empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {senders.map(s => (
            <li key={s} className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-800 border border-white/5">
              <span className="text-sm font-mono text-gray-300">{s}</span>
              <button
                onClick={() => remove(s)}
                className="text-gray-600 hover:text-red-400 transition-colors text-xs ml-3"
                title={t("s.trusted_remove")}
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
