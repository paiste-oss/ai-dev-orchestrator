"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, saveToken, getDashboardPath } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

type Step = "credentials" | "otp";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA-Schritt
  const [step, setStep] = useState<Step>("credentials");
  const [otp, setOtp] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [phoneHint, setPhoneHint] = useState("");

  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.detail ?? "Anmeldung fehlgeschlagen.");
        return;
      }

      const data = await res.json();

      if (data.requires_2fa) {
        setTempToken(data.temp_token);
        setPhoneHint(data.phone_hint);
        setStep("otp");
        return;
      }

      saveToken(data.access_token);
      saveSession({ name: data.name, email: data.email, role: data.role });
      router.push(getDashboardPath({ name: data.name, email: data.email, role: data.role }));
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/v1/auth/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temp_token: tempToken, code: otp }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.detail ?? "Code ungültig.");
        return;
      }

      const data = await res.json();
      saveToken(data.access_token);
      saveSession({ name: data.name, email: data.email, role: data.role });
      router.push(getDashboardPath({ name: data.name, email: data.email, role: data.role }));
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">

        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-blue-400">Baddi</h1>
          <p className="text-gray-400 text-sm">
            {step === "credentials" ? "Melde dich an, um fortzufahren" : "Sicherheitscode eingeben"}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">

          {step === "credentials" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-gray-400">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.com"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors py-3 rounded-lg font-bold"
              >
                {loading ? "Anmelden..." : "Anmelden"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <p className="text-sm text-gray-400">
                Code an <span className="text-white font-medium">{phoneHint}</span> gesendet.
              </p>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">6-stelliger Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  required
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-blue-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors py-3 rounded-lg font-bold"
              >
                {loading ? "Prüfen..." : "Bestätigen"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("credentials"); setOtp(""); setError(""); }}
                className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors py-1"
              >
                ← Zurück
              </button>
            </form>
          )}

        </div>

        <p className="text-center text-sm text-gray-600">
          <button onClick={() => router.push("/")} className="hover:text-gray-400 transition-colors">
            ← Zurück zur Startseite
          </button>
        </p>

        <p className="text-center text-xs text-gray-700 mt-4 space-x-3">
          <button onClick={() => router.push("/agb?from=/login")} className="hover:text-gray-500 transition-colors">AGB</button>
          <span>·</span>
          <button onClick={() => router.push("/datenschutz?from=/login")} className="hover:text-gray-500 transition-colors">Datenschutz</button>
        </p>

      </div>
    </main>
  );
}
