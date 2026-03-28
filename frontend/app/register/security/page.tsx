"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 text-sm";

type Step = "ask" | "phone" | "verify" | "done";

function SecuritySetup() {
  const router = useRouter();
  const params = useSearchParams();
  const name = params.get("name") ?? "";

  const [step, setStep] = useState<Step>("ask");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Bereits hinterlegte Nummer aus /me laden
  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    apiFetch(`${BACKEND_URL}/v1/auth/me`)
      .then(r => r.json())
      .then(d => { if (d.phone) setPhone(d.phone); });
  }, [router]);

  const toPlan = () => router.push(`/register/plan?name=${encodeURIComponent(name)}`);

  const sendOtp = async () => {
    if (!phone.trim()) { setMsg({ text: "Bitte Mobilnummer eingeben", ok: false }); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/auth/2fa/send-otp`, {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (res.ok) {
        setStep("verify");
        setMsg({ text: "Code gesendet — prüfe dein Handy", ok: true });
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ text: e.detail ?? "Fehler beim Senden", ok: false });
      }
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/auth/2fa/enable`, {
        method: "POST",
        body: JSON.stringify({ code: otp }),
      });
      if (res.ok) {
        setStep("done");
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg({ text: e.detail ?? "Ungültiger Code", ok: false });
      }
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-2xl font-bold text-white">
            {step === "done" ? "2FA aktiviert!" : `Willkommen${name ? `, ${name}` : ""}!`}
          </h1>
          <p className="text-sm text-gray-400">
            {step === "done"
              ? "Dein Account ist jetzt extra geschützt."
              : "Schütze deinen Account mit SMS-Sicherheitscode."}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">

          {/* Frage ob 2FA */}
          {step === "ask" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300 leading-relaxed">
                Mit der <span className="text-indigo-400 font-medium">Zwei-Faktor-Authentifizierung</span> erhältst du bei jedem Login einen Code per SMS — so bleibt dein Account sicher, auch wenn dein Passwort kompromittiert wird.
              </p>
              <button
                onClick={() => setStep("phone")}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
              >
                2FA jetzt aktivieren
              </button>
              <button
                onClick={toPlan}
                className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm transition-colors"
              >
                Überspringen — später in Einstellungen aktivierbar
              </button>
            </div>
          )}

          {/* Nummer eingeben */}
          {step === "phone" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Mobilnummer (E.164)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+41791234567"
                  autoFocus
                  className={inputCls}
                />
                <p className="text-xs text-gray-600">Format: +41 gefolgt von der Nummer ohne Leerzeichen</p>
              </div>
              {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
              <button onClick={sendOtp} disabled={loading}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-40">
                {loading ? "Sendet…" : "Code senden"}
              </button>
              <button onClick={() => setStep("ask")}
                className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors py-1">
                ← Zurück
              </button>
            </div>
          )}

          {/* OTP bestätigen */}
          {step === "verify" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Code gesendet an <span className="text-white">{phone}</span>
              </p>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">6-stelliger Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  autoFocus
                  className={`${inputCls} text-center text-2xl tracking-widest`}
                />
              </div>
              {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
              <button onClick={verifyOtp} disabled={loading || otp.length !== 6}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors disabled:opacity-40">
                {loading ? "Prüft…" : "Bestätigen & 2FA aktivieren"}
              </button>
              <button onClick={sendOtp} disabled={loading}
                className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors py-1">
                Kein Code? Erneut senden
              </button>
            </div>
          )}

          {/* Erfolg */}
          {step === "done" && (
            <div className="space-y-3 text-center">
              <div className="text-5xl">✅</div>
              <p className="text-sm text-gray-300">
                Bei jedem Login wirst du einen SMS-Code an <span className="text-white">{phone}</span> erhalten.
              </p>
              <button onClick={toPlan}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors">
                Weiter →
              </button>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

export default function SecurityPage() {
  return (
    <Suspense>
      <SecuritySetup />
    </Suspense>
  );
}
