"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, getDashboardPath, type UserRole } from "@/lib/auth";

interface DemoAccount {
  password: string;
  name: string;
  role: UserRole;
  usecase?: string;
}

const DEMO_ACCOUNTS: Record<string, DemoAccount> = {
  // System-Rollen
  "admin@aibuddy.com":          { password: "admin123",        name: "Admin",        role: "admin" },
  "firma@aibuddy.com":          { password: "enterprise123",   name: "Enterprise",   role: "enterprise" },
  "hub@aibuddy.com":            { password: "user123",         name: "Benutzer",     role: "user" },
  // UseCase-Accounts
  "emma@aibuddy.com":           { password: "silber123",       name: "Oma Hilde",    role: "user", usecase: "silberperlen" },
  "leo@aibuddy.com":            { password: "bestager123",     name: "Hans Müller",  role: "user", usecase: "bestager" },
  "max@aibuddy.com":            { password: "mittel123",       name: "Sarah Weber",  role: "user", usecase: "mittlerweiler" },
  "noa@aibuddy.com":            { password: "newgen123",       name: "Lena Koch",    role: "user", usecase: "newgen" },
  "lumi@aibuddy.com":           { password: "young123",        name: "Tim Schneider",role: "user", usecase: "youngsters" },
};

const SYSTEM_DEMOS = [
  { email: "admin@aibuddy.com",    password: "admin123",      label: "Admin",      color: "text-yellow-400" },
  { email: "firma@aibuddy.com",    password: "enterprise123", label: "Enterprise", color: "text-blue-400" },
  { email: "hub@aibuddy.com",      password: "user123",       label: "User Hub",   color: "text-green-400" },
];

const USECASE_DEMOS = [
  { email: "emma@aibuddy.com",  password: "silber123",   label: "Silberperlen", icon: "🌸", color: "text-rose-300",   bg: "bg-rose-950/50",   border: "border-rose-800" },
  { email: "leo@aibuddy.com",   password: "bestager123", label: "Bestager",     icon: "🌿", color: "text-emerald-300",bg: "bg-emerald-950/50",border: "border-emerald-800" },
  { email: "max@aibuddy.com",   password: "mittel123",   label: "Mittlerweiler",icon: "⚖️", color: "text-blue-300",   bg: "bg-blue-950/50",   border: "border-blue-800" },
  { email: "noa@aibuddy.com",   password: "newgen123",   label: "Newgen",       icon: "🚀", color: "text-violet-300", bg: "bg-violet-950/50", border: "border-violet-800" },
  { email: "lumi@aibuddy.com",  password: "young123",    label: "Youngsters",   icon: "⭐", color: "text-yellow-300", bg: "bg-yellow-950/50", border: "border-yellow-800" },
];

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
    await new Promise((r) => setTimeout(r, 300));

    const account = DEMO_ACCOUNTS[email.toLowerCase()];
    if (!account || account.password !== password) {
      setError("E-Mail oder Passwort falsch.");
      setLoading(false);
      return;
    }

    const user = { name: account.name, email, role: account.role, usecase: account.usecase };
    saveSession(user);
    router.push(getDashboardPath(user));
  };

  const fill = (e: string, p: string) => { setEmail(e); setPassword(p); setError(""); };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-5">

        {/* Logo */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-blue-400">AI Buddy</h1>
          <p className="text-gray-400 text-sm">Melde dich an, um fortzufahren</p>
        </div>

        {/* Login Form */}
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

        {/* System Demo-Zugänge */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">System-Zugänge</p>
          <div className="grid grid-cols-3 gap-2">
            {SYSTEM_DEMOS.map((d) => (
              <button
                key={d.email}
                onClick={() => fill(d.email, d.password)}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-center transition-colors space-y-0.5"
              >
                <div className={`font-bold text-sm ${d.color}`}>{d.label}</div>
                <div className="text-gray-500 text-xs">{d.password}</div>
              </button>
            ))}
          </div>
        </div>

        {/* UseCase Demo-Zugänge */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">AI Buddy UseCases</p>
          <div className="grid grid-cols-1 gap-2">
            {USECASE_DEMOS.map((d) => (
              <button
                key={d.email}
                onClick={() => fill(d.email, d.password)}
                className={`${d.bg} border ${d.border} rounded-xl p-3 text-left transition-all hover:scale-[1.01] flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{d.icon}</span>
                  <span className={`font-semibold text-sm ${d.color}`}>{d.label}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">{d.email}</div>
                  <div className="text-xs text-gray-500">{d.password}</div>
                </div>
              </button>
            ))}
          </div>
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
