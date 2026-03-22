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

const STATUS_COLOR: Record<string, string> = {
  pending:   "text-gray-400",
  running:   "text-blue-400",
  completed: "text-emerald-400",
  failed:    "text-red-400",
  paused:    "text-yellow-400",
  cancelled: "text-gray-600",
};

const STATUS_DOT: Record<string, string> = {
  pending:   "bg-gray-500",
  running:   "bg-blue-400 animate-pulse",
  completed: "bg-emerald-400",
  failed:    "bg-red-400",
  paused:    "bg-yellow-400",
  cancelled: "bg-gray-600",
};

// Parst eine Output-Zeile und gibt Stil + Text zurück
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

export default function DevTool() {
  const router = useRouter();
  const [mounted, setMounted]     = useState(false);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [selected, setSelected]   = useState<Task | null>(null);
  const [input, setInput]         = useState("");
  const [priority, setPriority]   = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const outputRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
    const user = getSession();
    if (!user || user.role !== "admin") router.replace("/login");
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/dev-tasks`);
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const sorted = [...data].sort(
        (a: Task, b: Task) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTasks(sorted);
      if (selected) {
        const updated = sorted.find((t: Task) => t.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch {}
  };

  useEffect(() => {
    fetchTasks();
    const iv = setInterval(fetchTasks, 3000);
    return () => clearInterval(iv);
  }, [selected?.id]);

  // Auto-scroll Output
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" });
  }, [selected?.output]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || submitting) return;
    const title = text.split("\n")[0].slice(0, 80);
    setSubmitting(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/dev-tasks`, {
        method: "POST",
        body: JSON.stringify({ title, description: text, priority }),
      });
      const task = await res.json();
      setInput("");
      setPriority(10);
      await fetchTasks();
      setSelected(task);
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
      body: action === "run-now" || action === "retry" ? undefined : JSON.stringify({ status: "cancelled" }),
    });
    fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    await apiFetch(`${BACKEND_URL}/v1/dev-tasks/${taskId}`, { method: "DELETE" });
    if (selected?.id === taskId) setSelected(null);
    fetchTasks();
  };

  const running = tasks.filter(t => t.status === "running").length;
  const pending = tasks.filter(t => t.status === "pending").length;

  if (!mounted) return null;

  const outputLines = (selected?.output ?? "").split("\n").filter(l => l !== "");

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur border-b border-white/5 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white text-lg">←</button>
          <div>
            <h1 className="text-sm font-bold text-yellow-400 leading-none">Dev Orchestrator</h1>
            <p className="text-[10px] text-gray-600 mt-0.5">Claude Code · WSL Runner</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {running > 0 && <span className="text-blue-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />⚡ {running} aktiv</span>}
          {pending > 0 && <span className="text-gray-500">⏳ {pending}</span>}
          <button onClick={() => { clearSession(); router.push("/"); }} className="text-gray-600 hover:text-red-400 transition-colors">⎋</button>
        </div>
      </header>

      {/* Body: links Liste, rechts Terminal */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Linke Spalte: Task-Liste ── */}
        <div className="w-72 shrink-0 border-r border-white/5 flex flex-col overflow-hidden bg-gray-900/50">
          <div className="px-3 py-2 border-b border-white/5">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest">Aufgaben</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tasks.length === 0 && (
              <p className="text-gray-600 text-xs text-center mt-10 px-4">Noch keine Aufgaben.<br/>Eingabe unten starten.</p>
            )}
            {tasks.map(task => (
              <button
                key={task.id}
                onClick={() => setSelected(task)}
                className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/3 transition-colors ${
                  selected?.id === task.id ? "bg-yellow-500/8 border-l-2 border-l-yellow-500" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
                  <span className={`text-[10px] font-mono ${STATUS_COLOR[task.status]}`}>{task.status}</span>
                  {task.token_usage > 0 && (
                    <span className="text-[10px] text-gray-600 ml-auto">{(task.token_usage / 1000).toFixed(1)}k</span>
                  )}
                </div>
                <p className="text-xs text-gray-300 truncate">{task.title}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {new Date(task.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Rechte Spalte: Terminal + Input ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-2xl">⌥</div>
              <p className="text-gray-400 text-sm font-medium">Dev Orchestrator</p>
              <p className="text-gray-600 text-xs max-w-xs">Beschreibe eine Aufgabe im Eingabefeld unten.<br/>Claude Code führt sie direkt auf dem Server aus.</p>
            </div>
          ) : (
            <>
              {/* Task-Header */}
              <div className="px-5 py-3 border-b border-white/5 bg-gray-900/30 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[selected.status]}`} />
                    <p className="text-sm font-semibold text-white truncate">{selected.title}</p>
                    <span className={`text-xs font-mono shrink-0 ${STATUS_COLOR[selected.status]}`}>{selected.status}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(selected.status === "pending" || selected.status === "paused") && (
                      <button onClick={() => handleAction(selected.id, "run-now")} className="text-[11px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-2.5 py-1 rounded-lg transition-colors">▶ Starten</button>
                    )}
                    {selected.status === "failed" && (
                      <button onClick={() => handleAction(selected.id, "retry")} className="text-[11px] bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 px-2.5 py-1 rounded-lg transition-colors">↻ Retry</button>
                    )}
                    {selected.status !== "running" && (
                      <button onClick={() => handleDelete(selected.id)} className="text-[11px] bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 px-2.5 py-1 rounded-lg transition-colors">✕</button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
                  {selected.started_at && <span>Gestartet {new Date(selected.started_at).toLocaleTimeString("de-DE")}</span>}
                  {selected.completed_at && <span>· Fertig {new Date(selected.completed_at).toLocaleTimeString("de-DE")}</span>}
                  {selected.token_usage > 0 && <span>· {selected.token_usage.toLocaleString()} Tokens</span>}
                </div>
              </div>

              {/* Terminal Output */}
              <div
                ref={outputRef}
                className="flex-1 overflow-y-auto bg-gray-950 font-mono text-xs leading-relaxed p-4 space-y-0.5"
              >
                {/* Prompt-Header */}
                <div className="text-gray-600 mb-3 pb-3 border-b border-white/5">
                  <span className="text-yellow-500/60">~/ai-dev-orchestrator</span>
                  <span className="text-gray-600"> $ </span>
                  <span className="text-gray-400">claude -p &quot;{selected.title}&quot;</span>
                </div>

                {selected.error && (
                  <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 mb-3">
                    <p className="text-red-400 font-semibold mb-1">Error</p>
                    <p className="text-red-300 whitespace-pre-wrap">{selected.error}</p>
                  </div>
                )}

                {outputLines.length > 0 ? (
                  outputLines.map((line, i) => {
                    const { cls, text } = parseLine(line);
                    return (
                      <div key={i} className={`${cls} whitespace-pre-wrap break-words`}>
                        {text}
                      </div>
                    );
                  })
                ) : (
                  selected.status === "running" ? (
                    <div className="text-blue-400 animate-pulse">Claude arbeitet…</div>
                  ) : selected.status === "pending" ? (
                    <div className="text-gray-600">Wartet auf Runner…</div>
                  ) : (
                    <div className="text-gray-700">Kein Output.</div>
                  )
                )}

                {/* Cursor bei running */}
                {selected.status === "running" && (
                  <span className="inline-block w-2 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </>
          )}

          {/* ── Chat-Input ── */}
          <div className="border-t border-white/5 bg-gray-900/50 p-3 shrink-0">
            <div className="flex items-end gap-2">
              {/* Priority */}
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

              {/* Textarea */}
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Aufgabe beschreiben… (Enter = senden, Shift+Enter = Zeilenumbruch)"
                  rows={1}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 resize-none transition-colors leading-relaxed"
                  style={{ minHeight: "42px", maxHeight: "160px" }}
                  disabled={submitting}
                />
              </div>

              {/* Send Button */}
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || submitting}
                className="shrink-0 w-10 h-10 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-600 text-gray-900 font-bold flex items-center justify-center transition-colors text-base"
              >
                {submitting ? <span className="animate-spin text-sm">◌</span> : "↑"}
              </button>
            </div>
            <p className="text-[10px] text-gray-700 mt-1.5 px-1">
              Claude Code CLI · WSL Runner · auto git push nach Abschluss
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
