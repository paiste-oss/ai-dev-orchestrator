"use server";

import { BACKEND_URL_SERVER } from "@/lib/config-server";
import type { UserRole } from "@/lib/auth";

// ── Rückgabetypen ─────────────────────────────────────────────────────────────

export type RegisterState =
  | null
  | { status: "error"; message: string }
  | { status: "ok"; token: string; name: string; email: string; role: UserRole; firstName: string };

// ── Registrierung ─────────────────────────────────────────────────────────────

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  // Honeypot — Bot-Schutz (verstecktes Feld, echte User füllen es nicht aus)
  if (formData.get("website")) return { status: "error", message: "" };

  const vorname            = (formData.get("vorname") as string | null)?.trim() ?? "";
  const nachname           = (formData.get("nachname") as string | null)?.trim() ?? "";
  const rufname            = (formData.get("rufname") as string | null)?.trim() ?? "";
  const email              = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const mobile             = (formData.get("mobile") as string | null)?.trim() ?? "";
  const passwort           = (formData.get("passwort") as string | null) ?? "";
  const passwortBestaetigung = (formData.get("passwortBestaetigung") as string | null) ?? "";
  const geburtstag         = (formData.get("geburtstag") as string | null) ?? "";
  const geburtsmonat       = (formData.get("geburtsmonat") as string | null) ?? "";
  const geburtsjahr        = (formData.get("geburtsjahr") as string | null) ?? "";
  const language           = (formData.get("language") as string | null) ?? "de";
  // Checkboxen senden "on" wenn aktiviert, nichts wenn deaktiviert
  const tosAccepted        = formData.get("tos_accepted") === "on";
  const memoryConsent      = formData.get("memory_consent") === "on";

  // Server-seitige Validierung (redundant zu Client, aber Pflicht)
  if (!vorname) return { status: "error", message: "Vorname erforderlich." };
  if (!email)   return { status: "error", message: "E-Mail erforderlich." };
  if (!tosAccepted) return { status: "error", message: "Bitte AGB und Datenschutzerklärung akzeptieren." };
  if (!geburtstag || !geburtsmonat || !geburtsjahr) {
    return { status: "error", message: "Bitte vollständiges Geburtsdatum angeben." };
  }
  if (passwort !== passwortBestaetigung) {
    return { status: "error", message: "Passwörter stimmen nicht überein." };
  }
  if (passwort.length < 8) {
    return { status: "error", message: "Passwort muss mindestens 8 Zeichen haben." };
  }

  const birthDate = `${geburtsjahr}-${String(Number(geburtsmonat)).padStart(2, "0")}-${String(Number(geburtstag)).padStart(2, "0")}`;

  try {
    const res = await fetch(`${BACKEND_URL_SERVER}/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: rufname || vorname || `${vorname} ${nachname}`.trim(),
        first_name: vorname || null,
        last_name:  nachname || null,
        email,
        password:   passwort,
        birth_year: Number(geburtsjahr) || null,
        birth_date: birthDate,
        tos_accepted:   tosAccepted,
        memory_consent: memoryConsent,
        phone: mobile || null,
      }),
      cache: "no-store",
    });

    const data: Record<string, unknown> = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data.detail;
      const message = Array.isArray(detail)
        ? (detail as Array<{ msg?: string }>).map(e => e.msg ?? "").filter(Boolean).join(" · ") || "Registrierung fehlgeschlagen."
        : (typeof detail === "string" ? detail : "Registrierung fehlgeschlagen.");
      return { status: "error", message };
    }

    // Sprache direkt im Backend speichern
    try {
      await fetch(`${BACKEND_URL_SERVER}/v1/user/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.access_token as string}`,
        },
        body: JSON.stringify({ language }),
        cache: "no-store",
      });
    } catch { /* ignorieren — User kann es in Einstellungen ändern */ }

    return {
      status: "ok",
      token:     data.access_token as string,
      name:      data.name as string,
      email:     data.email as string,
      role:      data.role as UserRole,
      firstName: vorname,
    };
  } catch {
    return { status: "error", message: "Server nicht erreichbar. Bitte später nochmals versuchen." };
  }
}
