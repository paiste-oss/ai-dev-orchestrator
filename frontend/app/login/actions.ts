"use server";

import { BACKEND_URL_SERVER } from "@/lib/config-server";
import type { UserRole } from "@/lib/auth";

// ── Rückgabetypen ─────────────────────────────────────────────────────────────

export type LoginOkState = {
  status: "ok";
  token: string;
  name: string;
  email: string;
  role: UserRole;
};

export type LoginState =
  | null
  | { status: "error"; message: string }
  | { status: "2fa"; tempToken: string; phoneHint: string }
  | LoginOkState;

// ── Schritt 1: E-Mail + Passwort ──────────────────────────────────────────────

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = (formData.get("email") as string | null)?.toLowerCase().trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { status: "error", message: "E-Mail und Passwort erforderlich." };
  }

  try {
    const res = await fetch(`${BACKEND_URL_SERVER}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    const data: Record<string, unknown> = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { status: "error", message: (data.detail as string) ?? "Anmeldung fehlgeschlagen." };
    }

    if (data.requires_2fa) {
      return {
        status: "2fa",
        tempToken: data.temp_token as string,
        phoneHint: data.phone_hint as string,
      };
    }

    return {
      status: "ok",
      token: data.access_token as string,
      name: data.name as string,
      email: data.email as string,
      role: data.role as UserRole,
    };
  } catch {
    return { status: "error", message: "Verbindungsfehler. Bitte erneut versuchen." };
  }
}

// ── Schritt 2: OTP-Verifikation ───────────────────────────────────────────────

export async function verifyOtpAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const tempToken = (formData.get("temp_token") as string | null) ?? "";
  const code = (formData.get("code") as string | null) ?? "";

  if (!tempToken) {
    return { status: "error", message: "Sitzung abgelaufen. Bitte erneut anmelden." };
  }
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return { status: "error", message: "Code muss genau 6 Ziffern haben." };
  }

  try {
    const res = await fetch(`${BACKEND_URL_SERVER}/v1/auth/verify-2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temp_token: tempToken, code }),
      cache: "no-store",
    });

    const data: Record<string, unknown> = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { status: "error", message: (data.detail as string) ?? "Code ungültig." };
    }

    return {
      status: "ok",
      token: data.access_token as string,
      name: data.name as string,
      email: data.email as string,
      role: data.role as UserRole,
    };
  } catch {
    return { status: "error", message: "Verbindungsfehler. Bitte erneut versuchen." };
  }
}
