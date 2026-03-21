"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface Me {
  id: string;
  name: string;
  email: string;
  memory_consent?: boolean;
}

export default function UserSettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeInput, setRevokeInput] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    apiFetch(`${BACKEND_URL}/v1/auth/me`)
      .then(r => r.json())
      .then(setMe);
  }, [router]);

  const enableMemory = async () => {
    if (!me) return;
    setEnabling(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${me.id}`, {
        method: "PATCH",
        body: JSON.stringify({ memory_consent: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMe(m => m ? { ...m, memory_consent: updated.memory_consent } : m);
        setMsg("Langzeitgedächtnis aktiviert.");
      }
    } finally {
      setEnabling(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const revokeMemory = async () => {
    if (!me || revokeInput !== "Lösche Langzeitdaten") return;
    setRevoking(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${me.id}/memory-consent`, { method: "DELETE" });
      if (res.ok) {
        setMe(m => m ? { ...m, memory_consent: false } : m);
        setMsg("Langzeitgedächtnis deaktiviert. Alle Daten wurden gelöscht.");
      }
    } finally {
      setRevoking(false);
      setRevokeOpen(false);
      setRevokeInput("");
      setTimeout(() => setMsg(null), 5000);
    }
  };

  if (!me) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Lädt…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-lg mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-xl font-bold text-white">Einstellungen</h1>
            <p className="text-xs text-gray-500">{me.name}</p>
          </div>
        </div>

        {/* Langzeitgedächtnis */}
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <h2 className="font-semibold text-white">Langzeitgedächtnis</h2>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                Damit Baddi dein Begleiter fürs Leben wird, merkt er sich wichtige Dinge über dich
                — Vorlieben, Erlebnisse, Ziele. Diese Daten werden sicher gespeichert und
                niemals an Dritte weitergegeben.
              </p>
            </div>
          </div>

          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            me.memory_consent
              ? "border-yellow-500/30 bg-yellow-950/20"
              : "border-gray-700 bg-gray-800/30"
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${me.memory_consent ? "bg-yellow-400" : "bg-gray-600"}`} />
            <span className="text-sm font-medium text-gray-200 flex-1">
              {me.memory_consent ? "Aktiviert — Baddi baut sein Gedächtnis auf" : "Deaktiviert — Baddi merkt sich nichts"}
            </span>
          </div>

          {msg && (
            <p className="text-sm text-green-400 bg-green-950/30 border border-green-800/30 rounded-xl px-4 py-3">
              ✓ {msg}
            </p>
          )}

          {me.memory_consent ? (
            <button
              onClick={() => setRevokeOpen(true)}
              className="w-full px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
            >
              Langzeitgedächtnis widerrufen & Daten löschen
            </button>
          ) : (
            <button
              onClick={enableMemory}
              disabled={enabling}
              className="w-full px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {enabling ? "Wird aktiviert…" : "Langzeitgedächtnis aktivieren"}
            </button>
          )}
        </div>

        {/* Widerruf Modal */}
        {revokeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setRevokeOpen(false); setRevokeInput(""); }} />
            <div className="relative bg-gray-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">⚠️</span>
                <div>
                  <h3 className="font-bold text-white text-lg">Langzeitgedächtnis widerrufen</h3>
                  <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                    Wenn du dies widerrufst, werden alle Daten im Langzeitgedächtnis deines Buddis
                    <span className="text-red-400 font-semibold"> unwiderruflich gelöscht</span>.
                    Dein Baddi vergisst alles was er über dich gelernt hat.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-300">
                  Wenn du dies wirklich willst, schreibe bitte{" "}
                  <code className="text-red-400 font-mono bg-red-950/30 px-1 rounded">Lösche Langzeitdaten</code>{" "}
                  in das Feld und drücke <strong>Löschen</strong>.
                </p>
                <input
                  type="text"
                  value={revokeInput}
                  onChange={e => setRevokeInput(e.target.value)}
                  placeholder="Lösche Langzeitdaten"
                  className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/60 font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setRevokeOpen(false); setRevokeInput(""); }}
                  className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={revokeMemory}
                  disabled={revokeInput !== "Lösche Langzeitdaten" || revoking}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {revoking ? "Wird gelöscht…" : "Löschen"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
