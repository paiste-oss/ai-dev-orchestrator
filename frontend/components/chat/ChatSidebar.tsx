"use client";

import React from "react";

interface ChatSidebarProps {
  buddyName: string;
  buddyInitial: string;
  firstName: string;
  onNewChat: () => void;
  onLogout: () => void;
}

export default function ChatSidebar({ buddyName, buddyInitial, firstName, onNewChat, onLogout }: ChatSidebarProps) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-gray-950 border-r border-white/5">
      {/* Logo area */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">{buddyInitial}</span>
          </div>
          <span className="font-bold text-white text-base tracking-tight">{buddyName}</span>
        </div>
      </div>

      {/* New chat button */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Neuer Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 px-3 py-2 overflow-y-auto">
        <p className="text-[11px] text-gray-600 uppercase tracking-widest px-2 mb-2 font-semibold">Gespräche</p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-sm text-gray-200 cursor-default">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="truncate">Aktuelles Gespräch</span>
        </div>
      </div>

      {/* Bottom: user info */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{firstName ? firstName.charAt(0).toUpperCase() : "U"}</span>
          </div>
          <span className="flex-1 text-sm text-gray-300 truncate">{firstName || "Benutzer"}</span>
          <button
            onClick={onLogout}
            title="Abmelden"
            className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
