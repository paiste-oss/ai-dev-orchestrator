"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";

/**
 * Gemeinsames Admin-Layout.
 * Stellt bereit: Auth-Guard, AdminSidebar, Mobile-Header, Dark-Wrapper.
 * Alle /admin/** Seiten erben dieses Layout automatisch.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="h-[100dvh] bg-gray-950 text-white flex overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile-Header — nur auf kleinen Bildschirmen sichtbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-950/80 backdrop-blur-md border-b border-white/5 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Menü öffnen"
          >
            ☰
          </button>
          <span className="text-sm font-bold text-yellow-400">Baddi Admin</span>
        </header>

        {/* Scroll-Container für den Seiteninhalt */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
