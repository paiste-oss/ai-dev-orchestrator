"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StockData {
  symbol: string; name: string; period: string; currency: string;
  total_change_pct: number; start_price: number; end_price: number;
  data_points: { date: string; close: number; change_pct: number | null }[];
  error?: string;
}
interface PortfolioPosition {
  id: string; symbol: string; quantity: number; buy_price: number; buy_currency: string;
  current_price: number | null; currency: string;
  current_value: number | null; cost_basis: number;
  gain: number | null; gain_pct: number | null;
}
interface NewsArticle {
  id: string; symbol: string; title: string; summary: string;
  url: string; pub_date: string; provider: string; thumbnail: string | null;
}

type Period = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";
type Tab = "chart" | "overlay" | "portfolio" | "news";

const PERIODS: { v: Period; l: string }[] = [
  { v: "1mo", l: "1M" }, { v: "3mo", l: "3M" }, { v: "6mo", l: "6M" },
  { v: "1y", l: "1J" }, { v: "2y", l: "2J" }, { v: "5y", l: "5J" },
];
const LINE_COLORS = ["#6366f1", "#34d399", "#f59e0b", "#f87171", "#38bdf8", "#a78bfa"];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ChartWindow({ initialSymbol }: { initialSymbol?: string }) {
  const [tab, setTab] = useState<Tab>("chart");
  const [symbols, setSymbols] = useState<string[]>(initialSymbol ? [initialSymbol.toUpperCase()] : []);
  const [period, setPeriod] = useState<Period>("1y");
  const [chartData, setChartData] = useState<Record<string, StockData>>({});
  const [loadingSymbols, setLoadingSymbols] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [editPos, setEditPos] = useState<{ symbol: string; quantity: string; buy_price: string; buy_currency: string; isNew: boolean } | null>(null);

  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const [modalSearch, setModalSearch] = useState("");
  const [modalResults, setModalResults] = useState<{ symbol: string; name: string }[]>([]);
  const [modalSearching, setModalSearching] = useState(false);

  // ── Chart data fetching ────────────────────────────────────────────────────

  const fetchSymbol = useCallback(async (sym: string, per: Period) => {
    setLoadingSymbols(s => new Set(s).add(sym));
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/stocks/history?symbol=${sym}&period=${per}`);
      const json: StockData = await res.json();
      setChartData(d => ({ ...d, [sym]: json }));
    } catch {
      setChartData(d => ({ ...d, [sym]: { ...({} as StockData), symbol: sym, error: "Netzwerkfehler" } }));
    } finally {
      setLoadingSymbols(s => { const n = new Set(s); n.delete(sym); return n; });
    }
  }, []);

  useEffect(() => {
    if (initialSymbol) fetchSymbol(initialSymbol.toUpperCase(), period);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    symbols.forEach(sym => fetchSymbol(sym, period));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // ── Symbol search ──────────────────────────────────────────────────────────

  async function handleSearch(q: string) {
    setSearchInput(q);
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
    if (!upper || symbols.includes(upper)) { setSearchInput(""); setSearchResults([]); return; }
    setSymbols(s => [...s, upper]);
    fetchSymbol(upper, period);
    setSearchInput(""); setSearchResults([]);
  }

  function removeSymbol(sym: string) {
    setSymbols(s => s.filter(x => x !== sym));
    setChartData(d => { const n = { ...d }; delete n[sym]; return n; });
  }

  // ── Portfolio ──────────────────────────────────────────────────────────────

  const loadPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/stocks/portfolio`);
      setPortfolio(await res.json());
    } finally { setPortfolioLoading(false); }
  }, []);

  useEffect(() => { if (tab === "portfolio") loadPortfolio(); }, [tab, loadPortfolio]);

  async function handleModalSearch(q: string) {
    setModalSearch(q);
    setEditPos(p => p && ({ ...p, symbol: q.toUpperCase() }));
    if (q.length < 2) { setModalResults([]); return; }
    setModalSearching(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/stocks/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setModalResults(Array.isArray(json) ? json.slice(0, 5) : []);
    } catch { setModalResults([]); }
    finally { setModalSearching(false); }
  }

  function selectModalSymbol(sym: string) {
    setEditPos(p => p && ({ ...p, symbol: sym }));
    setModalSearch(sym);
    setModalResults([]);
  }

  function closeModal() {
    setEditPos(null);
    setModalSearch("");
    setModalResults([]);
  }

  async function savePosition() {
    if (!editPos) return;
    await apiFetch(`${BACKEND_URL}/v1/stocks/portfolio`, {
      method: "POST",
      body: JSON.stringify({
        symbol: editPos.symbol,
        quantity: parseFloat(editPos.quantity),
        buy_price: parseFloat(editPos.buy_price),
        buy_currency: editPos.buy_currency,
      }),
    });
    closeModal();
    loadPortfolio();
  }

  async function deletePosition(symbol: string) {
    await apiFetch(`${BACKEND_URL}/v1/stocks/portfolio/${symbol}`, { method: "DELETE" });
    setPortfolio(p => p.filter(x => x.symbol !== symbol));
  }

  // ── News ───────────────────────────────────────────────────────────────────

  const loadNews = useCallback(async (syms: string[]) => {
    if (syms.length === 0) return;
    setNewsLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/stocks/news?symbols=${syms.join(",")}`);
      setNews(await res.json());
    } finally { setNewsLoading(false); }
  }, []);

  useEffect(() => {
    if (tab !== "news") return;
    const newsSources = tab === "news"
      ? [...new Set([...symbols, ...portfolio.map(p => p.symbol)])]
      : symbols;
    if (newsSources.length > 0) loadNews(newsSources);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Portfolio summary ──────────────────────────────────────────────────────

  const totalValue = portfolio.reduce((s, p) => s + (p.current_value ?? p.cost_basis), 0);
  const totalCost  = portfolio.reduce((s, p) => s + p.cost_basis, 0);
  const totalGain  = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  // ── Normalized chart data ──────────────────────────────────────────────────

  const normalizedData = (() => {
    const allDates = new Set<string>();
    symbols.forEach(sym => chartData[sym]?.data_points?.forEach(p => allDates.add(p.date)));
    return [...allDates].sort().map(date => {
      const row: Record<string, string | number> = { date: date.substring(0, 7) };
      symbols.forEach(sym => {
        const sd = chartData[sym];
        if (!sd?.data_points) return;
        const pt = sd.data_points.find(p => p.date === date);
        if (pt) row[sym] = Math.round(((pt.close - sd.start_price) / sd.start_price) * 10000) / 100;
      });
      return row;
    });
  })();

  const isChartLoading = loadingSymbols.size > 0;
  const hasChartData = symbols.some(s => chartData[s]?.data_points);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-950 text-white text-xs">

      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-white/6">
        {([
          ["chart",     "📊 Chart"],
          ["overlay",   "📈 Overlay"],
          ["portfolio", "💼 Portfolio"],
          ["news",      "📰 News"],
        ] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              tab === t ? "border-indigo-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── SHARED SYMBOL BAR (Chart + Overlay) ── */}
      {(tab === "chart" || tab === "overlay") && (
        <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-white/5 space-y-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            {symbols.map((sym, i) => {
              const sd = chartData[sym];
              const isPos = sd && !sd.error ? sd.total_change_pct >= 0 : null;
              return (
                <div key={sym} className="flex items-center gap-1 px-2 py-0.5 rounded-lg border"
                  style={{ borderColor: LINE_COLORS[i % LINE_COLORS.length] + "40", background: LINE_COLORS[i % LINE_COLORS.length] + "12" }}>
                  <span className="font-mono font-semibold" style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>{sym}</span>
                  {sd && !sd.error && isPos !== null && (
                    <span className={isPos ? "text-emerald-400" : "text-red-400"}>
                      {isPos ? "+" : ""}{sd.total_change_pct.toFixed(1)}%
                    </span>
                  )}
                  {sd?.error && <span className="text-red-400" title={sd.error}>!</span>}
                  {loadingSymbols.has(sym) && <span className="text-gray-500 animate-pulse">…</span>}
                  <button onClick={() => removeSymbol(sym)} className="text-gray-600 hover:text-red-400 ml-0.5">×</button>
                </div>
              );
            })}
            {/* Search */}
            <div className="relative">
              <input value={searchInput} onChange={e => handleSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && searchInput.trim()) addSymbol(searchInput); }}
                placeholder="+ Symbol" className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/25" />
              {(searchResults.length > 0 || searching) && (
                <div className="absolute left-0 top-7 min-w-[200px] rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
                  style={{ background: "rgba(8,12,22,0.97)" }}>
                  {searching && <div className="px-3 py-2 text-gray-500">Suche…</div>}
                  {searchResults.map(r => (
                    <button key={r.symbol} onClick={() => addSymbol(r.symbol)}
                      className="w-full text-left px-3 py-2 hover:bg-white/8 flex gap-2">
                      <span className="font-mono text-white">{r.symbol}</span>
                      <span className="text-gray-500 truncate">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Period selector */}
          <div className="flex gap-1 items-center">
            {PERIODS.map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  period === p.v ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300" : "text-gray-500 hover:text-gray-300"
                }`}>{p.l}</button>
            ))}
            {isChartLoading && <span className="text-gray-600 ml-1 animate-pulse">lädt…</span>}
          </div>
        </div>
      )}

      {/* ── CHART TAB — individuelle Diagramme ── */}
      {tab === "chart" && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {symbols.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
              <span className="text-4xl opacity-20">📊</span>
              <p className="text-gray-600">Symbol oben eingeben und Enter drücken</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: symbols.length === 1 ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {symbols.map((sym, i) => {
                const sd = chartData[sym];
                const color = LINE_COLORS[i % LINE_COLORS.length];
                const isPos = sd && !sd.error && sd.total_change_pct >= 0;
                const pts = sd?.data_points?.map(p => ({ date: p.date.substring(0, 7), close: p.close })) ?? [];
                return (
                  <div key={sym} className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                      <div>
                        <span className="font-mono font-semibold" style={{ color }}>{sym}</span>
                        {sd?.name && sd.name !== sym && (
                          <span className="text-gray-600 ml-2 truncate max-w-[120px] inline-block align-bottom">{sd.name}</span>
                        )}
                      </div>
                      <div className="text-right">
                        {sd?.data_points ? (
                          <>
                            <span className="text-white tabular-nums">{sd.end_price.toFixed(2)} <span className="text-gray-600">{sd.currency}</span></span>
                            <span className={`ml-2 ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                              {isPos ? "▲" : "▼"} {Math.abs(sd.total_change_pct).toFixed(2)}%
                            </span>
                          </>
                        ) : sd?.error ? (
                          <span className="text-red-400 text-[10px]">Fehler</span>
                        ) : (
                          <span className="text-gray-600 animate-pulse">lädt…</span>
                        )}
                      </div>
                    </div>
                    {/* Mini chart */}
                    <div style={{ height: symbols.length === 1 ? 260 : 140 }}>
                      {pts.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={pts} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#4b5563" }} tickLine={false} axisLine={false}
                              interval={Math.max(0, Math.floor(pts.length / 4) - 1)} />
                            <YAxis tick={{ fontSize: 8, fill: "#4b5563" }} tickLine={false} axisLine={false}
                              domain={["auto", "auto"]}
                              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                              labelStyle={{ color: "#6b7280" }}
                              formatter={(value) => [`${Number(value).toFixed(2)} ${sd?.currency ?? ""}`, sym]}
                            />
                            <Line type="monotone" dataKey="close" stroke={color} strokeWidth={1.5}
                              dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          {loadingSymbols.has(sym)
                            ? <span className="text-gray-600 animate-pulse">lädt…</span>
                            : <span className="text-gray-700">Keine Daten</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── OVERLAY TAB — normalisierter Vergleich ── */}
      {tab === "overlay" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 px-2 py-2">
            {symbols.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-4xl opacity-20">📈</span>
                <p className="text-gray-600">Symbol oben eingeben und Enter drücken</p>
              </div>
            ) : !hasChartData && !isChartLoading ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-red-400">Keine Daten verfügbar</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={normalizedData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#4b5563" }} tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(normalizedData.length / 6) - 1)} />
                  <YAxis tick={{ fontSize: 9, fill: "#4b5563" }} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: "#6b7280" }}
                    formatter={(value) => { const v = Number(value); return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`]; }}
                  />
                  {symbols.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => <span style={{ color: "#9ca3af" }}>{v}</span>} />}
                  {symbols.map((sym, i) => chartData[sym]?.data_points && (
                    <Line key={sym} type="monotone" dataKey={sym} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          {hasChartData && (
            <div className="shrink-0 border-t border-white/5 px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
              {symbols.map((sym, i) => {
                const sd = chartData[sym];
                if (!sd?.data_points) return null;
                const isPos = sd.total_change_pct >= 0;
                return (
                  <div key={sym} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
                    <span className="font-mono text-gray-400">{sym}</span>
                    <span className="text-white tabular-nums">{sd.end_price.toFixed(2)} {sd.currency}</span>
                    <span className={isPos ? "text-emerald-400" : "text-red-400"}>{isPos ? "▲" : "▼"} {Math.abs(sd.total_change_pct).toFixed(2)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PORTFOLIO TAB ── */}
      {tab === "portfolio" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Summary bar */}
          {portfolio.length > 0 && (
            <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center gap-6">
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider">Gesamtwert</p>
                <p className="text-sm font-semibold text-white tabular-nums">{totalValue.toLocaleString("de-CH", { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider">Gewinn/Verlust</p>
                <p className={`text-sm font-semibold tabular-nums ${totalGain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalGain >= 0 ? "+" : ""}{totalGain.toLocaleString("de-CH", { minimumFractionDigits: 2 })}
                  <span className="text-[10px] ml-1">({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(2)}%)</span>
                </p>
              </div>
              <div className="ml-auto">
                <button onClick={() => { setEditPos({ symbol: "", quantity: "", buy_price: "", buy_currency: "CHF", isNew: true }); setModalSearch(""); setModalResults([]); }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 transition-colors">
                  + Position
                </button>
              </div>
            </div>
          )}

          {/* Position list */}
          <div className="flex-1 overflow-y-auto">
            {portfolioLoading ? (
              <p className="text-center text-gray-600 pt-8">Lädt…</p>
            ) : portfolio.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                <span className="text-4xl opacity-20">💼</span>
                <p className="text-gray-600 leading-relaxed">Noch keine Positionen.<br />Füge Aktien mit Kauf-Kurs und Menge hinzu.</p>
                <button onClick={() => { setEditPos({ symbol: "", quantity: "", buy_price: "", buy_currency: "CHF", isNew: true }); setModalSearch(""); setModalResults([]); }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 transition-colors mt-1">
                  + Erste Position hinzufügen
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5 text-gray-600 text-[10px] uppercase tracking-wider">
                    <th className="text-left px-4 py-2">Symbol</th>
                    <th className="text-right px-3 py-2">Stück</th>
                    <th className="text-right px-3 py-2">Kauf</th>
                    <th className="text-right px-3 py-2">Aktuell</th>
                    <th className="text-right px-3 py-2">G/V</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {portfolio.map((pos, i) => {
                    const isPos = pos.gain !== null ? pos.gain >= 0 : null;
                    return (
                      <tr key={pos.id} className="group border-b border-white/4 hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-semibold" style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>{pos.symbol}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums">{pos.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                          {pos.buy_price.toFixed(2)} <span className="text-gray-700">{pos.buy_currency}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums">
                          {pos.current_price !== null ? pos.current_price.toFixed(2) : "–"}
                          <span className="text-gray-600 ml-1">{pos.currency}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {isPos !== null ? (
                            <span className={isPos ? "text-emerald-400" : "text-red-400"}>
                              {isPos ? "+" : ""}{pos.gain_pct?.toFixed(1)}%
                            </span>
                          ) : "–"}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditPos({ symbol: pos.symbol, quantity: String(pos.quantity), buy_price: String(pos.buy_price), buy_currency: pos.buy_currency ?? "CHF", isNew: false })}
                              className="text-gray-600 hover:text-indigo-400 p-0.5">✏</button>
                            <button onClick={() => deletePosition(pos.symbol)}
                              className="text-gray-600 hover:text-red-400 p-0.5">×</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {portfolio.length > 0 && !editPos && (
            <div className="shrink-0 px-4 py-2 border-t border-white/5 flex justify-end">
              <button onClick={() => { setEditPos({ symbol: "", quantity: "", buy_price: "", buy_currency: "CHF", isNew: true }); setModalSearch(""); setModalResults([]); }}
                className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
                + Position
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── NEWS TAB ── */}
      {tab === "news" && (
        <div className="flex-1 overflow-y-auto">
          {newsLoading ? (
            <p className="text-center text-gray-600 pt-8">Lädt Nachrichten…</p>
          ) : news.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
              <span className="text-4xl opacity-20">📰</span>
              <p className="text-gray-600">Füge Symbole im Chart-Tab oder Portfolio-Positionen hinzu,<br />um News zu sehen.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {news.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                  className="flex gap-3 px-4 py-3 hover:bg-white/4 transition-colors group">
                  {a.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumbnail} alt="" className="w-16 h-12 object-cover rounded-lg shrink-0 opacity-80 group-hover:opacity-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-mono">{a.symbol}</span>
                      <span className="text-[9px] text-gray-600">{a.provider}</span>
                      <span className="text-[9px] text-gray-700">·</span>
                      <span className="text-[9px] text-gray-600">
                        {new Date(a.pub_date).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-gray-200 leading-snug group-hover:text-white transition-colors line-clamp-2">{a.title}</p>
                    {a.summary && <p className="text-gray-600 mt-0.5 line-clamp-1">{a.summary}</p>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT / ADD POSITION MODAL ── */}
      {editPos && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-5 w-72 shadow-2xl">
            <p className="font-semibold text-sm mb-4">{editPos.symbol ? `${editPos.symbol} bearbeiten` : "Position hinzufügen"}</p>
            <div className="space-y-3">
              {editPos.isNew && (
                <div className="relative">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Symbol</label>
                  <input
                    autoFocus
                    value={modalSearch}
                    onChange={e => handleModalSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") { setModalResults([]); } }}
                    placeholder="z.B. NESN.SW oder Nestlé"
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/50"
                  />
                  {(modalResults.length > 0 || modalSearching) && (
                    <div className="absolute left-0 top-full mt-1 w-full rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
                      style={{ background: "rgba(8,12,22,0.97)" }}>
                      {modalSearching && <div className="px-3 py-2 text-gray-500 text-xs">Suche…</div>}
                      {modalResults.map(r => (
                        <button key={r.symbol} type="button" onClick={() => selectModalSymbol(r.symbol)}
                          className="w-full text-left px-3 py-2 hover:bg-white/8 flex gap-2 text-xs">
                          <span className="font-mono text-white">{r.symbol}</span>
                          <span className="text-gray-500 truncate">{r.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Anzahl Stück</label>
                <input type="number" min="0" step="any" value={editPos.quantity}
                  onChange={e => setEditPos(p => p && ({ ...p, quantity: e.target.value }))}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/50" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Kaufpreis (pro Stück)</label>
                  <input type="number" min="0" step="any" value={editPos.buy_price}
                    onChange={e => setEditPos(p => p && ({ ...p, buy_price: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/50" />
                </div>
                <div className="w-24">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Währung</label>
                  <select value={editPos.buy_currency}
                    onChange={e => setEditPos(p => p && ({ ...p, buy_currency: e.target.value }))}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 appearance-none">
                    {["CHF", "EUR", "USD", "GBP", "JPY", "CAD", "AUD"].map(c => (
                      <option key={c} value={c} className="bg-gray-900">{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={closeModal}
                className="flex-1 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">Abbrechen</button>
              <button onClick={savePosition}
                disabled={!editPos.symbol || !editPos.quantity || !editPos.buy_price}
                className="flex-1 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium transition-colors">
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
