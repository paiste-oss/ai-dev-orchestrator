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
 *  Bei 401 wird die Session gelöscht und zur Login-Seite weitergeleitet. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    clearSession();
    window.location.replace("/login");
    // Promise niemals auflösen — verhindert dass Aufrufer nach dem Redirect
    // noch res.json() lesen und "Failed to fetch" werfen.
    return new Promise(() => {});
  }
  return res;
}

/** Fetch-Wrapper für FormData/Multipart-Uploads.
 *  Kein Content-Type Header setzen — Browser setzt multipart/boundary automatisch.
 *  Bei 401 wird die Session gelöscht und zur Login-Seite weitergeleitet. */
export async function apiFetchForm(url: string, formData: FormData): Promise<Response> {
  const token = getToken();
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    clearSession();
    window.location.replace("/login");
    return new Promise(() => {});
  }
  return res;
}
