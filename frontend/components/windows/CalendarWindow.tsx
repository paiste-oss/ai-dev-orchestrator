"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CalEvent {
  uid: string;
  title: string;
  start: string;   // "YYYY-MM-DD HH:MM" | "YYYY-MM-DD"
  end: string;
  description: string | null;
  location: string | null;
}

interface CreateForm {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  description: string;
  location: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const EVENT_COLORS = [
  { bg: "bg-indigo-500/20",  text: "text-indigo-200",  dot: "bg-indigo-400",  card: "bg-indigo-500/15 border border-indigo-500/25" },
  { bg: "bg-violet-500/20",  text: "text-violet-200",  dot: "bg-violet-400",  card: "bg-violet-500/15 border border-violet-500/25" },
  { bg: "bg-emerald-500/20", text: "text-emerald-200", dot: "bg-emerald-400", card: "bg-emerald-500/15 border border-emerald-500/25" },
  { bg: "bg-rose-500/20",    text: "text-rose-200",    dot: "bg-rose-400",    card: "bg-rose-500/15 border border-rose-500/25" },
  { bg: "bg-amber-500/20",   text: "text-amber-200",   dot: "bg-amber-400",   card: "bg-amber-500/15 border border-amber-500/25" },
  { bg: "bg-sky-500/20",     text: "text-sky-200",     dot: "bg-sky-400",     card: "bg-sky-500/15 border border-sky-500/25" },
  { bg: "bg-pink-500/20",    text: "text-pink-200",    dot: "bg-pink-400",    card: "bg-pink-500/15 border border-pink-500/25" },
];

// ── Utilities ──────────────────────────────────────────────────────────────────

function colorFor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) & 0xffffff;
  return EVENT_COLORS[Math.abs(h) % EVENT_COLORS.length];
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Returns rows of 7 dates covering the month (ISO: Monday first)
function buildGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // 0 = Monday
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - startDow);

  const rows: Date[][] = [];
  for (let r = 0; r < 6; r++) {
    const week: Date[] = [];
    for (let c = 0; c < 7; c++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    if (week.some(d => d.getMonth() === month)) rows.push(week);
  }
  return rows;
}

function fmtTime(s: string): string {
  if (!s || s.length === 10) return "";
  return s.slice(11, 16);
}

function fmtDateLong(ymd: string): string {
  const d = new Date(ymd + "T12:00:00");
  return d.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" });
}

function eventsOnDay(events: CalEvent[], ymd: string): CalEvent[] {
  return events.filter(e => {
    const s = e.start.slice(0, 10);
    const en = (e.end || s).slice(0, 10);
    if (s === en || en <= s) return s === ymd;
    return s <= ymd && ymd < en;
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CalendarWindow() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedYmd, setSelectedYmd] = useState(toYMD(today));
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    title: "", date: toYMD(today), startTime: "09:00", endTime: "10:00",
    allDay: false, description: "", location: "",
  });
  const [saving, setSaving] = useState(false);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);

  const grid = buildGrid(year, month);
  const rangeStart = toYMD(grid[0][0]);
  const rangeEnd = toYMD(grid[grid.length - 1][6]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        `${BACKEND_URL}/v1/calendar/events?start=${rangeStart}&end=${rangeEnd}`
      );
      if (res.ok) {
        setNoAccount(false);
        setEvents(await res.json());
      } else if (res.status === 400) {
        setNoAccount(true);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [rangeStart, rangeEnd]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedYmd(toYMD(today));
  }

  function selectDay(ymd: string) {
    setSelectedYmd(ymd);
    setCreating(false);
  }

  function openCreate(ymd: string) {
    setForm(f => ({ ...f, date: ymd, title: "", description: "", location: "" }));
    setFormError(null);
    setCreating(true);
  }

  async function saveEvent() {
    if (!form.title.trim()) { setFormError("Titel ist erforderlich"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const body = form.allDay
        ? { title: form.title.trim(), start: form.date, end: form.date, all_day: true, description: form.description || null, location: form.location || null }
        : { title: form.title.trim(), start: `${form.date} ${form.startTime}`, end: `${form.date} ${form.endTime}`, all_day: false, description: form.description || null, location: form.location || null };

      const res = await apiFetch(`${BACKEND_URL}/v1/calendar/events`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created: CalEvent = await res.json();
        setEvents(prev => [...prev, created].sort((a, b) => a.start.localeCompare(b.start)));
        setCreating(false);
        setSelectedYmd(form.date);
      } else {
        const d = await res.json().catch(() => null);
        setFormError(d?.detail ?? "Fehler beim Speichern");
      }
    } finally { setSaving(false); }
  }

  async function deleteEvent(uid: string) {
    setDeletingUid(uid);
    try {
      const res = await apiFetch(
        `${BACKEND_URL}/v1/calendar/events/${encodeURIComponent(uid)}`,
        { method: "DELETE" }
      );
      if (res.ok || res.status === 204) {
        setEvents(prev => prev.filter(e => e.uid !== uid));
      }
    } finally { setDeletingUid(null); }
  }

  const selectedEvents = eventsOnDay(events, selectedYmd);
  const isCurrentMonth = (d: Date) => d.getMonth() === month;

  // ── No CalDAV account ──────────────────────────────────────────────────────
  if (noAccount) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <span className="text-4xl opacity-20">📅</span>
        <p className="text-sm text-gray-400 font-medium">Kein Kalender eingerichtet</p>
        <p className="text-xs text-gray-600 max-w-xs">
          Dein Kalender-Account wurde noch nicht provisioniert. Bitte wende dich an den Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-white overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/6 shrink-0">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors text-lg font-light"
        >‹</button>

        <button
          onClick={goToday}
          className="flex-1 text-center text-sm font-semibold text-white hover:text-indigo-300 transition-colors"
        >
          {MONTHS_DE[month]} {year}
        </button>

        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-colors text-lg font-light"
        >›</button>

        <div className="w-px h-4 bg-white/10" />

        <button
          onClick={load} disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40"
          title="Aktualisieren"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>

        <button
          onClick={() => openCreate(selectedYmd)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
        >
          + Termin
        </button>
      </div>

      {/* ── Day-of-week header ── */}
      <div
        className="grid shrink-0 border-b border-white/6"
        style={{ gridTemplateColumns: "28px repeat(7, 1fr)" }}
      >
        <div className="text-[9px] text-gray-700 text-center py-1.5 font-semibold tracking-wide">KW</div>
        {DAYS_SHORT.map((d, i) => (
          <div
            key={d}
            className={`text-[10px] text-center py-1.5 font-semibold tracking-wide ${
              i >= 5 ? "text-gray-600" : "text-gray-500"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full flex flex-col divide-y divide-white/4">
          {grid.map((week, ri) => (
            <div
              key={ri}
              className="flex-1 grid min-h-0"
              style={{ gridTemplateColumns: "28px repeat(7, 1fr)" }}
            >
              {/* KW cell */}
              <div className="flex items-start justify-center pt-1.5 border-r border-white/4">
                <span className="text-[9px] text-gray-700 font-semibold">
                  {isoWeek(week[0])}
                </span>
              </div>

              {/* Day cells */}
              {week.map((day, ci) => {
                const ymd = toYMD(day);
                const isToday = sameDay(day, today);
                const isSelected = ymd === selectedYmd;
                const inMonth = isCurrentMonth(day);
                const isWeekend = ci >= 5;
                const dayEvs = eventsOnDay(events, ymd);

                return (
                  <div
                    key={ci}
                    onClick={() => selectDay(ymd)}
                    onDoubleClick={() => openCreate(ymd)}
                    className={`relative flex flex-col border-r border-white/4 last:border-0 cursor-pointer transition-colors overflow-hidden ${
                      isSelected
                        ? "bg-indigo-600/12 ring-1 ring-inset ring-indigo-500/30"
                        : "hover:bg-white/4"
                    }`}
                  >
                    {/* Day number */}
                    <div className="flex justify-end pr-1 pt-0.5 shrink-0">
                      <span className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-medium leading-none transition-colors ${
                        isToday
                          ? "bg-indigo-500 text-white font-bold"
                          : isSelected
                          ? "text-indigo-300 font-semibold"
                          : inMonth
                          ? isWeekend ? "text-gray-600" : "text-gray-300"
                          : "text-gray-700"
                      }`}>
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Event pills */}
                    <div className="flex flex-col gap-0.5 px-0.5 pb-0.5 min-h-0">
                      {dayEvs.slice(0, 3).map(ev => {
                        const c = colorFor(ev.title);
                        const t = fmtTime(ev.start);
                        return (
                          <div
                            key={ev.uid}
                            className={`text-[9px] px-1 py-px rounded truncate leading-tight ${c.bg} ${c.text}`}
                            title={ev.title}
                          >
                            {t && <span className="opacity-60 mr-0.5">{t}</span>}
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvs.length > 3 && (
                        <div className="text-[9px] text-gray-600 px-1">
                          +{dayEvs.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom panel: day detail or create form ── */}
      <div className="shrink-0 border-t border-white/8 bg-gray-950/70 max-h-52 overflow-auto">
        {creating ? (
          /* Create form */
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Neuer Termin</span>
              <button
                onClick={() => setCreating(false)}
                className="text-gray-600 hover:text-gray-400 text-xl leading-none"
              >×</button>
            </div>

            {formError && (
              <p className="text-[11px] text-red-400">{formError}</p>
            )}

            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && saveEvent()}
              placeholder="Titel *"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[10px] text-gray-600 shrink-0">Datum</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <span className="text-[10px] text-gray-600">Ganztag</span>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, allDay: !f.allDay }))}
                  className={`relative w-8 h-4 rounded-full transition-colors ${form.allDay ? "bg-indigo-500" : "bg-gray-700"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.allDay ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </label>
            </div>

            {!form.allDay && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-600 shrink-0 w-5">Von</span>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-600 shrink-0 w-5">Bis</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <input
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Ort (optional)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />

            <div className="flex gap-2">
              <button
                onClick={saveEvent}
                disabled={saving || !form.title.trim()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors disabled:opacity-40"
              >
                {saving ? "Speichert…" : "Speichern"}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-[11px] transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          /* Day detail */
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">
                  {fmtDateLong(selectedYmd)}
                </span>
                {selectedYmd === toYMD(today) && (
                  <span className="text-[10px] text-indigo-400 bg-indigo-500/15 px-1.5 py-0.5 rounded-full">
                    Heute
                  </span>
                )}
              </div>
              <button
                onClick={() => openCreate(selectedYmd)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                + Termin
              </button>
            </div>

            {selectedEvents.length === 0 ? (
              <p className="text-[11px] text-gray-700">
                Keine Termine — Doppelklick auf den Tag oder oben „+ Termin".
              </p>
            ) : (
              <div className="space-y-1.5">
                {selectedEvents.map(ev => {
                  const c = colorFor(ev.title);
                  const tStart = fmtTime(ev.start);
                  const tEnd = fmtTime(ev.end);
                  return (
                    <div key={ev.uid} className={`flex items-start gap-2 px-2.5 py-2 rounded-lg ${c.card}`}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${c.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          {tStart && (
                            <span className="text-[10px] opacity-60 shrink-0 font-mono">
                              {tStart}{tEnd && tEnd !== tStart ? `–${tEnd}` : ""}
                            </span>
                          )}
                          {!tStart && (
                            <span className="text-[10px] opacity-50 shrink-0">Ganztag</span>
                          )}
                          <span className={`text-xs font-semibold ${c.text}`}>{ev.title}</span>
                        </div>
                        {ev.location && (
                          <p className={`text-[10px] opacity-60 truncate mt-0.5 ${c.text}`}>📍 {ev.location}</p>
                        )}
                        {ev.description && (
                          <p className={`text-[10px] opacity-50 truncate mt-0.5 ${c.text}`}>{ev.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteEvent(ev.uid)}
                        disabled={deletingUid === ev.uid}
                        className="shrink-0 text-xs opacity-25 hover:opacity-70 hover:text-red-400 transition-all disabled:opacity-15 mt-0.5"
                        title="Termin löschen"
                      >
                        {deletingUid === ev.uid ? "…" : "✕"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
