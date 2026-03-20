"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface CapabilityRequest {
  id: string;
  customer_id: string;
  buddy_id: string | null;
  original_message: string;
  detected_intent: string | null;
  status: string;
  status_label: string;
  tool_proposal: Record<string, unknown> | null;
  dialog: DialogMessage[];
  admin_notes: string | null;
  deployed_tool_key: string | null;
  created_at: string;
  updated_at: string;
}

interface DialogMessage {
  role: "uhrwerk" | "admin";
  content: string;
  created_at: string;
}

// ─── Status-Konfiguration ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:     { label: "Ausstehend",         color: "bg-gray-500/20 text-gray-300 border-gray-500/30",      dot: "bg-gray-400" },
  analyzing:   { label: "Wird analysiert",    color: "bg-blue-500/20 text-blue-300 border-blue-500/30",      dot: "bg-blue-400 animate-pulse" },
  needs_input: { label: "Admin-Input nötig",  color: "bg-amber-500/20 text-amber-300 border-amber-500/30",   dot: "bg-amber-400 animate-pulse" },
  building:    { label: "In Entwicklung",     color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30", dot: "bg-indigo-400 animate-pulse" },
  testing:     { label: "Wird getestet",      color: "bg-purple-500/20 text-purple-300 border-purple-500/30", dot: "bg-purple-400" },
  ready:       { label: "Bereit zum Deploy",  color: "bg-teal-500/20 text-teal-300 border-teal-500/30",      dot: "bg-teal-400" },
  deployed:    { label: "Aktiv im Uhrwerk",   color: "bg-green-500/20 text-green-300 border-green-500/30",   dot: "bg-green-400" },
  rejected:    { label: "Abgelehnt",          color: "bg-red-500/20 text-red-300 border-red-500/30",         dot: "bg-red-400" },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:     ["analyzing", "rejected"],
  analyzing:   ["needs_input", "building", "rejected"],
  needs_input: ["building", "rejected"],
  building:    ["testing", "needs_input", "rejected"],
  testing:     ["ready", "building", "rejected"],
  ready:       ["deployed", "building", "rejected"],
  deployed:    [],
  rejected:    ["pending"],
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-700 text-gray-300 border-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Haupt-Komponente ──────────────────────────────────────────────────────────

export default function EntwicklungDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [req, setReq] = useState<CapabilityRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [waitingReply, setWaitingReply] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [deployKey, setDeployKey] = useState("");
  const [showDeploy, setShowDeploy] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const dialogEndRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await apiFetch(`${BACKEND_URL}/v1/entwicklung/${id}`);
    if (res.ok) {
      const data = await res.json();
      setReq(data);
      if (data.tool_proposal?.tool_name) {
        setDeployKey(String(data.tool_proposal.tool_name));
      }
      return data;
    }
    setLoading(false);
    return null;
  };

  // Polling starten: alle 2s prüfen ob Uhrwerk geantwortet hat
  const startPolling = (prevDialogLength: number) => {
    setWaitingReply(true);
    let attempts = 0;
    const MAX = 20; // max 40s
    pollRef.current = setInterval(async () => {
      attempts++;
      const data = await load();
      const newLength = data?.dialog?.length ?? 0;
      const lastRole = data?.dialog?.[newLength - 1]?.role;
      // Stoppen wenn Uhrwerk geantwortet hat oder Timeout
      if ((newLength > prevDialogLength && lastRole === "uhrwerk") || attempts >= MAX) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setWaitingReply(false);
      }
    }, 2000);
  };

  useEffect(() => {
    load().then((data) => {
      setLoading(false);
      // Wenn Uhrwerk gerade analysiert → automatisch pollen
      if (data?.status === "analyzing") {
        startPolling(data.dialog?.length ?? 0);
      }
    });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [req?.dialog]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/entwicklung/${id}/dialog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setReq(data);
        setMessage("");
        // Polling starten bis Uhrwerk antwortet
        startPolling(data.dialog?.length ?? 0);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(`Fehler ${res.status}: ${err.detail ?? "Unbekannter Fehler"}`);
      }
    } catch (e) {
      setError("Verbindungsfehler — Backend erreichbar?");
    }
    setSending(false);
  };

  const changeStatus = async (newStatus: string) => {
    setStatusChanging(true);
    const res = await apiFetch(`${BACKEND_URL}/v1/entwicklung/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      setReq(data);
    }
    setStatusChanging(false);
  };

  const deployTool = async () => {
    if (!deployKey.trim() || !req?.tool_proposal) return;
    setSending(true);
    const res = await apiFetch(`${BACKEND_URL}/v1/entwicklung/${id}/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool_key: deployKey.trim(), tool_proposal: req.tool_proposal }),
    });
    if (res.ok) {
      const data = await res.json();
      setReq(data);
      setShowDeploy(false);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-950 items-center justify-center text-gray-500">
        <span className="animate-spin mr-2">⟳</span> Laden...
      </div>
    );
  }

  if (!req) {
    return (
      <div className="flex h-screen bg-gray-950 items-center justify-center text-gray-500">
        Nicht gefunden.
      </div>
    );
  }

  const transitions = STATUS_TRANSITIONS[req.status] ?? [];

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/5 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >☰</button>
          <button
            onClick={() => router.push("/admin/entwicklung")}
            className="text-gray-500 hover:text-white transition-colors text-sm flex items-center gap-1"
          >
            ← Entwicklung
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300 truncate">{req.original_message}</p>
          </div>
          <StatusBadge status={req.status} />
        </div>

        <div className="flex-1 px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Linke Spalte: Details + Tool-Vorschlag ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Meta */}
            <div className="rounded-2xl border border-white/5 bg-gray-900/50 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Intent</span>
                  <span className="text-gray-300">{req.detected_intent ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Erstellt</span>
                  <span className="text-gray-300 text-xs">{formatDate(req.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Aktualisiert</span>
                  <span className="text-gray-300 text-xs">{formatDate(req.updated_at)}</span>
                </div>
                {req.deployed_tool_key && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tool-Key</span>
                    <code className="text-green-400 text-xs">{req.deployed_tool_key}</code>
                  </div>
                )}
              </div>
            </div>

            {/* Status-Aktionen */}
            {transitions.length > 0 && (
              <div className="rounded-2xl border border-white/5 bg-gray-900/50 p-4 space-y-3">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status ändern</h2>
                <div className="space-y-2">
                  {transitions.map(t => {
                    const cfg = STATUS_CONFIG[t];
                    return (
                      <button
                        key={t}
                        onClick={() => changeStatus(t)}
                        disabled={statusChanging}
                        className="w-full text-left px-3 py-2.5 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 text-sm text-gray-300 transition disabled:opacity-50"
                      >
                        → {cfg?.label ?? t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tool-Vorschlag */}
            {req.tool_proposal && !req.tool_proposal.parse_error && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Tool-Vorschlag</h2>
                <div className="space-y-2 text-sm">
                  {[
                    ["Name", String(req.tool_proposal.display_name ?? req.tool_proposal.tool_name ?? "")],
                    ["Kategorie", String(req.tool_proposal.category ?? "")],
                    ["API-Typ", String(req.tool_proposal.api_type ?? "").toUpperCase()],
                    ["Komplexität", String(req.tool_proposal.estimated_complexity ?? "")],
                    ["Auth", req.tool_proposal.auth_required ? String(req.tool_proposal.auth_type ?? "Ja") : "Keine"],
                    ["Gratis-Tier", req.tool_proposal.free_tier_available ? "Ja" : "Nein"],
                  ].map(([label, val]) => val && (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-gray-500 shrink-0">{label}</span>
                      <span className="text-gray-300 text-right">{val}</span>
                    </div>
                  ))}
                </div>

                {req.tool_proposal.implementation_notes != null && (
                  <p className="text-xs text-gray-400 border-t border-white/5 pt-3 mt-2">
                    {String(req.tool_proposal.implementation_notes)}
                  </p>
                )}

                {(req.status === "ready" || req.status === "building") && (
                  <div className="border-t border-white/5 pt-3">
                    {!showDeploy ? (
                      <button
                        onClick={() => setShowDeploy(true)}
                        className="w-full py-2 rounded-xl bg-green-500/20 text-green-300 border border-green-500/30 text-sm font-medium hover:bg-green-500/30 transition"
                      >
                        ⬆ Ins Uhrwerk deployen
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={deployKey}
                          onChange={e => setDeployKey(e.target.value)}
                          placeholder="Tool-Key (z.B. web_search)"
                          className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={deployTool}
                            disabled={sending || !deployKey.trim()}
                            className="flex-1 py-2 rounded-xl bg-green-500/20 text-green-300 border border-green-500/30 text-sm font-medium hover:bg-green-500/30 transition disabled:opacity-50"
                          >
                            {sending ? "..." : "✓ Deployen"}
                          </button>
                          <button
                            onClick={() => setShowDeploy(false)}
                            className="px-3 py-2 rounded-xl border border-white/10 text-gray-500 text-sm hover:text-white transition"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Rechte Spalte: Dialog ── */}
          <div className="lg:col-span-2 flex flex-col rounded-2xl border border-white/5 bg-gray-900/30 overflow-hidden" style={{ minHeight: "500px" }}>
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-300">Dialog</span>
              <span className="text-xs text-gray-600">— Uhrwerk & Admin</span>
            </div>

            {/* Nachrichten */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {req.dialog.length === 0 && (
                <p className="text-center text-gray-600 text-sm py-8">Noch keine Nachrichten.</p>
              )}
              {req.dialog.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "admin" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[85%] space-y-1 ${msg.role === "admin" ? "items-end" : "items-start"} flex flex-col`}>
                    <div className={`flex items-center gap-2 text-xs text-gray-600 ${msg.role === "admin" ? "flex-row-reverse" : ""}`}>
                      <span>{msg.role === "admin" ? "Du" : "⚙ Uhrwerk"}</span>
                      <span>{formatDate(msg.created_at)}</span>
                    </div>
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "admin"
                        ? "bg-indigo-600/30 text-indigo-100 border border-indigo-500/20 rounded-tr-sm"
                        : "bg-gray-800/80 text-gray-200 border border-white/5 rounded-tl-sm"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {/* Uhrwerk tippt... */}
              {waitingReply && (
                <div className="flex justify-start">
                  <div className="bg-gray-800/80 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                    Uhrwerk analysiert...
                  </div>
                </div>
              )}

              <div ref={dialogEndRef} />
            </div>

            {/* Fehler */}
            {error && (
              <div className="mx-4 mb-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 ml-3">✕</button>
              </div>
            )}

            {/* Eingabe */}
            {req.status !== "deployed" && req.status !== "rejected" && (
              <div className="border-t border-white/5 p-4">
                <div className="flex gap-3">
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Antworte dem Uhrwerk — z.B. API-Key, Dokumentation, Entscheid..."
                    rows={2}
                    className="flex-1 bg-gray-800/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 resize-none"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !message.trim()}
                    className="self-end px-4 py-3 rounded-xl bg-indigo-600/80 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {sending ? "..." : "Senden"}
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-2">Enter zum Senden · Shift+Enter für Zeilenumbruch</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
