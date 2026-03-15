"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, type UserRole } from "@/lib/auth";

// Demo-Accounts (Phase 2: echte JWT-Authentifizierung via Backend)
const DEMO_ACCOUNTS: Record<string, { password: string; name: string; role: UserRole }> = {
  "admin@aibuddy.com":      { password: "admin123",      name: "Admin",      role: "admin" },
  "firma@aibuddy.com":      { password: "enterprise123", name: "Enterprise", role: "enterprise" },
  "benutzer@aibuddy.com":   { password: "user123",       name: "Benutzer",   role: "user" },
};

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

    await new Promise((r) => setTimeout(r, 400)); // kurze Verzögerung für UX

    const account = DEMO_ACCOUNTS[email.toLowerCase()];
    if (!account || account.password !== password) {
      setError("E-Mail oder Passwort falsch.");
      setLoading(false);
      return;
    }

    saveSession({ name: account.name, email, role: account.role });
    router.push(`/${account.role}`);
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-blue-400">AI Buddy</h1>
          <p className="text-gray-400 mt-1 text-sm">Melde dich an, um fortzufahren</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-400">E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="deine@email.com"
              required
              className="w-full bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
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
              className="w-full bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors py-3 rounded font-bold text-white"
          >
            {loading ? "Anmelden..." : "Anmelden"}
          </button>
        </form>

        {/* Demo-Hinweis */}
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <p className="text-xs text-gray-500 text-center">Demo-Zugänge</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button onClick={() => { setEmail("admin@aibuddy.com"); setPassword("admin123"); }}
              className="bg-gray-700 hover:bg-gray-600 rounded p-2 text-center transition-colors">
              <div className="text-yellow-400 font-bold">Admin</div>
              <div className="text-gray-400">admin123</div>
            </button>
            <button onClick={() => { setEmail("firma@aibuddy.com"); setPassword("enterprise123"); }}
              className="bg-gray-700 hover:bg-gray-600 rounded p-2 text-center transition-colors">
              <div className="text-blue-400 font-bold">Enterprise</div>
              <div className="text-gray-400">enterprise123</div>
            </button>
            <button onClick={() => { setEmail("benutzer@aibuddy.com"); setPassword("user123"); }}
              className="bg-gray-700 hover:bg-gray-600 rounded p-2 text-center transition-colors">
              <div className="text-green-400 font-bold">User</div>
              <div className="text-gray-400">user123</div>
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500">
          <button onClick={() => router.push("/")} className="hover:text-gray-300 transition-colors">
            Zurück zur Startseite
          </button>
        </p>
      </div>
    </main>
  );
}
