"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Overview {
  total_messages: number;
  unique_sessions: number;
  total_tokens: number;
  avg_tokens: number;
  messages_today: number;
  messages_7d: number;
}

interface ResponseType { response_type: string; cnt: number; }
interface DailyCount   { day: string; cnt: number; }
interface HourlyCount  { hour_of_day: number; cnt: number; }

interface Message {
  id: string;
  session_hash: string;
  user_message: string;
  assistant_message: string;
  response_type: string;
  tokens_used: number;
  language: string;
  day: string;
  hour_of_day: number;
  system_prompt_name: string;
  tools_used: string;
  memory_facts: string;
}

const PERIOD_OPTIONS = [7, 14, 30, 90];

const RT_COLORS: Record<string, string> = {
  text:          "#6366f1",
  stock_card:    "#f59e0b",
  stock_history: "#10b981",
  image_gallery: "#ec4899",
  transport_board: "#3b82f6",
  action_buttons: "#8b5cf6",
};

function rtColor(rt: string) { return RT_COLORS[rt] ?? "#6b7280"; }

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-2xl border border-white/5 p-5">
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter();
  const [mounted, setMounted]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [days, setDays]           = useState(30);
  const [overview, setOverview]   = useState<Overview | null>(null);
  const [rtData, setRtData]       = useState<ResponseType[]>([]);
  const [daily, setDaily]         = useState<DailyCount[]>([]);
  const [hourly, setHourly]       = useState<HourlyCount[]>([]);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [rtFilter, setRtFilter]   = useState<string>("");
  const LIMIT = 20;

  const loadOverview = useCallback(async () => {
    const res = await apiFetch(`${BACKEND_URL}/v1/admin/analytics/overview?days=${days}`);
    if (!res.ok) return;
    const data = await res.json();
    setOverview(data.overview);
    setRtData(data.response_types);
    setDaily(data.daily_counts);
    setHourly(data.hourly);
  }, [days]);

  const loadMessages = useCallback(async () => {
    const params = new URLSearchParams({
      days: String(days),
      limit: String(LIMIT),
      offset: String(page * LIMIT),
    });
    if (rtFilter) params.set("response_type", rtFilter);
    const res = await apiFetch(`${BACKEND_URL}/v1/admin/analytics/messages?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.items);
    setTotal(data.total);
  }, [days, page, rtFilter]);

  useEffect(() => {
    setMounted(true);
    const user = getSession();
    if (!user || user.role !== "admin") router.replace("/login");
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { setPage(0); }, [days, rtFilter]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  if (!mounted) return null;

  const totalPages = Math.ceil(total / LIMIT);

  // Stunden-Array 0–23 auffüllen
  const hourlyFull = Array.from({ length: 24 }, (_, h) => ({
    hour_of_day: h,
    cnt: hourly.find(x => x.hour_of_day === h)?.cnt ?? 0,
  }));

  return (
    <div className="h-[100dvh] bg-gray-950 text-white flex overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
            ☰
          </button>
          <span className="text-sm font-medium text-white">Analyse</span>
        </div>
        <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Analyse</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Anonymisierte Chat-Auswertung · kein Personenbezug · DSG-konform
            </p>
          </div>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  days === d
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                {d}T
              </button>
            ))}
          </div>
        </div>

        {/* ── Stat Cards ── */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Nachrichten" value={overview.total_messages.toLocaleString()} sub={`letzte ${days} Tage`} />
            <StatCard label="Heute" value={overview.messages_today} />
            <StatCard label="7 Tage" value={overview.messages_7d} />
            <StatCard label="Sitzungen" value={overview.unique_sessions} />
            <StatCard label="Tokens gesamt" value={(overview.total_tokens ?? 0).toLocaleString()} />
            <StatCard label="Ø Tokens" value={Math.round(overview.avg_tokens ?? 0)} sub="pro Nachricht" />
          </div>
        )}

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Nachrichten pro Tag */}
          <div className="lg:col-span-2 bg-gray-800/60 rounded-2xl border border-white/5 p-5">
            <p className="text-sm font-medium text-gray-300 mb-4">Nachrichten pro Tag</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }}
                  tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip
                  contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8 }}
                  labelStyle={{ color: "#9ca3af" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Line type="monotone" dataKey="cnt" stroke="#6366f1" strokeWidth={2} dot={false} name="Nachrichten" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Response-Typen */}
          <div className="bg-gray-800/60 rounded-2xl border border-white/5 p-5">
            <p className="text-sm font-medium text-gray-300 mb-4">Response-Typen</p>
            <div className="space-y-2">
              {rtData.map(rt => {
                const total_rt = rtData.reduce((s, r) => s + r.cnt, 0);
                const pct = total_rt ? Math.round((rt.cnt / total_rt) * 100) : 0;
                return (
                  <div key={rt.response_type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{rt.response_type}</span>
                      <span className="text-gray-300">{rt.cnt} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: rtColor(rt.response_type) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Aktivität nach Uhrzeit */}
        <div className="bg-gray-800/60 rounded-2xl border border-white/5 p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Aktivität nach Tageszeit</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={hourlyFull} barSize={12}>
              <XAxis dataKey="hour_of_day" tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={h => `${h}h`} interval={2} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8 }}
                labelStyle={{ color: "#9ca3af" }}
                itemStyle={{ color: "#fff" }}
                labelFormatter={h => `${h}:00 Uhr`}
              />
              <Bar dataKey="cnt" name="Nachrichten" radius={[4, 4, 0, 0]}>
                {hourlyFull.map((_, i) => (
                  <Cell key={i} fill={i >= 8 && i <= 20 ? "#6366f1" : "#374151"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Q&A Tabelle ── */}
        <div className="bg-gray-800/60 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-wrap gap-3">
            <p className="text-sm font-medium text-gray-300">
              Frage & Antwort ({total.toLocaleString()} Einträge)
            </p>
            <div className="flex items-center gap-2">
              <select
                value={rtFilter}
                onChange={e => setRtFilter(e.target.value)}
                className="bg-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 border border-white/5 focus:outline-none"
              >
                <option value="">Alle Typen</option>
                {rtData.map(r => (
                  <option key={r.response_type} value={r.response_type}>{r.response_type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Grid-Header (Desktop) */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_2fr] gap-0 border-b border-white/5">
            {["Eingabe (anonym)", "System Prompt · Zeit", "Tools / Workflow", "Antwort Baddi"].map((h, i) => (
              <div key={i} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {h}
              </div>
            ))}
          </div>

          <div className="divide-y divide-white/5">
            {messages.map(msg => (
              <div
                key={msg.id}
                className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
              >
                {/* Grid-Zeile */}
                <div className="md:grid md:grid-cols-[2fr_1fr_1fr_2fr] gap-0 px-0">

                  {/* Spalte 1: Eingabe + Tag/Stunde */}
                  <div className="px-4 py-4 min-w-0">
                    <p className={`text-sm text-white ${expanded !== msg.id ? "line-clamp-2" : "whitespace-pre-wrap"}`}>
                      {msg.user_message}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-600 font-mono">{msg.day}</span>
                      <span className="text-[10px] text-gray-600">{msg.hour_of_day}:00 Uhr</span>
                      <span className="text-[10px] font-mono text-gray-700">{msg.session_hash}</span>
                    </div>
                  </div>

                  {/* Spalte 2: System Prompt */}
                  <div className="px-4 py-4 min-w-0 flex flex-col justify-start gap-1.5">
                    <span className="inline-block text-xs text-indigo-300 bg-indigo-500/10 rounded-lg px-2.5 py-1 font-medium truncate max-w-full">
                      {msg.system_prompt_name || "Standard"}
                    </span>
                    <span
                      className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium w-fit"
                      style={{ background: rtColor(msg.response_type) + "22", color: rtColor(msg.response_type) }}
                    >
                      {msg.response_type}
                    </span>
                    <span className="text-[10px] text-gray-600">{msg.tokens_used} Tokens</span>
                  </div>

                  {/* Spalte 3: Tools */}
                  <div className="px-4 py-4 min-w-0">
                    {msg.tools_used ? (
                      <div className="flex flex-wrap gap-1">
                        {msg.tools_used.split(",").map((t, i) => (
                          <span key={i} className="text-[10px] bg-amber-500/10 text-amber-400 rounded px-2 py-0.5 font-mono">
                            {t.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-700">—</span>
                    )}
                  </div>

                  {/* Spalte 4: Antwort */}
                  <div className="px-4 py-4 min-w-0">
                    <p className={`text-sm text-gray-300 ${expanded !== msg.id ? "line-clamp-3" : "whitespace-pre-wrap"}`}>
                      {msg.assistant_message}
                    </p>
                    <span className="text-[10px] text-gray-700 mt-1 block">
                      {expanded === msg.id ? "▲ einklappen" : "▼ aufklappen"}
                    </span>
                  </div>
                </div>

                {/* Memory-Facts (nur wenn aufgeklappt und vorhanden) */}
                {expanded === msg.id && msg.memory_facts && (
                  <div className="mx-4 mb-4 px-4 py-3 bg-purple-500/8 border border-purple-500/20 rounded-xl">
                    <p className="text-[10px] text-purple-400 uppercase tracking-widest mb-2 font-semibold">
                      Memory Manager — ins Langzeitgedächtnis gelegt
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.memory_facts.split(" | ").filter(Boolean).map((fact, i) => (
                        <span key={i} className="text-xs text-purple-200 bg-purple-500/10 rounded-lg px-2.5 py-1">
                          {fact}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {messages.length === 0 && (
              <p className="px-5 py-12 text-center text-gray-600 text-sm">
                Noch keine Analytics-Daten — sie werden beim nächsten Chat-Turn gespeichert.
              </p>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/5">
              <p className="text-xs text-gray-500">{page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} von {total}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-xs bg-gray-700 text-gray-300 disabled:opacity-30 hover:bg-gray-600 transition-colors"
                >← Zurück</button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-xs bg-gray-700 text-gray-300 disabled:opacity-30 hover:bg-gray-600 transition-colors"
                >Weiter →</button>
              </div>
            </div>
          )}
        </div>

      </div>
        </div>
      </div>
    </div>
  );
}
