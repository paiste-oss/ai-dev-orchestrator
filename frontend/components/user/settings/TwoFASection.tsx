"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";
import { useT } from "@/lib/i18n";

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-colors";

type Step = "idle" | "send" | "verify";

interface Props {
  twoFaEnabled: boolean;
  phoneVerified: boolean;
  phone: string | null;
  onStatusChange: (enabled: boolean, phone: string) => void;
}

export function TwoFASection({ twoFaEnabled, phoneVerified, phone, onStatusChange }: Props) {
  const t = useT();
  const [step, setStep] = useState<Step>("idle");
  const [phoneInput, setPhoneInput] = useState(phone ?? "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    if (ok) setTimeout(() => setMsg(null), 4000);
  };

  // ── Schritt 1: OTP an Nummer senden ──────────────────────────────────────

  const sendOtp = async () => {
    if (!phoneInput.trim()) { showMsg(t("s.twofa_enter_phone"), false); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/auth/2fa/send-otp`, {
        method: "POST",
        body: JSON.stringify({ phone: phoneInput.trim() }),
      });
      if (res.ok) {
        setStep("verify");
        showMsg(t("s.twofa_code_sent"), true);
      } else {
        const e = await res.json().catch(() => ({}));
        showMsg(e.detail ?? t("s.error"), false);
      }
    } finally { setLoading(false); }
  };

  // ── Schritt 2: OTP bestätigen + 2FA aktivieren ────────────────────────────

  const enableTwoFA = async () => {
    if (otp.length !== 6) { showMsg(t("s.twofa_enter_code"), false); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/auth/2fa/enable`, {
        method: "POST",
        body: JSON.stringify({ code: otp }),
      });
      if (res.ok) {
        onStatusChange(true, phoneInput.trim());
        setStep("idle");
        setOtp("");
        showMsg(t("s.twofa_activated"), true);
      } else {
        const e = await res.json().catch(() => ({}));
        showMsg(e.detail ?? t("s.twofa_invalid_code"), false);
      }
    } finally { setLoading(false); }
  };

  // ── 2FA deaktivieren ──────────────────────────────────────────────────────

  const disableTwoFA = async () => {
    if (!password) { showMsg(t("s.twofa_enter_pw"), false); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/auth/2fa/disable`, {
        method: "POST",
        body: JSON.stringify({ current_password: password }),
      });
      if (res.ok) {
        onStatusChange(false, phoneInput);
        setStep("idle");
        setPassword("");
        showMsg(t("s.twofa_deactivated"), true);
      } else {
        const e = await res.json().catch(() => ({}));
        showMsg(e.detail ?? t("s.error"), false);
      }
    } finally { setLoading(false); }
  };

  return (
    <Section title={t("s.twofa_title")} icon="🔒">
      <div className="space-y-4">

        {/* Status-Badge */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">
              {twoFaEnabled ? t("s.twofa_on") : t("s.twofa_off")}
            </p>
            {twoFaEnabled && phone && (
              <p className="text-xs text-gray-500 mt-0.5">{t("s.twofa_phone", { phone })}</p>
            )}
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${twoFaEnabled ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"}`}>
            {twoFaEnabled ? t("s.twofa_status_on") : t("s.twofa_status_off")}
          </span>
        </div>

        {/* ── 2FA aktivieren ── */}
        {!twoFaEnabled && (
          <>
            {step === "idle" && (
              <button
                onClick={() => setStep("send")}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors"
              >
                {t("s.twofa_enable_btn")}
              </button>
            )}

            {step === "send" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">{t("s.twofa_phone_label")}</label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    placeholder="+41791234567"
                    className={inputCls}
                  />
                  <p className="text-xs text-gray-600">{t("s.twofa_phone_format")}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setStep("idle"); setMsg(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors">
                    {t("s.cancel")}
                  </button>
                  <button onClick={sendOtp} disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-40">
                    {loading ? t("s.twofa_sending") : t("s.twofa_send_btn")}
                  </button>
                </div>
              </div>
            )}

            {step === "verify" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">{t("s.twofa_code_label")}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    autoFocus
                    className={`${inputCls} text-center text-xl tracking-widest`}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setStep("send"); setOtp(""); setMsg(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors">
                    {t("s.twofa_back")}
                  </button>
                  <button onClick={enableTwoFA} disabled={loading || otp.length !== 6}
                    className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-40">
                    {loading ? t("s.twofa_confirming") : t("s.twofa_confirm")}
                  </button>
                </div>
                <button onClick={sendOtp} disabled={loading}
                  className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1">
                  {t("s.twofa_resend")}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 2FA deaktivieren ── */}
        {twoFaEnabled && (
          <>
            {step === "idle" && (
              <button
                onClick={() => setStep("send")}
                className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                {t("s.twofa_disable_btn")}
              </button>
            )}

            {step === "send" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">{t("s.twofa_pw_label")}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setStep("idle"); setPassword(""); setMsg(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors">
                    {t("s.cancel")}
                  </button>
                  <button onClick={disableTwoFA} disabled={loading || !password}
                    className="flex-1 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-40">
                    {loading ? t("s.twofa_deactivating") : t("s.twofa_deactivate")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
        )}

      </div>
    </Section>
  );
}
