"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface DataPoint { date: string; close: number; change_pct: number | null; }
interface StockData {
  symbol: string; name: string; period: string; currency: string;
  total_change_pct: number; start_price: number; end_price: number;
  data_points: DataPoint[];
}

type Period = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

const PERIODS: { v: Period; l: string }[] = [
  { v: "1mo", l: "1M" }, { v: "3mo", l: "3M" }, { v: "6mo", l: "6M" },
  { v: "1y",  l: "1J" }, { v: "2y",  l: "2J" }, { v: "5y",  l: "5J" },
];

const LINE_COLORS = ["#6366f1", "#34d399", "#f59e0b", "#f87171", "#38bdf8", "#a78bfa"];

interface Props {
  initialSymbol?: string;
}

export default function ChartWindow({ initialSymbol }: Props) {
  const [symbols, setSymbols] = useState<string[]>(initialSymbol ? [initialSymbol.toUpperCase()] : []);
  const [period, setPeriod] = useState<Period>("1y");
  const [data, setData] = useState<Record<string, StockData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchSymbol = useCallback(async (sym: string, per: Period) => {
    setLoading(l => ({ ...l, [sym]: true }));
    setErrors(e => { const n = { ...e }; delete n[sym]; return n; });
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/stocks/history?symbol=${sym}&period=${per}`);
      const json = await res.json();
      if (json.error) {
        setErrors(e => ({ ...e, [sym]: json.error }));
      } else {
        setData(d => ({ ...d, [sym]: json }));
      }
    } catch {
      setErrors(e => ({ ...e, [sym]: "Netzwerkfehler" }));
    } finally {
      setLoading(l => { const n = { ...l }; delete n[sym]; return n; });
    }
  }, []);

  // Initial symbol laden
  useEffect(() => {
    if (initialSymbol) fetchSymbol(initialSymbol.toUpperCase(), period);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bei Periodenwechsel alle Symbole neu laden
  useEffect(() => {
    symbols.forEach(sym => fetchSymbol(sym, period));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function handleSearch(q: string) {
    setInput(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/stocks/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setSearchResults(Array.isArray(json) ? json.slice(0, 5) : []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }

  function addSymbol(sym: string) {
    const upper = sym.toUpperCase().trim();
    if (!upper || symbols.includes(upper)) { setInput(""); setSearchResults([]); return; }
    setSymbols(s => [...s, upper]);
    fetchSymbol(upper, period);
    setInput("");
    setSearchResults([]);
  }

  function removeSymbol(sym: string) {
    setSymbols(s => s.filter(x => x !== sym));
    setData(d => { const n = { ...d }; delete n[sym]; return n; });
    setErrors(e => { const n = { ...e }; delete n[sym]; return n; });
  }

  // Normalisierte Chart-Daten (% Änderung ab Start) für Vergleichbarkeit
  const chartData = (() => {
    const allDates = new Set<string>();
    symbols.forEach(sym => data[sym]?.data_points.forEach(p => allDates.add(p.date)));
    const sorted = [...allDates].sort();
    return sorted.map(date => {
      const row: Record<string, string | number> = { date: date.substring(0, 7) };
      symbols.forEach(sym => {
        const sd = data[sym];
        if (!sd) return;
        const pt = sd.data_points.find(p => p.date === date);
        if (pt) {
          const pct = ((pt.close - sd.start_price) / sd.start_price) * 100;
          row[sym] = Math.round(pct * 100) / 100;
        }
      });
      return row;
    });
  })();

  const hasData = symbols.some(s => data[s]);
  const isLoading = Object.keys(loading).length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-950 text-white">

      {/* Header: Symbol-Chips + Suche */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-white/6 space-y-2">
        <div className="flex flex-wrap gap-1.5 items-center">
          {symbols.map((sym, i) => {
            const sd = data[sym];
            const isPos = sd ? sd.total_change_pct >= 0 : null;
            return (
              <div key={sym} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border"
                style={{ borderColor: LINE_COLORS[i % LINE_COLORS.length] + "40",
                         background: LINE_COLORS[i % LINE_COLORS.length] + "12" }}>
                <span className="font-mono font-semibold" style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>
                  {sym}
                </span>
                {sd && (
                  <span className={isPos ? "text-emerald-400" : "text-red-400"}>
                    {isPos ? "+" : ""}{sd.total_change_pct.toFixed(1)}%
                  </span>
                )}
                {errors[sym] && <span className="text-red-400">!</span>}
                {loading[sym] && <span className="text-gray-500 animate-pulse">…</span>}
                <button onClick={() => removeSymbol(sym)}
                  className="text-gray-600 hover:text-red-400 transition-colors ml-0.5">×</button>
              </div>
            );
          })}

          {/* Symbol-Suche */}
          <div className="relative">
            <input
              value={input}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && input.trim()) addSymbol(input); }}
              placeholder="+ Symbol"
              className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/25"
            />
            {(searchResults.length > 0 || searching) && (
              <div className="absolute left-0 top-8 min-w-[200px] rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
                style={{ background: "rgba(8,12,22,0.97)", backdropFilter: "blur(16px)" }}>
                {searching && <div className="px-3 py-2 text-xs text-gray-500">Suche…</div>}
                {searchResults.map(r => (
                  <button key={r.symbol} onClick={() => addSymbol(r.symbol)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/8 transition-colors flex items-center gap-2">
                    <span className="font-mono text-white">{r.symbol}</span>
                    <span className="text-gray-500 truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Zeitraum-Selector */}
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                period === p.v
                  ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
                  : "text-gray-500 hover:text-gray-300"
              }`}>
              {p.l}
            </button>
          ))}
          {isLoading && <span className="text-[11px] text-gray-600 ml-1 self-center animate-pulse">lädt…</span>}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-2 py-3">
        {symbols.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <span className="text-4xl opacity-20">📊</span>
            <p className="text-xs text-gray-600">Symbol im Suchfeld eingeben und Enter drücken</p>
          </div>
        ) : !hasData && !isLoading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-red-400">Keine Daten verfügbar</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4b5563" }}
                tickLine={false} axisLine={false}
                interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
              <YAxis tick={{ fontSize: 10, fill: "#4b5563" }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "#6b7280" }}
                formatter={(value: number, name: string) => [`${value >= 0 ? "+" : ""}${value.toFixed(2)}%`, name]}
              />
              {symbols.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(value) => <span style={{ color: "#9ca3af" }}>{value}</span>} />
              )}
              {symbols.map((sym, i) => data[sym] && (
                <Line key={sym} type="monotone" dataKey={sym}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={1.5} dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer: Kursdetails */}
      {hasData && (
        <div className="shrink-0 border-t border-white/5 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
          {symbols.map((sym, i) => {
            const sd = data[sym];
            if (!sd) return null;
            const isPos = sd.total_change_pct >= 0;
            return (
              <div key={sym} className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                <span className="font-mono text-gray-400">{sym}</span>
                <span className="text-white tabular-nums">{sd.end_price.toFixed(2)} {sd.currency}</span>
                <span className={isPos ? "text-emerald-400" : "text-red-400"}>
                  {isPos ? "▲" : "▼"} {Math.abs(sd.total_change_pct).toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
