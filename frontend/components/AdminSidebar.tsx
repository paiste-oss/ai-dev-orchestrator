"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";

interface NavItem  { label: string; href: string; icon: string; }
interface NavGroup { label: string; icon: string; children: NavItem[]; }
type NavEntry = NavItem | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const NAV: NavEntry[] = [
  { label: "Chat öffnen",      href: "/chat",               icon: "💬" },
  { label: "Analyse",          href: "/admin/analytics",   icon: "◈" },
  { label: "Dashboard",        href: "/admin",              icon: "⬡" },
  { label: "Kunden",           href: "/admin/customers",    icon: "◎" },

  { label: "Entwicklung",      href: "/admin/entwicklung",  icon: "⚗" },
  { label: "Design",           href: "/admin/design",       icon: "◐" },
  {
    label: "Uhrwerk", icon: "⚙",
    children: [
      { label: "Content Guard",  href: "/admin/router",                        icon: "🛡" },
      { label: "Paket",          href: "/admin/uhrwerk/system-prompt",         icon: "⬡" },
      { label: "Tools",          href: "/admin/tools",                         icon: "🔧" },
      { label: "LLM",            href: "/admin/uhrwerk/llm",                   icon: "◈" },
      { label: "Identität",      href: "/admin/uhrwerk/system-prompts",        icon: "📝" },
      { label: "Fenster",        href: "/admin/uhrwerk/fenster",               icon: "⬜" },
      { label: "Memory Manager", href: "/admin/chat-flow/memory-manager",      icon: "🧠" },
      { label: "n8n Workflows",  href: "/admin/workflows",                     icon: "⇆" },
      { label: "Backend Tasks",  href: "/admin/workflows/celery",              icon: "⏱" },
      { label: "Agenten",        href: "/admin/workflows/agents",              icon: "◈" },
      { label: "Wissensbasis",   href: "/admin/knowledge",                     icon: "📚" },
    ],
  },
  {
    label: "Finanzen", icon: "◇",
    children: [
      { label: "Abo-Modell",   href: "/admin/customers/abo-modell",  icon: "◇" },
      { label: "Dolibarr ERP", href: "https://erp.baddi.ch",         icon: "▤" },
    ],
  },
  {
    label: "Konfigurieren", icon: "⊙",
    children: [
      { label: "Portal",        href: "/admin/settings",      icon: "◉" },
      { label: "Integrationen", href: "/admin/integrations",  icon: "⇌" },
    ],
  },
  { label: "System & Health", href: "/admin/system", icon: "◉" },
  { label: "Testseiten", href: "/admin/testpages", icon: "⌘" },
];

interface Props { open: boolean; onClose: () => void; }

export default function AdminSidebar({ open, onClose }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<ReturnType<typeof getSession>>(null);
  useEffect(() => { setUser(getSession()); }, []);

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
    if (href.startsWith("http")) { window.open(href, "_blank"); onClose(); return; }
    router.push(href); onClose();
  };

  // Alle hrefs aus der Nav sammeln für "most-specific wins" Logik
  const allHrefs = NAV.flatMap(e => isGroup(e) ? e.children.map(c => c.href) : [e.href]);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/admin") return false;
    if (!pathname?.startsWith(href)) return false;
    // Nur aktiv wenn kein längerer (spezifischerer) href ebenfalls matcht
    return !allHrefs.some(h => h !== href && h.length > href.length && pathname.startsWith(h));
  };

  return (
    <>
      {/* Mobile-Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60
        bg-gray-900/98 backdrop-blur-md border-r border-white/5
        flex flex-col transition-transform duration-300 ease-out
        ${open ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0
      `}>

        {/* ── Logo ── */}
        <div className="px-5 pt-6 pb-5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <span className="text-gray-900 font-black text-sm">B</span>
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-none">Baddi</p>
              <p className="text-[10px] text-yellow-500/70 font-medium tracking-widest uppercase mt-0.5">Admin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >✕</button>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
          {NAV.map((entry) => {
            if (!isGroup(entry)) {
              const active     = isActive(entry.href);
              const isDivider  = entry.href === "/admin/testpages" || entry.href === "/admin";
              return (
                <div key={entry.href}>
                  {isDivider && <div className="my-2 h-px bg-white/5 mx-1" />}
                  <button
                    onClick={() => navigate(entry.href)}
                    className={`
                      w-full flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl transition-all duration-150 text-left
                      ${active
                        ? "bg-yellow-500/12 text-yellow-400 font-medium"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                      }
                    `}
                  >
                    <span className={`text-base w-5 text-center shrink-0 ${active ? "text-yellow-400" : "text-gray-600"}`}>
                      {entry.icon}
                    </span>
                    <span className="flex-1 truncate">{entry.label}</span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}
                  </button>
                </div>
              );
            }

            const isOpen    = expanded[entry.label];
            const hasActive = entry.children.some(c => isActive(c.href));

            return (
              <div key={entry.label}>
                <button
                  onClick={() => setExpanded(e => ({ ...e, [entry.label]: !e[entry.label] }))}
                  className={`
                    w-full flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl transition-all duration-150 text-left
                    ${hasActive ? "text-yellow-400 font-medium" : "text-gray-400 hover:text-white hover:bg-white/5"}
                  `}
                >
                  <span className={`text-base w-5 text-center shrink-0 ${hasActive ? "text-yellow-400" : "text-gray-600"}`}>
                    {entry.icon}
                  </span>
                  <span className="flex-1 truncate">{entry.label}</span>
                  <span className={`text-gray-600 text-[10px] transition-transform duration-200 shrink-0 ${isOpen ? "rotate-90" : ""}`}>
                    ▶
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-white/5 pl-3">
                    {entry.children.map(child => {
                      const childActive = isActive(child.href);
                      return (
                        <button
                          key={child.href}
                          onClick={() => navigate(child.href)}
                          className={`
                            w-full flex items-center gap-2 text-sm px-2.5 py-2 rounded-lg transition-all duration-150 text-left
                            ${childActive
                              ? "bg-yellow-500/10 text-yellow-400 font-medium"
                              : "text-gray-500 hover:text-white hover:bg-white/5"
                            }
                          `}
                        >
                          <span className="text-xs text-gray-600 shrink-0">{child.icon}</span>
                          <span className="truncate">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Footer: User + Logout ── */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          {/* User-Info */}
          {user && (
            <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-500/30 to-amber-500/20 border border-yellow-500/20 flex items-center justify-center text-xs font-bold text-yellow-400 shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-300 truncate">{user.name}</p>
                <p className="text-[10px] text-gray-600 truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="w-full flex items-center gap-3 text-sm text-gray-500 hover:text-red-400 px-3 py-2.5 rounded-xl hover:bg-red-500/5 transition-all duration-150"
          >
            <span className="w-5 text-center text-base shrink-0">⎋</span>
            <span>Abmelden</span>
          </button>
        </div>
      </aside>
    </>
  );
}
