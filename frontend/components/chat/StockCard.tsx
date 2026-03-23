import React from "react";
import { StockData } from "@/lib/chat-types";

function formatMarketCap(mc: number): string {
  if (mc >= 1e12) return `${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `${(mc / 1e9).toFixed(2)}B`;
  if (mc >= 1e6) return `${(mc / 1e6).toFixed(2)}M`;
  return mc.toLocaleString();
}

export default function StockCard({ data }: { data: StockData }) {
  const isPositive = (data.change_pct ?? 0) >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";
  const changeBg = isPositive ? "bg-emerald-500/10" : "bg-red-500/10";
  const arrow = isPositive ? "▲" : "▼";

  return (
    <div className="mt-3 rounded-2xl bg-gray-900 border border-gray-700 p-4 w-full shadow-lg">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{data.symbol}</p>
          {data.name && <p className="text-sm text-gray-300 font-medium leading-tight">{data.name}</p>}
        </div>
        {data.exchange && (
          <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{data.exchange}</span>
        )}
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-white tabular-nums">
          {data.price?.toFixed(2) ?? "–"}
        </span>
        <span className="text-sm text-gray-500 mb-0.5">{data.currency}</span>
      </div>
      {data.change_pct !== null && data.change_pct !== undefined && (
        <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-sm font-medium ${changeBg} ${changeColor}`}>
          <span>{arrow}</span>
          <span>{Math.abs(data.change ?? 0).toFixed(2)} ({Math.abs(data.change_pct).toFixed(2)}%)</span>
        </div>
      )}
      {(data.market_cap || data.volume) && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
          {data.market_cap && (
            <div>
              <p className="text-gray-600 mb-0.5">Market Cap</p>
              <p className="text-gray-400">{formatMarketCap(data.market_cap)}</p>
            </div>
          )}
          {data.volume && (
            <div>
              <p className="text-gray-600 mb-0.5">Volumen</p>
              <p className="text-gray-400">{data.volume.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
