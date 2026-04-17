"use client";

import { FlightBoardData, FlightEntry } from "@/lib/chat-types";

interface Props {
  data: FlightBoardData | undefined;
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
  return <span className="text-xs font-mono tabular-nums text-gray-300 whitespace-nowrap">{scheduled ?? "—"}</span>;
}

function FlightRow({ flight, boardType }: { flight: FlightEntry; boardType: "departure" | "arrival" }) {
  const statusClass = STATUS_COLORS[flight.status] ?? "text-gray-500 bg-white/4 border-white/8";
  const isDep = boardType === "departure";
  const counterpart     = isDep ? flight.arr_airport   : flight.dep_airport;
  const counterpartIata = isDep ? flight.arr_iata      : flight.dep_iata;
  const terminal        = isDep ? flight.dep_terminal  : flight.arr_terminal;
  const gate            = isDep ? flight.dep_gate      : flight.arr_gate;

  return (
    <tr className="border-b border-white/4 hover:bg-white/3 transition-colors">
      {/* Flugnummer */}
      <td className="px-3 py-2 font-mono font-semibold text-xs text-white whitespace-nowrap">
        {flight.flight_number}
      </td>

      {/* Airline */}
      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
        {flight.airline}
      </td>

      {/* Ziel / Herkunft */}
      <td className="px-3 py-2 min-w-0">
        <span className="text-xs text-gray-200 font-medium">
          {counterpart}
          {counterpartIata && (
            <span className="text-gray-500 ml-1 text-[10px]">({counterpartIata})</span>
          )}
        </span>
      </td>

      {/* Abflug */}
      <td className="px-3 py-2 text-right">
        <TimeCell
          scheduled={flight.dep_scheduled}
          actual={flight.dep_actual}
          delay={flight.dep_delay}
        />
      </td>

      {/* Ankunft */}
      <td className="px-3 py-2 text-right">
        <TimeCell
          scheduled={flight.arr_scheduled}
          actual={flight.arr_actual}
          delay={flight.arr_delay}
        />
      </td>

      {/* Terminal */}
      <td className="px-3 py-2 text-center">
        {terminal
          ? <span className="text-xs font-mono text-[#C8D8E8]">T{terminal}</span>
          : <span className="text-xs text-gray-700">—</span>
        }
      </td>

      {/* Gate */}
      <td className="px-3 py-2 text-center">
        {gate
          ? <span className="text-xs font-mono font-semibold text-[#C8D8E8]">{gate}</span>
          : <span className="text-xs text-gray-700">—</span>
        }
      </td>

      {/* Status */}
      <td className="px-3 py-2 text-center whitespace-nowrap">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${statusClass}`}>
          {flight.status}
        </span>
      </td>
    </tr>
  );
}

export default function FlightBoardWindow({ data }: Props) {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6 bg-[#0d0d14]">
        <span className="text-4xl opacity-20">✈</span>
        <p className="text-gray-500 text-sm">Frag Baddi nach einem Flug oder Flughafen,</p>
        <p className="text-gray-600 text-xs">z.B. „Zeig mir die Abflüge in Zürich"</p>
      </div>
    );
  }

  const isDep = (data.board_type ?? "departure") === "departure";
  const flights = data.flights ?? [];

  const header = data.airport_name
    ? `${data.airport_name} (${data.airport_iata}) — ${isDep ? "Abflüge" : "Ankünfte"}`
    : data.query
    ? `Flug ${data.query}`
    : "Flugplan";

  return (
    <div className="flex flex-col h-full text-[#e2e2e8] bg-[#0d0d14]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-[#10101a] flex items-center gap-3">
        <span className="text-lg">✈</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{header}</p>
          <p className="text-[10px] text-gray-600">{flights.length} Flüge</p>
        </div>
      </div>

      {/* Tabelle */}
      <div className="flex-1 overflow-auto">
        {flights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
            <span className="text-4xl opacity-20">✈</span>
            <p className="text-gray-600 text-sm">Keine Flüge gefunden</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[#13131c] border-b border-white/5 z-10">
              <tr>
                <th className="px-3 py-1.5 text-left   text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">Flug</th>
                <th className="px-3 py-1.5 text-left   text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">Airline</th>
                <th className="px-3 py-1.5 text-left   text-[9px] text-gray-600 uppercase tracking-wider font-semibold">{isDep ? "Ziel" : "Herkunft"}</th>
                <th className="px-3 py-1.5 text-right  text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">Abflug</th>
                <th className="px-3 py-1.5 text-right  text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">Ankunft</th>
                <th className="px-3 py-1.5 text-center text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">Terminal</th>
                <th className="px-3 py-1.5 text-center text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">Gate</th>
                <th className="px-3 py-1.5 text-center text-[9px] text-gray-600 uppercase tracking-wider font-semibold whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f, i) => (
                <FlightRow key={`${f.flight_number}-${i}`} flight={f} boardType={data.board_type ?? "departure"} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
