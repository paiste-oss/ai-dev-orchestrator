"use client";

import { FlightBoardData, FlightEntry } from "@/lib/chat-types";

interface Props {
  data: FlightBoardData | undefined;
}

const STATUS_COLORS: Record<string, string> = {
  "Geplant":     "text-gray-400 bg-gray-500/10 border-gray-600/30",
  "Im Flug":     "text-sky-300 bg-sky-500/10 border-sky-500/30",
  "Gelandet":    "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "Gestrichen":  "text-red-400 bg-red-500/10 border-red-500/30",
  "Umgeleitet":  "text-orange-400 bg-orange-500/10 border-orange-500/30",
  "Vorfall":     "text-red-400 bg-red-500/10 border-red-500/30",
};

function DelayBadge({ delay }: { delay: number }) {
  if (!delay || delay <= 0) return null;
  return (
    <span className="ml-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1 py-0.5 font-mono tabular-nums">
      +{delay}'
    </span>
  );
}

function TimeCell({ scheduled, actual, delay }: { scheduled: string | null; actual: string | null; delay: number }) {
  const isDelayed = delay > 0;
  return (
    <div className="flex flex-col items-end leading-none gap-0.5">
      {actual && actual !== scheduled ? (
        <>
          <span className="text-[10px] text-gray-600 line-through tabular-nums">{scheduled ?? "—"}</span>
          <span className={`text-xs font-mono tabular-nums ${isDelayed ? "text-red-400" : "text-emerald-400"}`}>
            {actual}
          </span>
        </>
      ) : (
        <span className="text-xs font-mono tabular-nums text-gray-300">{scheduled ?? "—"}</span>
      )}
      <DelayBadge delay={delay} />
    </div>
  );
}

function GateCell({ terminal, gate }: { terminal: string | null; gate: string | null }) {
  if (!terminal && !gate) return <span className="text-xs text-gray-700">—</span>;
  return (
    <div className="flex flex-col items-center leading-none gap-0.5">
      {gate && (
        <span className="text-xs font-mono font-semibold text-[#C8D8E8]">{gate}</span>
      )}
      {terminal && (
        <span className="text-[10px] text-gray-600">T{terminal}</span>
      )}
    </div>
  );
}

function FlightRow({ flight, boardType }: { flight: FlightEntry; boardType: "departure" | "arrival" }) {
  const statusClass = STATUS_COLORS[flight.status] ?? "text-gray-500 bg-white/4 border-white/8";
  const isDep = boardType === "departure";
  const counterpart = isDep ? flight.arr_airport : flight.dep_airport;
  const counterpartIata = isDep ? flight.arr_iata : flight.dep_iata;
  const scheduled = isDep ? flight.dep_scheduled : flight.arr_scheduled;
  const actual = isDep ? flight.dep_actual : flight.arr_actual;
  const delay = isDep ? flight.dep_delay : flight.arr_delay;
  const terminal = isDep ? flight.dep_terminal : flight.arr_terminal;
  const gate = isDep ? flight.dep_gate : flight.arr_gate;

  return (
    <div className="grid grid-cols-[56px_1fr_auto_52px_44px] gap-x-3 items-center px-3 py-2 border-b border-white/4 hover:bg-white/3 transition-colors">
      {/* Flugnummer */}
      <span className="text-xs font-mono font-semibold text-white truncate">{flight.flight_number}</span>

      {/* Ziel/Herkunft + Airline */}
      <div className="min-w-0">
        <p className="text-xs text-gray-200 truncate font-medium">
          {counterpart}
          {counterpartIata && <span className="text-gray-600 ml-1 text-[10px]">({counterpartIata})</span>}
        </p>
        <p className="text-[10px] text-gray-600 truncate">{flight.airline}</p>
      </div>

      {/* Zeit */}
      <TimeCell scheduled={scheduled} actual={actual} delay={delay} />

      {/* Gate / Terminal */}
      <div className="flex justify-center">
        <GateCell terminal={terminal} gate={gate} />
      </div>

      {/* Status */}
      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border truncate text-center ${statusClass}`}>
        {flight.status}
      </span>
    </div>
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

      {/* Spalten-Header */}
      <div className="shrink-0 grid grid-cols-[56px_1fr_auto_52px_44px] gap-x-3 px-3 py-1.5 border-b border-white/5 bg-[#13131c]">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">Flug</span>
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">{isDep ? "Ziel" : "Herkunft"}</span>
        <span className="text-[9px] text-gray-600 uppercase tracking-wider text-right">{isDep ? "Abflug" : "Ankunft"}</span>
        <span className="text-[9px] text-gray-600 uppercase tracking-wider text-center">Gate</span>
        <span className="text-[9px] text-gray-600 uppercase tracking-wider text-center">Status</span>
      </div>

      {/* Flug-Liste */}
      <div className="flex-1 overflow-y-auto">
        {flights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
            <span className="text-4xl opacity-20">✈</span>
            <p className="text-gray-600 text-sm">Keine Flüge gefunden</p>
          </div>
        ) : (
          flights.map((f, i) => (
            <FlightRow key={`${f.flight_number}-${i}`} flight={f} boardType={data.board_type ?? "departure"} />
          ))
        )}
      </div>
    </div>
  );
}
