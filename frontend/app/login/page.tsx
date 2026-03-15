"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, saveToken, getDashboardPath } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
          <p className="text-gray-400 text-sm">Melde dich an, um fortzufahren</p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
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
        </div>

        <p className="text-center text-sm text-gray-600">
          <button onClick={() => router.push("/")} className="hover:text-gray-400 transition-colors">
            ← Zurück zur Startseite
          </button>
        </p>

      </div>
    </main>
  );
}
