"use client";

export type UserRole = "admin" | "enterprise" | "user";

export interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
}

export function saveSession(user: AuthUser) {
  localStorage.setItem("aibuddy_user", JSON.stringify(user));
}

export function getSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("aibuddy_user");
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem("aibuddy_user");
}

export function getDashboardPath(role: UserRole): string {
  return `/${role}`;
}
