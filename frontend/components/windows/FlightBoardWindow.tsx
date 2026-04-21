"use client";

import { FlightBoardData, FlightEntry } from "@/lib/chat-types";
import { useT } from "@/lib/i18n";

interface Props {
  data: FlightBoardData | undefined;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  "Geplant":    "text-gray-400 bg-gray-500/10 border-gray-600/30",
  "Im Flug":    "text-sky-300  bg-sky-500/10  border-sky-500/30",
  "Gelandet":   "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "Gestrichen": "text-red-400  bg-red-500/10  border-red-500/30",
  "Umgeleitet": "text-orange-400 bg-orange-500/10 border-orange-500/30",
  "Vorfall":    "text-red-400  bg-red-500/10  border-red-500/30",
};

function TimeCell({ scheduled, actual, delay }: { scheduled: string | null; actual: string | null; delay: number }) {
  const isDelayed = delay > 0;

  if (actual && actual !== scheduled) {
    return (
      <div className="flex flex-col items-end leading-none gap-0.5 whitespace-nowrap">
        <span className="text-[10px] text-gray-600 line-through tabular-nums">{scheduled ?? "—"}</span>
        <span className={`text-xs font-mono tabular-nums ${isDelayed ? "text-red-400" : "text-emerald-400"}`}>
          {actual}
          {isDelayed && <span className="ml-1 text-[10px]">+{delay}&apos;</span>}
        </span>
      </div>
    );
  }

  if (isDelayed) {
    return (
      <div className="flex flex-col items-end leading-none gap-0.5 whitespace-nowrap">
        <span className="text-xs font-mono tabular-nums text-gray-300">{scheduled ?? "—"}</span>
        <span className="text-[10px] text-red-400 tabular-nums">+{delay}&apos;</span>
      </div>
    );
  }

  return <span className="text-xs font-mono tabular-nums text-gray-300 whitespace-nowrap">{scheduled ?? "—"}</span>;
}

function fmtDuration(mins: number | null | undefined): string {
  if (!mins || mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function FlightRow({ flight, boardType, showTerminal }: { flight: FlightEntry; boardType: "departure" | "arrival"; showTerminal: boolean }) {
  const statusClass = STATUS_COLORS[flight.status] ?? "text-gray-500 bg-white/4 border-white/8";
  const isDep = boardType === "departure";
  const counterpart     = isDep ? flight.arr_airport   : flight.dep_airport;
  const counterpartIata = isDep ? flight.arr_iata      : flight.dep_iata;
  const terminal        = isDep ? flight.dep_terminal  : flight.arr_terminal;
  const gate            = isDep ? flight.dep_gate      : flight.arr_gate;

  const depDelay = isDep ? (flight.dep_delay || flight.arr_delay) : 0;
  const arrDelay = isDep ? 0 : (flight.arr_delay || flight.dep_delay);

  return (
    <tr className="border-b border-white/4 hover:bg-white/3 transition-colors">
      <td className="px-3 py-2 font-mono font-semibold text-xs text-white whitespace-nowrap">
        {flight.flight_number}
      </td>
      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
        {flight.airline}
      </td>
      <td className="px-3 py-2 min-w-0">
        <span className="text-xs text-gray-200 font-medium">
          {counterpart}
          {counterpartIata && (
            <span className="text-gray-500 ml-1 text-[10px] font-normal">({counterpartIata})</span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <TimeCell scheduled={flight.dep_scheduled} actual={flight.dep_actual} delay={depDelay} />
      </td>
      <td className="px-3 py-2 text-right">
        <TimeCell scheduled={flight.arr_scheduled} actual={flight.arr_actual} delay={arrDelay} />
      </td>
      <td className="px-3 py-2 text-center">
        <span className="text-xs font-mono text-gray-500 whitespace-nowrap">{fmtDuration(flight.duration_min)}</span>
      </td>
      {showTerminal && (
        <td className="px-3 py-2 text-center">
          {terminal
            ? <span className="text-xs font-mono text-[#C8D8E8]">T{terminal}</span>
            : <span className="text-xs text-gray-700">—</span>
          }
        </td>
      )}
      <td className="px-3 py-2 text-center">
        {gate
          ? <span className="text-xs font-mono font-semibold text-[#C8D8E8]">{gate}</span>
          : <span className="text-xs text-gray-700">—</span>
        }
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${statusClass}`}>
          {flight.status}
        </span>
      </td>
    </tr>
  );
}

export default function FlightBoardWindow({ data, onRefresh, isRefreshing = false }: Props) {
  const t = useT();

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6 bg-[#0d0d14]">
        <span className="text-4xl opacity-20">✈</span>
        <p className="text-gray-500 text-sm">{t("flight.empty_hint")}</p>
        <p className="text-gray-600 text-xs">{t("flight.empty_example")}</p>
      </div>
    );
  }

  const isDep = (data.board_type ?? "departure") === "departure";
  const flights = data.flights ?? [];
  const hasTerminal = flights.some((f) => isDep ? !!f.dep_terminal : !!f.arr_terminal);

  const header = data.airport_name
    ? `${data.airport_name} (${data.airport_iata}) — ${isDep ? t("flight.departures") : t("flight.arrivals")}`
    : data.query
    ? t("flight.flight_prefix", { query: data.query })
    : t("flight.plan");

  return (
    <div className="flex flex-col h-full text-[#e2e2e8] bg-[#0d0d14]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-[#10101a] flex items-center gap-3">
        <span className="text-lg">✈</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{header}</p>
          <p className="text-[10px] text-gray-600">{t("flight.count", { n: String(flights.length) })}</p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title={t("flight.refresh")}
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg border border-white/10 bg-white/4 hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}>
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabelle */}
      <div className="flex-1 overflow-auto">
        {flights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
            <span className="text-4xl opacity-20">✈</span>
            <p className="text-gray-600 text-sm">{t("flight.no_flights")}</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[#13131c] border-b border-white/5 z-10">
              <tr>
                <th className="px-3 py-1.5 text-left   text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_flight")}</th>
                <th className="px-3 py-1.5 text-left   text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_airline")}</th>
                <th className="px-3 py-1.5 text-left   text-[9px] text-gray-600 uppercase tracking-wider font-semibold">{isDep ? t("flight.col_dest") : t("flight.col_origin")}</th>
                <th className="px-3 py-1.5 text-right  text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_dep")}</th>
                <th className="px-3 py-1.5 text-right  text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_arr")}</th>
                <th className="px-3 py-1.5 text-center text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_duration")}</th>
                {hasTerminal && <th className="px-3 py-1.5 text-center text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_terminal")}</th>}
                <th className="px-3 py-1.5 text-center text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_gate")}</th>
                <th className="px-3 py-1.5 text-center text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">{t("flight.col_status")}</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f, i) => (
                <FlightRow key={`${f.flight_number}-${i}`} flight={f} boardType={data.board_type ?? "departure"} showTerminal={hasTerminal} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
