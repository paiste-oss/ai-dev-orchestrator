"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface EmailMsg {
  id: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string;
  body_text: string | null;
  received_at: string;
  read: boolean;
  sender_trusted: boolean;
  baddi_action: string | null;
  replied: boolean;
}

type Tab = "trusted" | "untrusted";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  return `${date}, ${time}`;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ChevronIcon({ down }: { down: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${down ? "rotate-180" : ""}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function EmailWindow() {
  const [messages, setMessages] = useState<EmailMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("trusted");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox?limit=100`);
      if (res.ok) setMessages(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const trusted = messages.filter(m => m.sender_trusted);
  const untrusted = messages.filter(m => !m.sender_trusted);
  const shown = tab === "trusted" ? trusted : untrusted;

  async function markRead(id: string) {
    await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/read`, { method: "PUT" });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
  }

  function toggleExpand(id: string, isRead: boolean) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
    if (!isRead) markRead(id);
  }

  async function trustSender(id: string) {
    setActionPending(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/trust`, { method: "POST" });
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, sender_trusted: true } : m));
      }
    } finally { setActionPending(null); }
  }

  async function blockSender(id: string) {
    setActionPending(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/block`, { method: "POST" });
      if (res.ok) {
        const blocked = messages.find(m => m.id === id)?.from_address.toLowerCase();
        setMessages(prev => prev.filter(m => m.from_address.toLowerCase() !== blocked));
        setExpanded(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    } finally { setActionPending(null); }
  }

  async function deleteMsg(id: string) {
    setActionPending(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== id));
        setExpanded(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    } finally { setActionPending(null); }
  }

  async function sendReply(id: string) {
    if (!replyText.trim()) return;
    setSending(id);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ reply_text: replyText }),
      });
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, replied: true } : m));
        setReplyOpen(null);
        setReplyText("");
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.detail ?? "Senden fehlgeschlagen");
      }
    } finally { setSending(null); }
  }

  return (
    <div className="flex flex-col h-full text-white overflow-hidden">

      {/* Tabs + Refresh */}
      <div className="flex items-center shrink-0 border-b border-white/6">
        {([
          ["trusted",   "Vertrauenswürdig", trusted],
          ["untrusted", "Unbekannt",         untrusted],
        ] as [Tab, string, EmailMsg[]][]).map(([key, label, list]) => {
          const unread = list.filter(m => !m.read).length;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {label}
              {unread > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  tab === key ? "bg-indigo-500/30 text-indigo-300" : "bg-white/10 text-gray-400"
                }`}>
                  {unread}
                </span>
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={load} disabled={loading}
          className="p-1.5 mr-2 rounded-lg text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40"
          title="Aktualisieren"
        >
          <RefreshIcon spinning={loading} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2 text-xs text-red-300 shrink-0 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">Lädt…</div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-3xl opacity-20">✉️</span>
            <p className="text-gray-600 text-xs">
              {tab === "trusted" ? "Noch keine Mails von vertrauenswürdigen Absendern." : "Keine unbekannten Absender."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {shown.map(msg => {
              const isExpanded = expanded.has(msg.id);
              const isReplyCompose = replyOpen === msg.id;
              const isPending = actionPending === msg.id;

              return (
                <div key={msg.id} className={`${!msg.read ? "bg-white/[0.025]" : ""}`}>

                  {/* Row */}
                  <div
                    className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/4 transition-colors"
                    onClick={() => toggleExpand(msg.id, msg.read)}
                  >
                    {/* Unread dot */}
                    <div className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full flex-none"
                      style={{ backgroundColor: !msg.read ? "rgb(129,140,248)" : "transparent" }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">{msg.from_address}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">{fmtDate(msg.received_at)}</span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${msg.read ? "text-gray-500" : "text-gray-300"}`}>
                        {msg.subject || "(kein Betreff)"}
                      </p>
                      {!isExpanded && (
                        <>
                          {msg.body_text && (
                            <p className="text-[11px] text-gray-600 truncate mt-0.5">
                              {msg.body_text.slice(0, 80)}
                            </p>
                          )}
                          {msg.sender_trusted && msg.baddi_action && (
                            <p className="text-[10px] text-emerald-500/80 mt-0.5 truncate">
                              ↳ {msg.baddi_action}
                            </p>
                          )}
                          {msg.replied && (
                            <span className="inline-block text-[10px] text-indigo-400/70 mt-0.5">↩ Beantwortet</span>
                          )}
                        </>
                      )}
                    </div>

                    <div className="text-gray-600 shrink-0 mt-1">
                      <ChevronIcon down={isExpanded} />
                    </div>
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="px-5 pb-3 space-y-2.5">

                      {/* Meta */}
                      <p className="text-[10px] text-gray-600">
                        Von: <span className="text-gray-400">{msg.from_address}</span>
                        <span className="mx-1.5">·</span>
                        {fmtDate(msg.received_at)}
                        {msg.replied && (
                          <span className="ml-2 text-indigo-400/70">↩ Beantwortet</span>
                        )}
                      </p>

                      {/* Body text */}
                      {msg.body_text && (
                        <div className="bg-gray-900/60 rounded-xl px-3 py-2.5 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-44 overflow-auto border border-white/5">
                          {msg.body_text}
                        </div>
                      )}

                      {/* Baddi action — trusted only */}
                      {msg.sender_trusted && (
                        msg.baddi_action ? (
                          <div className="flex items-start gap-2 bg-emerald-950/40 border border-emerald-800/30 rounded-xl px-3 py-2.5">
                            <span className="text-emerald-400 text-sm shrink-0 mt-0.5">🤖</span>
                            <div>
                              <p className="text-[10px] text-emerald-500/70 font-medium mb-0.5">Baddi hat unternommen:</p>
                              <p className="text-xs text-emerald-300 leading-relaxed">{msg.baddi_action}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-gray-600 flex items-center gap-1.5">
                            <span>🤖</span>
                            <span>Baddi hat diese E-Mail noch nicht verarbeitet.</span>
                          </p>
                        )
                      )}

                      {/* Actions — untrusted only */}
                      {!msg.sender_trusted && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={e => { e.stopPropagation(); setReplyOpen(isReplyCompose ? null : msg.id); setReplyText(""); }}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                          >
                            ↩ Beantworten
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); trustSender(msg.id); }}
                            disabled={isPending}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors disabled:opacity-40"
                          >
                            ✓ Vertrauen
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); blockSender(msg.id); }}
                            disabled={isPending}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors disabled:opacity-40"
                          >
                            🚫 Sperren
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteMsg(msg.id); }}
                            disabled={isPending}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-40"
                          >
                            🗑 Löschen
                          </button>
                        </div>
                      )}

                      {/* Reply compose */}
                      {isReplyCompose && (
                        <div className="space-y-2 pt-0.5" onClick={e => e.stopPropagation()}>
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder="Antwort schreiben…"
                            rows={4}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => sendReply(msg.id)}
                              disabled={!replyText.trim() || sending === msg.id}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors disabled:opacity-40"
                            >
                              {sending === msg.id ? "Sendet…" : "Senden"}
                            </button>
                            <button
                              onClick={() => { setReplyOpen(null); setReplyText(""); }}
                              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-[11px] transition-colors"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
