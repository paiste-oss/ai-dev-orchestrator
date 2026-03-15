"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { clearSession } from "@/lib/auth";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface NavGroup {
  label: string;
  icon: string;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => "children" in entry;

const NAV: NavEntry[] = [
  { label: "Dashboard",        href: "/admin",           icon: "🏠" },
  { label: "Dev Orchestrator", href: "/admin/devtool",   icon: "🛠️" },
  { label: "Kunden",           href: "/admin/customers", icon: "👥" },
  { label: "AI Baddis",        href: "/admin/buddies",   icon: "🤖" },
  { label: "Dokumente",        href: "/admin/documents", icon: "📁" },
  { label: "Workflows",        href: "/admin/workflows", icon: "⚙️" },
  { label: "Analytik",         href: "/admin/analytics", icon: "📊" },
  {
    label: "Konfigurieren",
    icon: "🔧",
    children: [
      { label: "Portal",       href: "/admin/settings",  icon: "🌐" },
    ],
  },
  { label: "Dev-Portal",       href: "/portal",          icon: "🔬" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AdminSidebar({ open, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // Gruppen die aktuell aufgeklappt sind — auto-expand wenn aktive Unterseite
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV.forEach(entry => {
      if (isGroup(entry)) {
        init[entry.label] = entry.children.some(c => pathname?.startsWith(c.href));
      }
    });
    return init;
  });

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/admin" && pathname?.startsWith(href));

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-56 bg-gray-900 border-r border-gray-800
        flex flex-col p-4 transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0
      `}>
        {/* Logo */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-yellow-400">AI Baddi</h1>
            <p className="text-xs text-gray-500">Admin</p>
          </div>
          <button onClick={onClose} className="md:hidden text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map((entry) => {
            if (!isGroup(entry)) {
              return (
                <button
                  key={entry.href}
                  onClick={() => navigate(entry.href)}
                  className={`w-full flex items-center gap-3 text-sm px-3 py-2 rounded transition-colors text-left ${
                    isActive(entry.href)
                      ? "bg-yellow-400/10 text-yellow-400"
                      : "text-gray-300 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  <span>{entry.icon}</span>
                  <span>{entry.label}</span>
                </button>
              );
            }

            // Aufklappbare Gruppe
            const isOpen = expanded[entry.label];
            const hasActive = entry.children.some(c => isActive(c.href));

            return (
              <div key={entry.label}>
                <button
                  onClick={() => setExpanded(e => ({ ...e, [entry.label]: !e[entry.label] }))}
                  className={`w-full flex items-center gap-3 text-sm px-3 py-2 rounded transition-colors text-left ${
                    hasActive ? "text-yellow-400" : "text-gray-300 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  <span>{entry.icon}</span>
                  <span className="flex-1">{entry.label}</span>
                  <span className={`text-xs text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>▶</span>
                </button>

                {isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-700 pl-3">
                    {entry.children.map(child => (
                      <button
                        key={child.href}
                        onClick={() => navigate(child.href)}
                        className={`w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded transition-colors text-left ${
                          isActive(child.href)
                            ? "bg-yellow-400/10 text-yellow-400"
                            : "text-gray-400 hover:text-white hover:bg-gray-800"
                        }`}
                      >
                        <span className="text-xs">{child.icon}</span>
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Abmelden */}
        <button
          onClick={() => { clearSession(); router.push("/"); }}
          className="flex items-center gap-3 text-sm text-gray-500 hover:text-red-400 px-3 py-2 rounded transition-colors mt-2"
        >
          <span>🚪</span><span>Abmelden</span>
        </button>
      </aside>
    </>
  );
}
