"use client";

export type UserRole = "admin" | "enterprise" | "customer" | "user";

export interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  usecase?: string;
}

export function saveSession(user: AuthUser) {
  localStorage.setItem("aibuddy_user", JSON.stringify(user));
}

export function getSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("aibuddy_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem("aibuddy_user");
    localStorage.removeItem("aibuddy_token");
    return null;
  }
}

export function saveToken(token: string) {
  localStorage.setItem("aibuddy_token", token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aibuddy_token");
}

export function clearSession() {
  // User-scoped Keys vor dem Löschen der Session ermitteln
  const user = getSession();
  if (user?.email) {
    const scope = encodeURIComponent(user.email);
    localStorage.removeItem(`baddi:artifacts:${scope}`);
    localStorage.removeItem(`baddi:chatWidth:${scope}`);
    try { sessionStorage.removeItem(`baddi:homeActive:${scope}`); } catch { /* ignored */ }
  }
  // Legacy-Keys die nie user-scoped waren — einmalig entfernen
  localStorage.removeItem("baddi:artifacts");
  localStorage.removeItem("baddi_canvas_cards");
  localStorage.removeItem("aibuddy_user");
  localStorage.removeItem("aibuddy_token");
}

export function getDashboardPath(user: AuthUser): string {
  if (user.role === "admin") return "/admin";
  if (user.role === "enterprise") return "/enterprise";
  // customer + user → chat hub (loads their buddies)
  return "/chat";
}

/** Fetch-Wrapper der den JWT automatisch mitsendet (JSON).
 *  Bei 401 wird die Session gelöscht und zur Login-Seite weitergeleitet.
 *  Bei Netzwerkfehler (kein Server erreichbar) wird ERR_NETWORK geworfen. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error("ERR_NETWORK");
  }
  if (res.status === 401 && typeof window !== "undefined") {
    clearSession();
    window.location.replace("/login");
  }
  return res;
}

/** Fetch-Wrapper für FormData/Multipart-Uploads.
 *  Kein Content-Type Header setzen — Browser setzt multipart/boundary automatisch.
 *  Bei 401 wird die Session gelöscht und zur Login-Seite weitergeleitet. */
export async function apiFetchForm(url: string, formData: FormData): Promise<Response> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  } catch {
    throw new Error("ERR_NETWORK");
  }
  if (res.status === 401 && typeof window !== "undefined") {
    clearSession();
    window.location.replace("/login");
    return new Promise(() => {});
  }
  return res;
}
