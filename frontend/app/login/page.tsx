"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, saveToken, getDashboardPath } from "@/lib/auth";
import { loginAction, verifyOtpAction, type LoginState } from "./actions";

export default function LoginPage() {
  const router = useRouter();

  const [loginState, loginFormAction, loginPending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );
  const [otpState, otpFormAction, otpPending] = useActionState<LoginState, FormData>(
    verifyOtpAction,
    null,
  );

  // 2FA-Zwischenzustand — kommt aus der Login-Action zurück
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [tempToken, setTempToken] = useState("");
  const [phoneHint, setPhoneHint] = useState("");

  useEffect(() => {
    if (!loginState) return;
    if (loginState.status === "2fa") {
      setTempToken(loginState.tempToken);
      setPhoneHint(loginState.phoneHint);
      setStep("otp");
    }
    if (loginState.status === "ok") {
      saveToken(loginState.token);
      saveSession({ name: loginState.name, email: loginState.email, role: loginState.role });
      router.push(getDashboardPath({ name: loginState.name, email: loginState.email, role: loginState.role }));
    }
  }, [loginState, router]);

  useEffect(() => {
    if (!otpState || otpState.status !== "ok") return;
    saveToken(otpState.token);
    saveSession({ name: otpState.name, email: otpState.email, role: otpState.role });
    router.push(getDashboardPath({ name: otpState.name, email: otpState.email, role: otpState.role }));
  }, [otpState, router]);

  const error =
    step === "credentials"
      ? loginState?.status === "error" ? loginState.message : null
      : otpState?.status === "error" ? otpState.message : null;

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

          {/* Schritt 1: E-Mail + Passwort */}
          {step === "credentials" && (
            <form action={loginFormAction} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-gray-400">E-Mail</label>
                <input
                  name="email"
                  type="email"
                  placeholder="deine@email.com"
                  required
                  autoComplete="email"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">Passwort</label>
                <input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loginPending}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors py-3 rounded-lg font-bold"
              >
                {loginPending ? "Anmelden..." : "Anmelden"}
              </button>
            </form>
          )}

          {/* Schritt 2: OTP-Code */}
          {step === "otp" && (
            <form action={otpFormAction} className="space-y-4">
              {/* temp_token wird als Hidden Field mitgeschickt */}
              <input type="hidden" name="temp_token" value={tempToken} />
              <p className="text-sm text-gray-400">
                Code an <span className="text-white font-medium">{phoneHint}</span> gesendet.
              </p>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">6-stelliger Code</label>
                <input
                  name="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  required
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-blue-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={otpPending}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors py-3 rounded-lg font-bold"
              >
                {otpPending ? "Prüfen..." : "Bestätigen"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("credentials"); setTempToken(""); setPhoneHint(""); }}
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
