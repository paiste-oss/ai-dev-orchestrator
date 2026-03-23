"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { ServiceSchema, inputCls } from "@/lib/customer-admin-utils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

interface Props {
  customerId: string;
}

export default function CustomerCredentialsTab({ customerId }: Props) {
  const [schemas, setSchemas] = useState<Record<string, ServiceSchema>>({});
  const [configured, setConfigured] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/credentials`);
      if (res.ok) {
        const d = await res.json();
        setSchemas(d.services ?? {});
        setConfigured(d.configured ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const openService = (key: string) => {
    setActiveService(key);
    setFormValues({});
    setMsg(null);
  };

  const save = async () => {
    if (!activeService) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/credentials/${activeService}`, {
        method: "PUT",
        body: JSON.stringify({ data: formValues }),
      });
      if (res.ok) {
        setMsg({ text: "Gespeichert ✓", ok: true });
        await load();
        setActiveService(null);
      } else {
        setMsg({ text: "Fehler beim Speichern", ok: false });
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (service: string) => {
    setDeleting(service);
    try {
      await apiFetch(`${BACKEND_URL}/v1/customers/${customerId}/credentials/${service}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Wird geladen…</p>;

  return (
    <div className="space-y-5">
      {msg && !activeService && (
        <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"}`}>
          {msg.text}
        </div>
      )}

      <p className="text-sm text-gray-400">
        Zugangsdaten werden verschlüsselt gespeichert und nie im Klartext angezeigt.
        Der Baddi verwendet diese Daten automatisch, wenn er die entsprechenden Tools nutzt.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Object.entries(schemas).map(([key, svc]) => {
          const isConfigured = key in configured;
          return (
            <div
              key={key}
              className={`rounded-xl border p-4 space-y-2 ${
                isConfigured ? "bg-green-500/10 border-green-500/30" : "bg-gray-800 border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{svc.icon}</span>
                {isConfigured && (
                  <button
                    onClick={() => remove(key)}
                    disabled={deleting === key}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {deleting === key ? "…" : "Entfernen"}
                  </button>
                )}
              </div>
              <p className="text-sm font-medium text-white leading-tight">{svc.label}</p>
              {isConfigured
                ? <p className="text-xs text-green-400">Konfiguriert</p>
                : <p className="text-xs text-gray-500">Nicht eingerichtet</p>
              }
              <button
                onClick={() => openService(key)}
                className={`w-full text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  isConfigured
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    : "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
                }`}
              >
                {isConfigured ? "Bearbeiten" : "Einrichten"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {activeService && schemas[activeService] && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{schemas[activeService].icon}</span>
              <div>
                <h3 className="text-base font-bold text-white">{schemas[activeService].label}</h3>
                <p className="text-xs text-gray-400">Wird verschlüsselt gespeichert — nie im Klartext einsehbar</p>
              </div>
            </div>

            <div className="space-y-3">
              {schemas[activeService].fields.map(f => (
                <Field key={f.key} label={f.label}>
                  <input
                    type={f.type === "password" ? "password" : "text"}
                    placeholder={f.placeholder || "—"}
                    value={formValues[f.key] ?? ""}
                    onChange={e => setFormValues(v => ({ ...v, [f.key]: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>

            {msg && (
              <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {saving ? "Speichern…" : "Speichern"}
              </button>
              <button
                onClick={() => { setActiveService(null); setMsg(null); }}
                className="flex-1 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
