"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { StockHistoryData } from "@/lib/chat-types";

export default function StockHistoryCard({ data }: { data: StockHistoryData }) {
  const isPositive = data.total_change_pct >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";
  const lineColor = isPositive ? "#34d399" : "#f87171";
  const arrow = isPositive ? "▲" : "▼";
  const [showTable, setShowTable] = useState(false);

  const chartData = data.data_points.map(row => ({
    date: row.date.substring(0, 7),
    close: row.close,
    change_pct: row.change_pct,
  }));

  const minVal = Math.min(...chartData.map(d => d.close));
  const maxVal = Math.max(...chartData.map(d => d.close));
  const padding = (maxVal - minVal) * 0.08 || 1;

  return (
    <div className="mt-3 rounded-2xl bg-gray-900 border border-gray-700 p-4 w-full shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{data.symbol}</p>
          <p className="text-sm text-gray-400">Kursverlauf · {data.period}</p>
        </div>
        <div className={`text-right ${changeColor}`}>
          <p className="text-lg font-bold">{arrow} {Math.abs(data.total_change_pct).toFixed(2)}%</p>
          <p className="text-xs text-gray-500 tabular-nums">{data.start_price} → {data.end_price} {data.currency}</p>
        </div>
      </div>

      {/* Line Chart */}
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              interval={Math.floor(chartData.length / 5)}
            />
            <YAxis
              domain={[minVal - padding, maxVal + padding]}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#9ca3af" }}
              formatter={(value) => [`${(value as number).toFixed(2)} ${data.currency}`, "Kurs"]}
            />
            <ReferenceLine y={data.start_price} stroke="#4b5563" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="close"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Toggle table */}
      <button
        onClick={() => setShowTable(v => !v)}
        className="mt-3 text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        {showTable ? "▲ Tabelle ausblenden" : "▼ Tabelle anzeigen"}
      </button>

      {showTable && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600">
                <th className="text-left py-1 px-1">Datum</th>
                <th className="text-right py-1 px-1">Kurs</th>
                <th className="text-right py-1 px-1">Änderung</th>
              </tr>
            </thead>
            <tbody>
              {data.data_points.map((row, i) => (
                <tr key={i} className="border-t border-gray-800/60">
                  <td className="py-1 px-1 text-gray-500 font-mono">{row.date.substring(0, 7)}</td>
                  <td className="py-1 px-1 text-right text-gray-300 tabular-nums">{row.close.toFixed(2)}</td>
                  <td className={`py-1 px-1 text-right tabular-nums ${
                    row.change_pct === null ? "text-gray-600"
                    : row.change_pct >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {row.change_pct !== null ? `${row.change_pct >= 0 ? "+" : ""}${row.change_pct.toFixed(2)}%` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
