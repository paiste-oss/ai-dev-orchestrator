"use client";

import React from "react";

interface SetupModalProps {
  onClose: () => void;
  onNavigate: (href: string) => void;
  onLogout: () => void;
}

const MENU_ITEMS = [
  { icon: "💳", label: "Wallet & Guthaben",  desc: "Guthaben aufladen, Limits, Auto-Topup", href: "/user/wallet" },
  { icon: "📋", label: "Abonnement",          desc: "Plan wechseln, Rechnungen ansehen",     href: "/user/billing" },
  { icon: "📁", label: "Dokumente",           desc: "Hochgeladene Dateien verwalten",        href: "/user/documents" },
  { icon: "⚙",  label: "Einstellungen",       desc: "Profil, Sprache, Benachrichtigungen",  href: "/user/settings" },
];

export default function SetupModal({ onClose, onNavigate, onLogout }: SetupModalProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-2 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Konto & Einstellungen</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        {MENU_ITEMS.map(item => (
          <button
            key={item.href}
            onClick={() => onNavigate(item.href)}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all text-left"
          >
            <span className="text-2xl">{item.icon}</span>
            <div>
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
            <span className="ml-auto text-gray-600 text-sm">→</span>
          </button>
        ))}

        <div className="pt-2 border-t border-white/5">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all text-left"
          >
            <span className="text-2xl">🚪</span>
            <div>
              <p className="text-sm font-semibold text-red-400">Abmelden</p>
              <p className="text-xs text-gray-600">Von Baddi abmelden</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
