"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";

interface Ticket {
  id: string;
  ticket_number: string;
  created_at: string;
  email_from: string;
  email_subject: string;
  kategorie: string;
  dringlichkeit: string;
  confidence: number;
  zusammenfassung: string;
  antwort_entwurf: string;
  status: string;
  auto_replied: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  offen: "Offen",
  beantwortet: "Beantwortet",
  geschlossen: "Geschlossen",
};

const STATUS_COLORS: Record<string, string> = {
  offen: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  beantwortet: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  geschlossen: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const DRING_COLORS: Record<string, string> = {
  hoch: "text-red-400",
  mittel: "text-yellow-400",
  niedrig: "text-gray-400",
};

const KAT_LABELS: Record<string, string> = {
  support: "Support",
  beschwerde: "Beschwerde",
  vertrieb: "Vertrieb",
  spam: "Spam",
  sonstiges: "Sonstiges",
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [updating, setUpdating] = useState<string | null>(null);

  const selected = tickets.find(t => t.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = statusFilter ? `/v1/support/tickets?status=${statusFilter}` : "/v1/support/tickets";
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Ticket[] = await res.json();
      setTickets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (ticketNumber: string, newStatus: string) => {
    setUpdating(ticketNumber);
    try {
      const res = await apiFetch(`/v1/support/tickets/${ticketNumber}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status-Update fehlgeschlagen");
    } finally {
      setUpdating(null);
    }
  };

  const openCount = tickets.filter(t => t.status === "offen").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Support Tickets</h1>
          <p className="text-sm text-gray-500 mt-1">
            Eingehende Emails via info@baddi.ch — klassifiziert durch KI
          </p>
        </div>
        <div className="flex items-center gap-3">
          {openCount > 0 && (
            <span className="px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-sm border border-yellow-500/30 font-medium">
              {openCount} offen
            </span>
          )}
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm transition-colors"
          >
            ↻ Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {["", "offen", "beantwortet", "geschlossen"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              statusFilter === s
                ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                : "bg-white/5 text-gray-400 hover:text-white border border-transparent"
            }`}
          >
            {s === "" ? "Alle" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ticket-Liste */}
        <div className="space-y-2">
          {loading && (
            <div className="text-center py-12 text-gray-600">Lade Tickets…</div>
          )}
          {!loading && tickets.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              Keine Tickets vorhanden
            </div>
          )}
          {!loading && tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => setSelectedId(ticket.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedId === ticket.id
                  ? "bg-yellow-500/8 border-yellow-500/30"
                  : "bg-white/3 border-white/8 hover:border-white/15 hover:bg-white/5"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-xs font-mono text-gray-500">{ticket.ticket_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[ticket.status] ?? STATUS_COLORS.offen}`}>
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
              </div>
              <p className="text-sm font-medium text-white truncate mb-1">{ticket.email_subject}</p>
              <p className="text-xs text-gray-500 truncate mb-2">{ticket.email_from}</p>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>{KAT_LABELS[ticket.kategorie] ?? ticket.kategorie}</span>
                <span className={DRING_COLORS[ticket.dringlichkeit] ?? ""}>
                  {ticket.dringlichkeit === "hoch" ? "⚠ " : ""}
                  {ticket.dringlichkeit}
                </span>
                <span className="ml-auto">
                  {new Date(ticket.created_at).toLocaleString("de-CH", {
                    day: "2-digit", month: "2-digit", year: "2-digit",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail-Ansicht */}
        <div className="lg:sticky lg:top-6">
          {selected ? (
            <div className="bg-white/3 border border-white/8 rounded-xl p-5 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-gray-500 mb-1">{selected.ticket_number}</p>
                  <h2 className="text-base font-semibold text-white">{selected.email_subject}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{selected.email_from}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${STATUS_COLORS[selected.status] ?? STATUS_COLORS.offen}`}>
                  {STATUS_LABELS[selected.status] ?? selected.status}
                </span>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/3 rounded-lg p-3">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Kategorie</p>
                  <p className="text-sm text-white">{KAT_LABELS[selected.kategorie] ?? selected.kategorie}</p>
                </div>
                <div className="bg-white/3 rounded-lg p-3">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Dringlichkeit</p>
                  <p className={`text-sm font-medium ${DRING_COLORS[selected.dringlichkeit] ?? "text-white"}`}>
                    {selected.dringlichkeit}
                  </p>
                </div>
                <div className="bg-white/3 rounded-lg p-3">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Konfidenz</p>
                  <p className="text-sm text-white">{Math.round(selected.confidence * 100)}%</p>
                </div>
              </div>

              {/* Auto-Reply Badge */}
              {selected.auto_replied && (
                <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <span>✓</span>
                  <span>Automatisch beantwortet</span>
                </div>
              )}

              {/* Zusammenfassung */}
              {selected.zusammenfassung && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">KI-Zusammenfassung</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{selected.zusammenfassung}</p>
                </div>
              )}

              {/* Antwort-Entwurf */}
              {selected.antwort_entwurf && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Antwort-Entwurf</p>
                  <div className="bg-black/20 rounded-lg p-3 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {selected.antwort_entwurf}
                  </div>
                </div>
              )}

              {/* Status-Aktionen */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Status ändern</p>
                <div className="flex gap-2">
                  {(["offen", "beantwortet", "geschlossen"] as const).map(s => (
                    <button
                      key={s}
                      disabled={selected.status === s || updating === selected.ticket_number}
                      onClick={() => updateStatus(selected.ticket_number, s)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                        selected.status === s
                          ? `${STATUS_COLORS[s]} cursor-default border`
                          : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent"
                      }`}
                    >
                      {updating === selected.ticket_number && selected.status !== s ? "…" : STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-600">
                Erstellt: {new Date(selected.created_at).toLocaleString("de-CH")}
              </p>
            </div>
          ) : (
            <div className="bg-white/3 border border-white/8 rounded-xl p-8 text-center text-gray-600 text-sm">
              Ticket auswählen für Details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
