"use client";

/**
 * @deprecated Auth-Check und Sidebar-State werden jetzt von /admin/layout.tsx verwaltet.
 * Dieser Hook kann aus allen Admin-Seiten entfernt werden.
 */
export function useAdminPage() {
  // Leer — nur als Übergangs-Stub damit bestehende Imports nicht brechen.
  // TODO: Alle Aufrufe in Admin-Seiten entfernen.
  return {
    mounted: true,
    sidebarOpen: false,
    setSidebarOpen: (_: boolean) => {},
  };
}
