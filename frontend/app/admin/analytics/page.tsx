"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
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

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { setPage(0); }, [days, rtFilter]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  const totalPages = Math.ceil(total / LIMIT);

  // Stunden-Array 0–23 auffüllen
  const hourlyFull = Array.from({ length: 24 }, (_, h) => ({
    hour_of_day: h,
    cnt: hourly.find(x => x.hour_of_day === h)?.cnt ?? 0,
  }));

  return (
    <AdminLayout>
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

          <div className="divide-y divide-white/5">
            {messages.map(msg => (
              <div key={msg.id} className="px-5 py-4">
                <div
                  className="flex items-start justify-between gap-4 cursor-pointer"
                  onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{msg.user_message}</p>
                    {expanded !== msg.id && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{msg.assistant_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: rtColor(msg.response_type) + "22", color: rtColor(msg.response_type) }}
                    >
                      {msg.response_type}
                    </span>
                    <span>{msg.tokens_used} tok</span>
                    <span>{msg.day} {msg.hour_of_day}h</span>
                    <span className="font-mono text-gray-600">{msg.session_hash}</span>
                    <span className="text-gray-600">{expanded === msg.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expanded === msg.id && (
                  <div className="mt-4 space-y-3">
                    <div className="bg-gray-900/60 rounded-xl p-4">
                      <p className="text-[10px] text-indigo-400 uppercase tracking-widest mb-2">Frage</p>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg.user_message}</p>
                    </div>
                    <div className="bg-gray-900/60 rounded-xl p-4">
                      <p className="text-[10px] text-emerald-400 uppercase tracking-widest mb-2">Antwort</p>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg.assistant_message}</p>
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
    </AdminLayout>
  );
}
