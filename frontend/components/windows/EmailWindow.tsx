"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { useT } from "@/lib/i18n";
import WindowFrame from "./WindowFrame";

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
  archived: boolean;
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
    <svg className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ChevronIcon({ down }: { down: boolean }) {
  return (
    <svg className={`w-3 h-3 transition-transform ${down ? "rotate-180" : ""}`} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function EmailWindow() {
  const t = useT();
  const [messages, setMessages] = useState<EmailMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("trusted");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const [baddiBusy, setBaddiBusy] = useState<Set<string>>(new Set());
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

  function updateMsg(id: string, patch: Partial<EmailMsg>) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  function removeMsg(id: string) {
    setMessages(prev => prev.filter(m => m.id !== id));
    setExpanded(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  async function markRead(id: string) {
    await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/read`, { method: "PUT" });
    updateMsg(id, { read: true });
  }

  function toggleExpand(id: string, isRead: boolean) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
    if (!isRead) markRead(id);
    if (expanded.has(id)) {
      if (replyOpen === id) setReplyOpen(null);
      if (refineOpen === id) setRefineOpen(null);
    }
  }

  async function trustSender(id: string) {
    setActionPending(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/trust`, { method: "POST" });
      if (res.ok) updateMsg(id, { sender_trusted: true });
    } finally { setActionPending(null); }
  }

  async function blockSender(id: string) {
    setActionPending(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/block`, { method: "POST" });
      if (res.ok) {
        const blocked = messages.find(m => m.id === id)?.from_address.toLowerCase();
        setMessages(prev => prev.filter(m => m.from_address.toLowerCase() !== blocked));
      }
    } finally { setActionPending(null); }
  }

  async function deleteMsg(id: string) {
    setActionPending(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}`, { method: "DELETE" });
      if (res.ok) removeMsg(id);
    } finally { setActionPending(null); }
  }

  async function archiveMsg(id: string) {
    setActionPending(id);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/archive`, { method: "POST" });
      if (res.ok) removeMsg(id);
    } finally { setActionPending(null); }
  }

  async function sendReply(id: string) {
    if (!replyText.trim()) return;
    setReplySending(id);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ reply_text: replyText }),
      });
      if (res.ok) {
        updateMsg(id, { replied: true });
        setReplyOpen(null);
        setReplyText("");
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.detail ?? "Senden fehlgeschlagen");
      }
    } finally { setReplySending(null); }
  }

  async function askBaddi(id: string) {
    setBaddiBusy(prev => new Set(prev).add(id));
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/ask-baddi`, { method: "POST" });
      if (res.ok) {
        const updated: EmailMsg = await res.json();
        updateMsg(id, { baddi_action: updated.baddi_action });
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.detail ?? "Baddi konnte keinen Entwurf generieren");
      }
    } finally {
      setBaddiBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function refineBaddi(id: string) {
    if (!refineText.trim()) return;
    setBaddiBusy(prev => new Set(prev).add(id));
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/refine`, {
        method: "POST",
        body: JSON.stringify({ instruction: refineText }),
      });
      if (res.ok) {
        const updated: EmailMsg = await res.json();
        updateMsg(id, { baddi_action: updated.baddi_action });
        setRefineText("");
        setRefineOpen(null);
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.detail ?? "Anpassen fehlgeschlagen");
      }
    } finally {
      setBaddiBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function executeBaddi(id: string) {
    setBaddiBusy(prev => new Set(prev).add(id));
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/email/inbox/${id}/execute`, { method: "POST" });
      if (res.ok) {
        const updated: EmailMsg = await res.json();
        updateMsg(id, { replied: updated.replied, baddi_action: updated.baddi_action });
        setRefineOpen(null);
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.detail ?? "Ausführen fehlgeschlagen");
      }
    } finally {
      setBaddiBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  return (
    <WindowFrame>

      {/* Tabs + Refresh */}
      <div className="flex items-center shrink-0 border-b window-border-soft">
        {([
          ["trusted",   t("email.trusted_tab"),   trusted],
          ["untrusted", t("email.untrusted_tab"),  untrusted],
        ] as [Tab, string, EmailMsg[]][]).map(([key, label, list]) => {
          const unread = list.filter(m => !m.read).length;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-[var(--accent)] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {label}
              {unread > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  tab === key ? "bg-[var(--accent-30)] text-[var(--accent-light)]" : "bg-white/10 text-gray-400"
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
          title={t("email.refresh")}
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
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">{t("email.loading")}</div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-3xl opacity-20">✉️</span>
            <p className="text-gray-600 text-xs">
              {tab === "trusted" ? t("email.no_trusted") : t("email.no_untrusted")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {shown.map(msg => {
              const isExpanded = expanded.has(msg.id);
              const isReplyCompose = replyOpen === msg.id;
              const isRefineOpen = refineOpen === msg.id;
              const isPending = actionPending === msg.id;
              const isBaddiBusy = baddiBusy.has(msg.id);
              const hasPendingProposal = !!msg.baddi_action && !msg.replied;
              const hasExecutedProposal = !!msg.baddi_action && msg.replied;

              return (
                <div key={msg.id} className={`${!msg.read ? "bg-white/[0.025]" : ""}`}>

                  {/* Row */}
                  <div
                    className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/4 transition-colors"
                    onClick={() => toggleExpand(msg.id, msg.read)}
                  >
                    <div className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full flex-none"
                      style={{ backgroundColor: !msg.read ? "rgb(129,140,248)" : "transparent" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">{msg.from_address}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">{fmtDate(msg.received_at)}</span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${msg.read ? "text-gray-500" : "text-gray-300"}`}>
                        {msg.subject || t("email.no_subject")}
                      </p>
                      {!isExpanded && (
                        <>
                          {msg.body_text && (
                            <p className="text-[11px] text-gray-600 truncate mt-0.5">
                              {msg.body_text.slice(0, 80)}
                            </p>
                          )}
                          {hasPendingProposal && (
                            <p className="text-[10px] text-amber-400/70 mt-0.5 truncate">
                              ✏️ {t("email.draft_pending")}
                            </p>
                          )}
                          {hasExecutedProposal && (
                            <p className="text-[10px] text-emerald-500/80 mt-0.5 truncate">
                              ✓ {t("email.replied_by_baddi")}
                            </p>
                          )}
                          {msg.replied && !msg.baddi_action && (
                            <span className="inline-block text-[10px] text-[var(--accent-light)] mt-0.5">{t("email.replied")}</span>
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
                    <div className="px-5 pb-3 space-y-2.5" onClick={e => e.stopPropagation()}>

                      {/* Meta */}
                      <p className="text-[10px] text-gray-600">
                        Von: <span className="text-gray-400">{msg.from_address}</span>
                        <span className="mx-1.5">·</span>
                        {fmtDate(msg.received_at)}
                        {msg.replied && (
                          <span className="ml-2 text-[var(--accent-light)]">{t("email.replied")}</span>
                        )}
                      </p>

                      {/* Body */}
                      {msg.body_text && (
                        <div className="bg-gray-900/60 rounded-xl px-3 py-2.5 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-44 overflow-auto border border-white/5">
                          {msg.body_text}
                        </div>
                      )}

                      {/* Baddi Proposal */}
                      {hasExecutedProposal ? (
                        <div className="flex items-start gap-2 bg-emerald-950/40 border border-emerald-800/30 rounded-xl px-3 py-2.5">
                          <span className="text-emerald-400 text-sm shrink-0 mt-0.5">🤖</span>
                          <div>
                            <p className="text-[10px] text-emerald-500/70 font-medium mb-0.5">{t("email.replied_label")}</p>
                            <p className="text-xs text-emerald-300 leading-relaxed whitespace-pre-wrap">{msg.baddi_action}</p>
                          </div>
                        </div>
                      ) : hasPendingProposal ? (
                        <div className="bg-amber-950/30 border border-amber-700/30 rounded-xl px-3 py-2.5 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-amber-400 text-sm">✏️</span>
                            <p className="text-[10px] text-amber-400/80 font-medium">{t("email.draft_label")}</p>
                          </div>
                          <p className="text-xs text-amber-100/80 leading-relaxed whitespace-pre-wrap">{msg.baddi_action}</p>

                          {!isRefineOpen && (
                            <div className="flex gap-2 pt-0.5">
                              <button
                                onClick={() => executeBaddi(msg.id)}
                                disabled={isBaddiBusy}
                                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-semibold transition-colors disabled:opacity-40"
                              >
                                {isBaddiBusy ? "…" : t("email.execute")}
                              </button>
                              <button
                                onClick={() => { setRefineOpen(msg.id); setRefineText(""); }}
                                disabled={isBaddiBusy}
                                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-gray-300 transition-colors disabled:opacity-40"
                              >
                                {t("email.adjust")}
                              </button>
                            </div>
                          )}

                          {isRefineOpen && (
                            <div className="space-y-2 pt-1 border-t border-white/8">
                              <p className="text-[10px] text-gray-500">{t("email.refine_hint")}</p>
                              <textarea
                                value={refineText}
                                onChange={e => setRefineText(e.target.value)}
                                placeholder={t("email.refine_placeholder")}
                                rows={3}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] resize-none transition-colors"
                                autoFocus
                                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) refineBaddi(msg.id); }}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => refineBaddi(msg.id)}
                                  disabled={!refineText.trim() || isBaddiBusy}
                                  className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold transition-colors disabled:opacity-40"
                                >
                                  {isBaddiBusy ? t("email.updating") : t("email.update")}
                                </button>
                                <button
                                  onClick={() => { setRefineOpen(null); setRefineText(""); }}
                                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-[11px] transition-colors"
                                >
                                  {t("email.cancel")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => askBaddi(msg.id)}
                          disabled={isBaddiBusy}
                          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-[var(--accent-10)] hover:bg-[var(--accent-20)] text-[var(--accent-light)] transition-colors disabled:opacity-40 w-full justify-center"
                        >
                          {isBaddiBusy ? (
                            <>
                              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".3"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                              {t("email.baddi_thinking")}
                            </>
                          ) : (
                            <>{t("email.ask_baddi")}</>
                          )}
                        </button>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {!msg.sender_trusted && (
                          <button
                            onClick={() => { setReplyOpen(isReplyCompose ? null : msg.id); setReplyText(""); }}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                          >
                            {t("email.reply_btn")}
                          </button>
                        )}
                        {!msg.sender_trusted && (
                          <button
                            onClick={() => trustSender(msg.id)}
                            disabled={isPending}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors disabled:opacity-40"
                          >
                            {t("email.trust")}
                          </button>
                        )}
                        {!msg.sender_trusted && (
                          <button
                            onClick={() => blockSender(msg.id)}
                            disabled={isPending}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors disabled:opacity-40"
                          >
                            {t("email.block")}
                          </button>
                        )}
                        {!msg.sender_trusted && (
                          <button
                            onClick={() => deleteMsg(msg.id)}
                            disabled={isPending}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-40"
                          >
                            {t("email.delete_msg")}
                          </button>
                        )}
                        <button
                          onClick={() => archiveMsg(msg.id)}
                          disabled={isPending}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
                        >
                          {t("email.archive")}
                        </button>
                      </div>

                      {/* Manual reply compose */}
                      {isReplyCompose && (
                        <div className="space-y-2 pt-0.5">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder={t("email.reply_placeholder")}
                            rows={4}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] resize-none transition-colors"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => sendReply(msg.id)}
                              disabled={!replyText.trim() || replySending === msg.id}
                              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold transition-colors disabled:opacity-40"
                            >
                              {replySending === msg.id ? t("email.sending") : t("email.send")}
                            </button>
                            <button
                              onClick={() => { setReplyOpen(null); setReplyText(""); }}
                              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-[11px] transition-colors"
                            >
                              {t("email.cancel")}
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
    </WindowFrame>
  );
}
