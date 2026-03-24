"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";
import AnalyticsStatCards from "@/components/admin/analytics/AnalyticsStatCards";
import AnalyticsCharts from "@/components/admin/analytics/AnalyticsCharts";
import AnalyticsMessageTable from "@/components/admin/analytics/AnalyticsMessageTable";

interface Overview {
  total_messages: number; unique_sessions: number; total_tokens: number;
  avg_tokens: number; messages_today: number; messages_7d: number;
}
interface ResponseType { response_type: string; cnt: number; }
interface DailyCount   { day: string; cnt: number; }
interface HourlyCount  { hour_of_day: number; cnt: number; }
interface Message {
  id: string; session_hash: string; user_message: string; assistant_message: string;
  response_type: string; tokens_used: number; language: string; day: string;
  hour_of_day: number; system_prompt_name: string; tools_used: string; memory_facts: string;
}

const PERIOD_OPTIONS = [7, 14, 30, 90];
const LIMIT = 20;

export default function AnalyticsPage() {
  const router = useRouter();
  const [mounted, setMounted]       = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [days, setDays]             = useState(30);
  const [overview, setOverview]     = useState<Overview | null>(null);
  const [rtData, setRtData]         = useState<ResponseType[]>([]);
  const [daily, setDaily]           = useState<DailyCount[]>([]);
  const [hourly, setHourly]         = useState<HourlyCount[]>([]);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(0);
  const [rtFilter, setRtFilter]     = useState("");

  const loadOverview = useCallback(async () => {
    const res = await apiFetch(`${BACKEND_URL}/v1/admin/analytics/overview?days=${days}`);
    if (!res.ok) return;
    const data = await res.json();
    setOverview(data.overview); setRtData(data.response_types);
    setDaily(data.daily_counts); setHourly(data.hourly);
  }, [days]);

  const loadMessages = useCallback(async () => {
    const params = new URLSearchParams({ days: String(days), limit: String(LIMIT), offset: String(page * LIMIT) });
    if (rtFilter) params.set("response_type", rtFilter);
    const res = await apiFetch(`${BACKEND_URL}/v1/admin/analytics/messages?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.items); setTotal(data.total);
  }, [days, page, rtFilter]);

  useEffect(() => { setMounted(true); const u = getSession(); if (!u || u.role !== "admin") router.replace("/login"); }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { setPage(0); }, [days, rtFilter]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  if (!mounted) return null;

  return (
    <div className="h-[100dvh] bg-gray-950 text-white flex overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5">☰</button>
          <span className="text-sm font-medium text-white">Analyse</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">Analyse</h1>
                <p className="text-sm text-gray-500 mt-0.5">Anonymisierte Chat-Auswertung · kein Personenbezug · DSG-konform</p>
              </div>
              <div className="flex gap-2">
                {PERIOD_OPTIONS.map(d => (
                  <button key={d} onClick={() => setDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === d ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"}`}>
                    {d}T
                  </button>
                ))}
              </div>
            </div>

            {overview && <AnalyticsStatCards overview={overview} days={days} />}
            <AnalyticsCharts daily={daily} hourly={hourly} rtData={rtData} />
            <AnalyticsMessageTable
              messages={messages} total={total} page={page}
              rtData={rtData} rtFilter={rtFilter}
              onPageChange={setPage} onFilterChange={setRtFilter}
            />

          </div>
        </div>
      </div>
    </div>
  );
}
