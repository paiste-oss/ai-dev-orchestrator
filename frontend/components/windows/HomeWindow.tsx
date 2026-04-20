"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { ArtifactEntry, UiPrefs } from "@/lib/chat-types";
import { WINDOW_MODULES } from "@/lib/window-registry";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { ACCENT_COLORS as ACCENT_COLORS_MAP, BG_COLORS, WINDOW_BG_SOLID } from "@/hooks/useUiPrefs";
import { useT } from "@/lib/i18n";

interface Props {
  artifacts: ArtifactEntry[];
  bgStyle?: React.CSSProperties;
  uiPrefs?: UiPrefs;
  onPrefsChange?: (patch: Partial<UiPrefs>) => void;
  onOpen: (type: string) => void;
}

const ACTIVE_MODULES = WINDOW_MODULES.filter(
  (m) => m.status === "active" || m.status === "beta"
);

// ── Billing ───────────────────────────────────────────────────────────────────

interface BillingStatus {
  plan_name: string | null;
  subscription_status: string;
  token_balance_chf: number;
  tokens_used_this_period: number;
  tokens_included: number;
}

function statusLabel(s: string, t: (key: string) => string) {
  if (s === "active")   return { label: t("home.status_active"),   cls: "text-green-400" };
  if (s === "trialing") return { label: t("home.status_trial"),    cls: "text-indigo-400" };
  if (s === "past_due") return { label: t("home.status_past_due"), cls: "text-yellow-400" };
  return                       { label: t("home.status_inactive"), cls: "text-gray-500" };
}

// ── Reminders ─────────────────────────────────────────────────────────────────

interface StockAlertOut {
  id: string;
  symbol: string;
  company_name: string | null;
  threshold: number;
  direction: string;
  currency: string;
}

interface TrainingReminderOut {
  id: string;
  training_type: string;
  weekly_schedule: Record<string, { time: string; duration_minutes?: number }>;
  reminder_minutes_before: number;
}

interface ActiveReminders {
  stock_alerts: StockAlertOut[];
  training_reminders: TrainingReminderOut[];
}

// ── Calendar ──────────────────────────────────────────────────────────────────

interface CalEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  description?: string | null;
  location?: string | null;
}

const DAY_NAMES: Record<string, string> = {
  monday: "Mo", tuesday: "Di", wednesday: "Mi",
  thursday: "Do", friday: "Fr", saturday: "Sa", sunday: "So",
};

// ── Design helpers ────────────────────────────────────────────────────────────

const ACCENT_COLORS = Object.entries(ACCENT_COLORS_MAP).map(([v, hex]) => ({ v, hex }));
const WINDOW_BG_OPTIONS = Object.entries(WINDOW_BG_SOLID).map(([v, hex]) => ({ v, hex }));
const FONT_COLOR_OPTIONS = [
  { v: "white", hex: "#ffffff" },
  { v: "black", hex: "#111111" },
];
const BG_OPTIONS = Object.keys(BG_COLORS).map((v) => ({ v, hex: BG_COLORS[v] }));

function ColorDot({ hex, active, onClick, title }: { hex: string; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-6 h-6 rounded-full border-2 transition-all ${active ? "border-white scale-110" : "border-transparent opacity-50 hover:opacity-90"}`}
      style={{ backgroundColor: hex }}
    />
  );
}

function DesignChips({ options, value, onChange }: {
  options: { v: string; l: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`px-2 py-1 rounded-md text-[10px] border transition-all ${
            value === o.v
              ? "bg-white/10 border-white/30 text-white font-medium"
              : "border-white/8 text-gray-500 hover:text-gray-300 hover:border-white/15"
          }`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HomeWindow({ artifacts, bgStyle, uiPrefs, onPrefsChange, onOpen }: Props) {
  const t = useT();
  const hasBg = !!(bgStyle?.backgroundImage && bgStyle.backgroundImage !== "none");

  // ── System tile ────────────────────────────────────────────────────────────
  const [billing, setBilling] = useState<BillingStatus | null>(null);

  useEffect(() => {
    apiFetch(`${BACKEND_URL}/v1/billing/status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setBilling(d))
      .catch(() => {});
  }, []);

  // ── Aktuelles tile ─────────────────────────────────────────────────────────
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [reminders, setReminders] = useState<ActiveReminders | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    apiFetch(`${BACKEND_URL}/v1/calendar/events?start=${today}&end=${today}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]));

    apiFetch(`${BACKEND_URL}/v1/user/active-reminders`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setReminders(d))
      .catch(() => {});
  }, []);

  // ── Design tile ────────────────────────────────────────────────────────────
  const [designOpen, setDesignOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updatePrefs = useCallback((patch: Partial<UiPrefs>) => {
    onPrefsChange?.(patch);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { backgroundImage: _bg, ...rest } = { ...(uiPrefs ?? {}), ...patch };
      const body: Record<string, unknown> = { ...rest };
      if ("backgroundImage" in patch) {
        body.backgroundImage = patch.backgroundImage ?? "";
      }
      await apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 400);
  }, [onPrefsChange, uiPrefs]);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.onload = () => {
      const maxW = 1920, maxH = 1080;
      let { width, height } = img;
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      updatePrefs({ backgroundImage: canvas.toDataURL("image/jpeg", 0.75) as UiPrefs["backgroundImage"], background: "dark" });
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const { label: statusText, cls: statusCls } = statusLabel(billing?.subscription_status ?? "inactive", t);

  const todayHasEvents = events !== null && events.length > 0;
  const hasReminders = reminders && (reminders.stock_alerts.length > 0 || reminders.training_reminders.length > 0);

  return (
    <div
      className="relative h-full overflow-hidden"
      style={hasBg ? { ...bgStyle, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {hasBg && <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />}

      <div className="relative h-full overflow-y-auto p-5 space-y-5">

        {/* ── System + Aktuelles ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* System tile */}
          <div className="rounded-2xl border border-white/10 bg-black/25 backdrop-blur-sm p-4 space-y-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t("home.system")}</p>
            {billing ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{t("home.plan")}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium ${statusCls}`}>{statusText}</span>
                    <span className="text-xs text-white font-medium">{billing.plan_name ?? t("home.no_plan")}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{t("home.balance")}</span>
                  <span className="text-xs text-white font-medium">
                    CHF {billing.token_balance_chf.toFixed(2)}
                  </span>
                </div>
                {billing.tokens_included > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">{t("home.tokens")}</span>
                      <span className="text-[10px] text-gray-400">
                        {billing.tokens_used_this_period.toLocaleString()} / {billing.tokens_included.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (billing.tokens_used_this_period / billing.tokens_included) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-16 flex items-center justify-center">
                <div className="w-4 h-4 border border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Aktuelles tile */}
          <div className="rounded-2xl border border-white/10 bg-black/25 backdrop-blur-sm p-4 space-y-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t("home.current")}</p>
            <div className="space-y-2">

              {/* Calendar events */}
              {events === null ? (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                  <div className="w-3 h-3 border border-white/20 border-t-white/40 rounded-full animate-spin shrink-0" />
                  {t("home.calendar_loading")}
                </div>
              ) : todayHasEvents ? (
                <div className="space-y-1">
                  {events.slice(0, 4).map(ev => {
                    const time = ev.start ? new Date(ev.start).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "";
                    return (
                      <div key={ev.uid} className="flex items-center gap-2">
                        <span className="text-[10px] text-indigo-400 shrink-0 w-10">{time}</span>
                        <span className="text-[11px] text-gray-300 truncate">{ev.title}</span>
                      </div>
                    );
                  })}
                  {events.length > 4 && (
                    <p className="text-[10px] text-gray-600">{t("home.more_events", { n: events.length - 4 })}</p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-600">{t("home.no_events")}</p>
              )}

              {/* Reminders */}
              {hasReminders && (
                <div className="space-y-1 pt-1 border-t border-white/5">
                  {reminders!.training_reminders.map(r => {
                    const days = Object.keys(r.weekly_schedule).map(d => DAY_NAMES[d] ?? d).join(" ");
                    return (
                      <div key={r.id} className="flex items-center gap-2">
                        <span className="text-[10px] shrink-0">🏃</span>
                        <span className="text-[11px] text-gray-300 truncate">{r.training_type} · {days}</span>
                      </div>
                    );
                  })}
                  {reminders!.stock_alerts.map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="text-[10px] shrink-0">📈</span>
                      <span className="text-[11px] text-gray-300 truncate">
                        {a.symbol} {a.direction === "above" ? ">" : "<"} {a.threshold} {a.currency}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!hasReminders && events !== null && events.length === 0 && (
                <p className="text-[11px] text-gray-600">{t("home.no_reminders")}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Design tile ────────────────────────────────────────────────── */}
        {uiPrefs && (
          <div className="rounded-2xl border border-white/10 bg-black/25 backdrop-blur-sm overflow-hidden">
            <button
              onClick={() => setDesignOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors"
            >
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t("home.design")}</p>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] transition-opacity duration-300 ${saved ? "text-green-400 opacity-100" : "opacity-0"}`}>
                  {t("home.design_saved")}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${designOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </button>

            {designOpen && <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Left column */}
              <div className="space-y-4">

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.background")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BG_OPTIONS.map(bg => (
                      <ColorDot key={bg.v} hex={bg.hex} title={t(`design.bg_${bg.v}`)}
                        active={uiPrefs.background === bg.v && !uiPrefs.backgroundImage}
                        onClick={() => updatePrefs({ background: bg.v, backgroundImage: "" as UiPrefs["backgroundImage"] })}
                      />
                    ))}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg border text-[10px] transition-all ${
                        uiPrefs.backgroundImage ? "border-white/30 text-white" : "border-white/8 text-gray-500 hover:text-gray-300 hover:border-white/15"
                      }`}
                    >
                      {uiPrefs.backgroundImage ? (
                        <><img src={uiPrefs.backgroundImage} alt="" className="w-3.5 h-3.5 rounded object-cover" />{t("design.image_active")}</>
                      ) : t("design.upload_image")}
                    </button>
                    {uiPrefs.backgroundImage && (
                      <button onClick={() => updatePrefs({ backgroundImage: "" as UiPrefs["backgroundImage"] })}
                        className="px-2 h-7 rounded-lg border border-white/8 text-[10px] text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-all">
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.window_bg")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WINDOW_BG_OPTIONS.map(bg => (
                      <ColorDot key={bg.v} hex={bg.hex} title={bg.v}
                        active={(uiPrefs.windowBg ?? "glass") === bg.v}
                        onClick={() => updatePrefs({ windowBg: bg.v })}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.accent")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCENT_COLORS.map(c => (
                      <ColorDot key={c.v} hex={c.hex} title={c.v}
                        active={uiPrefs.accentColor === c.v}
                        onClick={() => updatePrefs({ accentColor: c.v })}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.font_color")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FONT_COLOR_OPTIONS.map(c => (
                      <ColorDot key={c.v} hex={c.hex} title={c.v}
                        active={uiPrefs.fontColor === c.v}
                        onClick={() => updatePrefs({ fontColor: c.v })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.font_size")}</p>
                  <DesignChips value={uiPrefs.fontSize} onChange={v => updatePrefs({ fontSize: v })} options={[
                    { v: "small", l: t("design.font_small") }, { v: "normal", l: t("design.font_normal") },
                    { v: "large", l: t("design.font_large") }, { v: "xlarge", l: t("design.font_xlarge") },
                  ]} />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.font_family")}</p>
                  <DesignChips value={uiPrefs.fontFamily} onChange={v => updatePrefs({ fontFamily: v })} options={[
                    { v: "system", l: t("design.font_system") }, { v: "nunito_sans", l: "Nunito Sans" },
                    { v: "mono", l: t("design.font_mono") }, { v: "rounded", l: t("design.font_rounded") },
                    { v: "serif", l: t("design.font_serif") },
                  ]} />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.chat_width")}</p>
                  <DesignChips value={uiPrefs.chatWidth} onChange={v => updatePrefs({ chatWidth: v })} options={[
                    { v: "compact", l: t("design.width_compact") }, { v: "normal", l: t("design.width_normal") },
                    { v: "wide", l: t("design.width_wide") }, { v: "full", l: t("design.width_full") },
                  ]} />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.line_spacing")}</p>
                  <DesignChips value={uiPrefs.lineSpacing} onChange={v => updatePrefs({ lineSpacing: v })} options={[
                    { v: "compact", l: t("design.spacing_compact") }, { v: "normal", l: t("design.spacing_normal") }, { v: "wide", l: t("design.spacing_wide") },
                  ]} />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.timestamps")}</p>
                  <DesignChips value={uiPrefs.showTimestamps} onChange={v => updatePrefs({ showTimestamps: v })} options={[
                    { v: "always", l: t("design.ts_always") }, { v: "hover", l: t("design.ts_hover") }, { v: "never", l: t("design.ts_never") },
                  ]} />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.buddy_name_label")}</p>
                  <input
                    value={uiPrefs.buddyName ?? "Baddi"}
                    onChange={e => updatePrefs({ buddyName: e.target.value.slice(0, 30) })}
                    placeholder="Baddi"
                    className="w-full bg-white/5 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.avatar")}</p>
                  <div className="flex gap-1.5">
                    {[{ v: "robot", l: "🤖" }, { v: "teekanne", l: "🫖" }, { v: "lichtgestalt", l: "✨" }].map(a => (
                      <button key={a.v} onClick={() => updatePrefs({ avatarType: a.v })}
                        className={`flex-1 py-1.5 rounded-lg text-sm border transition-all ${
                          (uiPrefs.avatarType ?? "robot") === a.v
                            ? "bg-white/10 border-white/25" : "border-white/8 hover:border-white/15"
                        }`}>
                        {a.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.tts")}</p>
                  <div className="flex gap-1.5">
                    {[{ v: false, l: t("design.tts_off") }, { v: true, l: t("design.tts_on") }].map(({ v, l }) => (
                      <button key={String(v)} onClick={() => updatePrefs({ ttsDefault: v })}
                        className={`flex-1 py-1.5 rounded-lg text-xs border transition-all ${
                          (uiPrefs.ttsDefault ?? false) === v
                            ? "bg-white/10 border-white/25 text-white" : "border-white/8 text-gray-500 hover:text-gray-300 hover:border-white/15"
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t("design.voice")}</p>
                  <div className="flex gap-1.5">
                    {[{ v: "female", l: t("design.voice_female") }, { v: "male", l: t("design.voice_male") }].map(({ v, l }) => (
                      <button key={v} onClick={() => updatePrefs({ ttsVoice: v })}
                        className={`flex-1 py-1.5 rounded-lg text-xs border transition-all ${
                          (uiPrefs.ttsVoice ?? "female") === v
                            ? "bg-white/10 border-white/25 text-white" : "border-white/8 text-gray-500 hover:text-gray-300 hover:border-white/15"
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>}
          </div>
        )}

        {/* ── All windows ──────────────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
            {t("home.all_windows")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACTIVE_MODULES.map((m) => {
              const alreadyOpen = artifacts.some((a) => a.type === m.canvasType);
              return (
                <button
                  key={m.id}
                  onClick={() => onOpen(m.canvasType)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors backdrop-blur-sm ${
                    alreadyOpen
                      ? "bg-indigo-950/50 border-indigo-500/40 hover:bg-indigo-950/70"
                      : "bg-black/20 border-white/10 hover:bg-black/30 hover:border-white/20"
                  }`}
                >
                  <span className="text-lg shrink-0 mt-0.5">{m.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{t(`window.${m.canvasType}.label`) !== `window.${m.canvasType}.label` ? t(`window.${m.canvasType}.label`) : m.label}</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5 line-clamp-2">
                      {t(`window.${m.canvasType}.desc`) !== `window.${m.canvasType}.desc` ? t(`window.${m.canvasType}.desc`, { buddy: uiPrefs?.buddyName ?? "Baddi" }) : m.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
