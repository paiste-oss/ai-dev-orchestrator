import React from "react";
import { TransportBoardData } from "@/lib/chat-types";

export default function TransportBoardCard({ data }: { data: TransportBoardData }) {
  return (
    <div className="mt-3 rounded-2xl bg-gray-900 border border-gray-700 overflow-hidden shadow-lg w-full">
      <div className="bg-gray-800 px-4 py-2.5 flex items-center gap-2">
        <span className="text-lg">🚆</span>
        <span className="text-sm font-semibold text-white">{data.station ?? "Abfahrten"}</span>
      </div>
      <div className="divide-y divide-gray-800">
        {data.departures.slice(0, 8).map((dep, i) => {
          const isDelayed = dep.delay && dep.delay > 0;
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs font-bold bg-[var(--accent)] text-[var(--accent-text)] px-2 py-0.5 rounded min-w-[40px] text-center">
                {dep.line}
              </span>
              <span className="flex-1 text-sm text-gray-300 truncate">{dep.destination}</span>
              <div className="text-right shrink-0">
                <span className={`text-sm font-mono font-medium ${isDelayed ? "text-red-400" : "text-white"}`}>
                  {dep.departure}
                </span>
                {isDelayed && (
                  <span className="block text-xs text-red-500">+{dep.delay} min</span>
                )}
              </div>
              {dep.track && (
                <span className="text-xs text-gray-600 min-w-[30px] text-right">Gl. {dep.track}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
