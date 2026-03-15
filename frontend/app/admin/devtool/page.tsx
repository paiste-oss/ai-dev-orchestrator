"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/auth";
import { API_ROUTES } from "@/lib/config";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

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

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-gray-700 text-gray-300",
  running:   "bg-blue-900 text-blue-300 animate-pulse",
  completed: "bg-green-900 text-green-300",
  failed:    "bg-red-900 text-red-300",
  paused:    "bg-yellow-900 text-yellow-300",
  cancelled: "bg-gray-800 text-gray-500",
};

const STATUS_ICON: Record<string, string> = {
  pending:   "⏳",
  running:   "⚡",
  completed: "✅",
  failed:    "❌",
  paused:    "⏸",
  cancelled: "🚫",
};

export default function DevTool() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(10);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const user = getSession();
    if (!user || user.role !== "admin") router.replace("/login");
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${BACKEND}/v1/dev-tasks`);
      const data: Task[] = await res.json();
      setTasks(data);
      // selected Task aktuell halten
      if (selected) {
        const updated = data.find(t => t.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch {}
  };

  // Polling alle 3 Sekunden
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [selected?.id]);

  // Output auto-scroll
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" });
  }, [selected?.output]);

  const handleAdd = async () => {
    if (!title.trim() || !description.trim()) return;
    setAdding(true);
    await fetch(`${BACKEND}/v1/dev-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority }),
    });
    setTitle("");
    setDescription("");
    setPriority(10);
    setShowForm(false);
    setAdding(false);
    fetchTasks();
  };

  const handleAction = async (taskId: string, action: string, body?: object) => {
    const url = `${BACKEND}/v1/dev-tasks/${taskId}/${action}`;
    await fetch(url, {
      method: action === "run-now" || action === "retry" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    await fetch(`${BACKEND}/v1/dev-tasks/${taskId}`, { method: "DELETE" });
    if (selected?.id === taskId) setSelected(null);
    fetchTasks();
  };

  const running = tasks.filter(t => t.status === "running").length;
  const pending = tasks.filter(t => t.status === "pending").length;
  const paused  = tasks.filter(t => t.status === "paused").length;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/admin")} className="text-gray-400 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-lg font-bold text-yellow-400">AI Dev Orchestrator</h1>
            <p className="text-xs text-gray-500">Claude arbeitet deine Tasks automatisch ab</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-blue-400">⚡ {running} läuft</span>
          <span className="text-gray-400">⏳ {pending} ausstehend</span>
          {paused > 0 && <span className="text-yellow-400">⏸ {paused} pausiert</span>}
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="text-gray-500 hover:text-red-400 transition-colors"
          >Abmelden</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Linke Spalte: Task-Liste */}
        <div className="w-96 bg-gray-900 border-r border-gray-800 flex flex-col">
          {/* Add Task Button */}
          <div className="p-4 border-b border-gray-800">
            <button
              onClick={() => setShowForm(!showForm)}
              className="w-full bg-yellow-600 hover:bg-yellow-500 py-2 rounded-lg font-bold transition-colors text-sm"
            >
              {showForm ? "✕ Abbrechen" : "+ Neue Aufgabe"}
            </button>

            {showForm && (
              <div className="mt-3 space-y-2">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Titel (kurz)"
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Beschreibe die Aufgabe für Claude genau..."
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-yellow-500 resize-none"
                />
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-gray-400">Priorität:</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(Number(e.target.value))}
                    className="bg-gray-800 border border-gray-700 rounded p-1 text-xs text-white"
                  >
                    <option value={1}>1 — Höchste</option>
                    <option value={5}>5 — Hoch</option>
                    <option value={10}>10 — Normal</option>
                    <option value={20}>20 — Niedrig</option>
                  </select>
                  <button
                    onClick={handleAdd}
                    disabled={adding || !title.trim() || !description.trim()}
                    className="ml-auto bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 px-3 py-1 rounded text-xs font-bold"
                  >
                    {adding ? "..." : "Erstellen"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Task Liste */}
          <div className="flex-1 overflow-y-auto">
            {tasks.length === 0 && (
              <p className="text-gray-500 text-sm text-center mt-12">Keine Aufgaben. Erstelle deine erste!</p>
            )}
            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => setSelected(task)}
                className={`p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${selected?.id === task.id ? "bg-gray-800 border-l-2 border-l-yellow-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500">#{task.priority}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLE[task.status]}`}>
                        {STATUS_ICON[task.status]} {task.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white truncate">{task.title}</p>
                    {task.status === "paused" && task.retry_after && (
                      <p className="text-xs text-yellow-400 mt-0.5">
                        Resume: {new Date(task.retry_after).toLocaleTimeString("de-DE")}
                      </p>
                    )}
                    {task.token_usage > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{task.token_usage.toLocaleString()} Tokens</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rechte Spalte: Task Detail & Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="text-4xl mb-3">🤖</p>
                <p className="text-sm">Wähle eine Aufgabe aus um den Output zu sehen</p>
                <p className="text-xs mt-2 text-gray-600">Claude arbeitet Tasks automatisch ab (alle 30s)</p>
              </div>
            </div>
          ) : (
            <>
              {/* Task Header */}
              <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`text-sm px-2 py-0.5 rounded ${STATUS_STYLE[selected.status]}`}>
                        {STATUS_ICON[selected.status]} {selected.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {selected.completed_at
                          ? `Fertig: ${new Date(selected.completed_at).toLocaleString("de-DE")}`
                          : selected.started_at
                          ? `Gestartet: ${new Date(selected.started_at).toLocaleString("de-DE")}`
                          : `Erstellt: ${new Date(selected.created_at).toLocaleString("de-DE")}`}
                      </span>
                      {selected.token_usage > 0 && (
                        <span className="text-xs text-gray-500">{selected.token_usage.toLocaleString()} Tokens</span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold">{selected.title}</h2>
                  </div>

                  {/* Aktions-Buttons */}
                  <div className="flex gap-2">
                    {(selected.status === "pending" || selected.status === "paused") && (
                      <button
                        onClick={() => handleAction(selected.id, "run-now")}
                        className="text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded transition-colors"
                      >▶ Jetzt starten</button>
                    )}
                    {(selected.status === "failed" || selected.status === "paused" || selected.status === "cancelled") && (
                      <button
                        onClick={() => handleAction(selected.id, "retry")}
                        className="text-xs bg-yellow-700 hover:bg-yellow-600 px-3 py-1.5 rounded transition-colors"
                      >⟳ Retry</button>
                    )}
                    {(selected.status === "pending" || selected.status === "paused") && (
                      <button
                        onClick={() => handleAction(selected.id, "", { status: "cancelled" })}
                        className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors"
                      >✕ Abbrechen</button>
                    )}
                    {selected.status !== "running" && (
                      <button
                        onClick={() => handleDelete(selected.id)}
                        className="text-xs text-red-500 hover:text-red-400 px-2 py-1.5 transition-colors"
                      >🗑</button>
                    )}
                  </div>
                </div>

                {/* Aufgabenbeschreibung */}
                <details className="mt-3">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-200">Aufgabenbeschreibung anzeigen</summary>
                  <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap bg-gray-800 p-3 rounded">{selected.description}</p>
                </details>
              </div>

              {/* Output Log */}
              <div
                ref={outputRef}
                className="flex-1 overflow-y-auto p-6 font-mono text-sm"
              >
                {selected.status === "running" && (
                  <div className="flex items-center gap-2 text-blue-400 mb-4">
                    <span className="animate-spin">⚙</span>
                    <span>Claude arbeitet...</span>
                  </div>
                )}
                {selected.status === "paused" && selected.retry_after && (
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3 mb-4 text-yellow-300 text-sm">
                    ⏸ Rate Limit erreicht — automatischer Neustart um {new Date(selected.retry_after).toLocaleTimeString("de-DE")}
                  </div>
                )}
                {selected.error && (
                  <div className="bg-red-900/30 border border-red-700 rounded p-3 mb-4 text-red-300 text-sm">
                    ❌ {selected.error}
                  </div>
                )}
                {selected.output ? (
                  <pre className="text-gray-300 whitespace-pre-wrap leading-relaxed">{selected.output}</pre>
                ) : (
                  <p className="text-gray-600">Noch kein Output.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
