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
  return raw ? JSON.parse(raw) : null;
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
  if (user.role === "customer" || user.role === "user") {
    if (user.usecase) return `/user/${user.usecase}`;
    return "/user";
  }
  return `/${user.role}`;
}

/** Fetch-Wrapper der den JWT automatisch mitsendet. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}
