"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";

interface Props {
  memoryConsent: boolean;
  onConsentChange: (val: boolean) => void;
}

export function MemorySection({ memoryConsent, onConsentChange }: Props) {
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeInput, setRevokeInput] = useState("");
  const [revoking, setRevoking] = useState(false);

  const revokeMemory = async () => {
    if (revokeInput !== "Lösche Langzeitdaten") return;
    setRevoking(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/me/memory-consent`, { method: "DELETE" });
      if (res.ok) { onConsentChange(false); setRevokeOpen(false); setRevokeInput(""); }
    } finally { setRevoking(false); }
  };

  const enableMemory = async () => {
    const res = await apiFetch(`${BACKEND_URL}/v1/customers/me`, {
      method: "PATCH", body: JSON.stringify({ memory_consent: true }),
    });
    if (res.ok) onConsentChange(true);
  };

  return (
    <>
      <Section title="Langzeitgedächtnis" icon="🧠">
        <p className="text-sm text-gray-400 leading-relaxed">
          Damit Baddi dein Begleiter fürs Leben wird, merkt er sich wichtige Dinge über dich — Vorlieben, Erlebnisse, Ziele. Diese Daten werden sicher gespeichert und niemals an Dritte weitergegeben.
        </p>
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${memoryConsent ? "border-yellow-500/30 bg-yellow-950/20" : "border-gray-700 bg-gray-800/30"}`}>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${memoryConsent ? "bg-yellow-400" : "bg-gray-600"}`} />
          <span className="text-sm font-medium text-gray-200 flex-1">
            {memoryConsent ? "Aktiviert — Baddi baut sein Gedächtnis auf" : "Deaktiviert — Baddi merkt sich nichts"}
          </span>
        </div>
        {memoryConsent ? (
          <button onClick={() => setRevokeOpen(true)}
            className="w-full px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors">
            Langzeitgedächtnis widerrufen & Daten löschen
          </button>
        ) : (
          <button onClick={enableMemory}
            className="w-full px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-semibold transition-colors">
            Langzeitgedächtnis aktivieren
          </button>
        )}
      </Section>

      {revokeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setRevokeOpen(false); setRevokeInput(""); }} />
          <div className="relative bg-gray-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <div>
                <h3 className="font-bold text-white text-lg">Langzeitgedächtnis widerrufen</h3>
                <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                  Alle Daten im Langzeitgedächtnis werden
                  <span className="text-red-400 font-semibold"> unwiderruflich gelöscht</span>.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-300">
                Schreibe <code className="text-red-400 font-mono bg-red-950/30 px-1 rounded">Lösche Langzeitdaten</code> und drücke Löschen.
              </p>
              <input type="text" value={revokeInput} onChange={e => setRevokeInput(e.target.value)}
                placeholder="Lösche Langzeitdaten" autoFocus
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/60 font-mono" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRevokeOpen(false); setRevokeInput(""); }}
                className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                Abbrechen
              </button>
              <button onClick={revokeMemory} disabled={revokeInput !== "Lösche Langzeitdaten" || revoking}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40">
                {revoking ? "Wird gelöscht…" : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
