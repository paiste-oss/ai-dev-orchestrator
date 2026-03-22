"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: number;
  status: "pending" | "running" | "completed" | "failed" | "paused" | "cancelled";
  output: string | null;
  error: string | null;
  token_usage: number;
  retry_after: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function parseLine(line: string): { cls: string; text: string } {
  if (line.startsWith("🔧")) return { cls: "text-blue-300",    text: line };
  if (line.startsWith("✓") || line.startsWith("✅")) return { cls: "text-emerald-400", text: line };
  if (line.startsWith("✗") || line.startsWith("❌")) return { cls: "text-red-400",     text: line };
  if (line.startsWith("⚠") || line.startsWith("⏸")) return { cls: "text-yellow-400",  text: line };
  if (line.startsWith("📤") || line.startsWith("🔐")) return { cls: "text-purple-300",  text: line };
  if (line.startsWith("#"))                           return { cls: "text-gray-600",    text: line };
  if (line.startsWith("**") && line.endsWith("**"))  return { cls: "text-white font-semibold", text: line.replace(/\*\*/g, "") };
  if (/^(feat|fix|refactor|chore|docs):/.test(line)) return { cls: "text-yellow-300",  text: line };
  return { cls: "text-gray-300", text: line };
}

const STATUS_DOT: Record<string, string> = {
  pending:   "bg-gray-500",
  running:   "bg-blue-400 animate-pulse",
  completed: "bg-emerald-400",
  failed:    "bg-red-400",
  paused:    "bg-yellow-400",
  cancelled: "bg-gray-600",
};

export default function DevTool() {
  const router = useRouter();
  const [mounted, setMounted]       = useState(false);
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [input, setInput]           = useState("");
  const [priority, setPriority]     = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const user = getSession();
    if (!user || user.role !== "admin") router.replace("/login");
  }, []);

  const fetchTasks = async () => {
    try {
      const res  = await apiFetch(`${BACKEND_URL}/v1/dev-tasks`);
      const data = await res.json();
      if (!Array.isArray(data)) return;
      // Älteste zuerst — Konversations-Reihenfolge
      setTasks([...data].sort(
        (a: Task, b: Task) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ));
    } catch {}
  };

  useEffect(() => {
    fetchTasks();
    const iv = setInterval(fetchTasks, 3000);
    return () => clearInterval(iv);
  }, []);

  // Auto-scroll bei neuem Output
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tasks]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || submitting) return;
    const title = text.split("\n")[0].slice(0, 80);
    setSubmitting(true);
    try {
      await apiFetch(`${BACKEND_URL}/v1/dev-tasks`, {
        method: "POST",
        body: JSON.stringify({ title, description: text, priority }),
      });
      setInput("");
      setPriority(10);
      if (textareaRef.current) textareaRef.current.style.height = "42px";
      await fetchTasks();
    } finally {
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAction = async (taskId: string, action: string) => {
    await apiFetch(`${BACKEND_URL}/v1/dev-tasks/${taskId}/${action}`, {
      method: action === "run-now" || action === "retry" ? "POST" : "PATCH",
      body:   action === "run-now" || action === "retry" ? undefined : JSON.stringify({ status: "cancelled" }),
    });
    fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    await apiFetch(`${BACKEND_URL}/v1/dev-tasks/${taskId}`, { method: "DELETE" });
    fetchTasks();
  };

  const running = tasks.filter(t => t.status === "running").length;
  const pending = tasks.filter(t => t.status === "pending").length;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Header ── */}
      <header className="bg-gray-900/80 backdrop-blur border-b border-white/5 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white text-lg">←</button>
          <div>
            <h1 className="text-sm font-bold text-yellow-400 leading-none">Dev Orchestrator</h1>
            <p className="text-[10px] text-gray-600 mt-0.5">Claude Code · WSL Runner · Memory aktiv</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {running > 0 && (
            <span className="text-blue-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {running} läuft
            </span>
          )}
          {pending > 0 && <span className="text-gray-600">⏳ {pending} wartend</span>}
          <button onClick={() => { clearSession(); router.push("/"); }} className="text-gray-600 hover:text-red-400 transition-colors">⎋</button>
        </div>
      </header>

      {/* ── Terminal-Konversation ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-10 font-mono text-sm">

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-64 text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-2xl">⌥</div>
            <p className="text-gray-400 text-sm font-sans font-medium">Dev Orchestrator</p>
            <p className="text-gray-600 text-xs max-w-sm font-sans">
              Beschreibe eine Aufgabe unten.<br />
              Claude Code führt sie direkt auf dem Server aus.<br />
              <span className="text-gray-700">Die letzten abgeschlossenen Aufgaben werden automatisch als Kontext mitgegeben.</span>
            </p>
          </div>
        )}

        {tasks.map((task) => {
          const outputLines = (task.output ?? "").split("\n").filter(l => l !== "");
          const ts = new Date(task.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={task.id} className="max-w-4xl mx-auto w-full space-y-3">

              {/* ── User-Prompt ── */}
              <div className="group flex items-start gap-2">
                <span className="text-yellow-500/60 mt-0.5 shrink-0 select-none">›</span>
                <div className="flex-1 min-w-0">
                  <span className="text-yellow-100 break-words whitespace-pre-wrap">{task.description}</span>
                  <span className="ml-2 text-gray-700 text-[10px] font-sans">{ts}</span>
                </div>
                {/* Hover-Aktionen */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {(task.status === "pending" || task.status === "paused") && (
                    <button
                      onClick={() => handleAction(task.id, "run-now")}
                      title="Jetzt starten"
                      className="text-[10px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded bg-blue-950/40"
                    >▶</button>
                  )}
                  {task.status === "failed" && (
                    <button
                      onClick={() => handleAction(task.id, "retry")}
                      title="Wiederholen"
                      className="text-[10px] text-orange-400 hover:text-orange-300 px-1.5 py-0.5 rounded bg-orange-950/40"
                    >↻</button>
                  )}
                  {task.status !== "running" && (
                    <button
                      onClick={() => handleDelete(task.id)}
                      title="Löschen"
                      className="text-[10px] text-gray-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-950/20"
                    >✕</button>
                  )}
                </div>
              </div>

              {/* ── Claude-Antwort ── */}
              <div className="ml-4 pl-4 border-l border-gray-800/70 space-y-0.5">

                {/* Metadaten */}
                <div className="flex items-center gap-2 text-[10px] text-gray-700 font-sans mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
                  <span>{task.status}</span>
                  {task.started_at && <span>· {new Date(task.started_at).toLocaleTimeString("de-DE")}</span>}
                  {task.completed_at && <span>→ {new Date(task.completed_at).toLocaleTimeString("de-DE")}</span>}
                  {task.token_usage > 0 && <span>· {(task.token_usage / 1000).toFixed(1)}k Tokens</span>}
                </div>

                {/* Fehler */}
                {task.error && (
                  <div className="bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2 mb-2">
                    <p className="text-red-400 text-xs font-sans">{task.error}</p>
                  </div>
                )}

                {/* Output */}
                {outputLines.length > 0 ? (
                  outputLines.map((line, i) => {
                    const { cls, text } = parseLine(line);
                    return (
                      <div key={i} className={`${cls} whitespace-pre-wrap break-words leading-relaxed`}>
                        {text}
                      </div>
                    );
                  })
                ) : (
                  task.status === "running" ? (
                    <span className="text-blue-400 text-xs font-sans animate-pulse">Claude arbeitet…</span>
                  ) : task.status === "pending" ? (
                    <span className="text-gray-600 text-xs font-sans">Wartet auf Runner…</span>
                  ) : null
                )}

                {/* Cursor bei running */}
                {task.status === "running" && (
                  <span className="inline-block w-2 h-3.5 bg-blue-400 animate-pulse align-middle ml-0.5" />
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="border-t border-white/5 bg-gray-900/60 p-3 shrink-0">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          <select
            value={priority}
            onChange={e => setPriority(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 text-gray-400 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none shrink-0"
          >
            <option value={1}>P1</option>
            <option value={5}>P5</option>
            <option value={10}>P10</option>
            <option value={20}>P20</option>
          </select>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Aufgabe beschreiben… (Enter = senden, Shift+Enter = Zeilenumbruch)"
              rows={1}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 resize-none transition-colors leading-relaxed font-mono"
              style={{ minHeight: "42px", maxHeight: "200px" }}
              disabled={submitting}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
            className="shrink-0 w-10 h-10 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-600 text-gray-900 font-bold flex items-center justify-center transition-colors"
          >
            {submitting ? <span className="animate-spin text-sm">◌</span> : "↑"}
          </button>
        </div>
      </div>
    </div>
  );
}
