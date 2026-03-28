"use client";

import { type ReactNode } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import { useAdminPage } from "@/hooks/useAdminPage";

interface Props {
  /** Wird im Mobile-Header angezeigt */
  title: string;
  /** Page-Content */
  children: ReactNode;
  /** Tailwind max-w-Klasse für den Inhaltsbereich. Default: max-w-7xl */
  maxWidth?: string;
  /** Kein automatisches Padding/MaxWidth — für Pages mit eigenem Layout */
  fullWidth?: boolean;
}

/**
 * Gemeinsamer Wrapper für alle Admin-Pages.
 * Kapselt: Auth-Check, Sidebar, Mobile-Hamburger-Header, Scroll-Container.
 *
 * Verwendung:
 *   export default function MyPage() {
 *     return (
 *       <AdminPageLayout title="Meine Seite">
 *         <h1>Inhalt</h1>
 *       </AdminPageLayout>
 *     );
 *   }
 */
export default function AdminPageLayout({ title, children, maxWidth = "max-w-7xl", fullWidth = false }: Props) {
  const { mounted, sidebarOpen, setSidebarOpen } = useAdminPage();

  if (!mounted) return null;

  return (
    <div className="h-[100dvh] bg-gray-950 text-white flex overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile-Header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            ☰
          </button>
          <span className="text-sm font-medium text-white">{title}</span>
        </div>

        {/* Scroll-Container */}
        <div className="flex-1 overflow-y-auto">
          {fullWidth ? (
            children
          ) : (
            <div className={`${maxWidth} mx-auto px-4 py-8`}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
