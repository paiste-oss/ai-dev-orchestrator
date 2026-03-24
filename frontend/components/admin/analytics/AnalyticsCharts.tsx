"use client";

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface ResponseType { response_type: string; cnt: number; }
interface DailyCount   { day: string; cnt: number; }
interface HourlyCount  { hour_of_day: number; cnt: number; }

const RT_COLORS: Record<string, string> = {
  text: "#6366f1", stock_card: "#f59e0b", stock_history: "#10b981",
  image_gallery: "#ec4899", transport_board: "#3b82f6", action_buttons: "#8b5cf6",
};
function rtColor(rt: string) { return RT_COLORS[rt] ?? "#6b7280"; }

interface Props {
  daily: DailyCount[];
  hourly: HourlyCount[];
  rtData: ResponseType[];
}

export default function AnalyticsCharts({ daily, hourly, rtData }: Props) {
  const hourlyFull = Array.from({ length: 24 }, (_, h) => ({
    hour_of_day: h,
    cnt: hourly.find(x => x.hour_of_day === h)?.cnt ?? 0,
  }));

  const totalRt = rtData.reduce((s, r) => s + r.cnt, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-800/60 rounded-2xl border border-white/5 p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Nachrichten pro Tag</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8 }}
                labelStyle={{ color: "#9ca3af" }} itemStyle={{ color: "#fff" }} />
              <Line type="monotone" dataKey="cnt" stroke="#6366f1" strokeWidth={2} dot={false} name="Nachrichten" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-800/60 rounded-2xl border border-white/5 p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Response-Typen</p>
          <div className="space-y-2">
            {rtData.map(rt => {
              const pct = totalRt ? Math.round((rt.cnt / totalRt) * 100) : 0;
              return (
                <div key={rt.response_type}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{rt.response_type}</span>
                    <span className="text-gray-300">{rt.cnt} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: rtColor(rt.response_type) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-gray-800/60 rounded-2xl border border-white/5 p-5">
        <p className="text-sm font-medium text-gray-300 mb-4">Aktivität nach Tageszeit</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={hourlyFull} barSize={12}>
            <XAxis dataKey="hour_of_day" tick={{ fontSize: 10, fill: "#6b7280" }}
              tickFormatter={h => `${h}h`} interval={2} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8 }}
              labelStyle={{ color: "#9ca3af" }} itemStyle={{ color: "#fff" }}
              labelFormatter={h => `${h}:00 Uhr`} />
            <Bar dataKey="cnt" name="Nachrichten" radius={[4, 4, 0, 0]}>
              {hourlyFull.map((_, i) => (
                <Cell key={i} fill={i >= 8 && i <= 20 ? "#6366f1" : "#374151"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
