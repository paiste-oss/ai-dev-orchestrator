"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch, getToken } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Group { id: string; color: string; label: string; }
interface NetworkMember { personId: string; group: string; }
interface NetworkNode {
  id: string; name: string; x: number; y: number;
  groups: Group[]; members: NetworkMember[];
  note?: string; createdAt: number;
}
interface Person {
  id: string; name: string; photo: string | null;
  x: number; y: number; note: string; fullName: string;
  createdAt?: number; lastMentionedAt?: number;
}
interface Connection { id: string; a: string; b: string; label?: string; }
interface AppData { persons: Person[]; networks: NetworkNode[]; connections: Connection[]; }

// ─── Constants ────────────────────────────────────────────────────────────────
const PALETTE = [
  "#FF6B6B","#FF8E8E","#FFB3B3","#4ECDC4","#26A69A","#00796B",
  "#FFE66D","#FFD600","#F9A825","#A78BFA","#7C3AED","#C084FC",
  "#F97316","#FB923C","#EA580C","#60A5FA","#3B82F6","#1D4ED8",
  "#34D399","#10B981","#059669","#F472B6","#EC4899","#BE185D",
  "#94A3B8","#64748B","#334155","#FFFFFF","#C8D8E8","#E2E2E8",
];
const makeDefaultGroups = (): Group[] => {
  const t = Date.now();
  return [
    { id: `g${t}1`, color: "#FF6B6B", label: "Gruppe 1" },
    { id: `g${t}2`, color: "#4ECDC4", label: "Gruppe 2" },
    { id: `g${t}3`, color: "#FFE66D", label: "Gruppe 3" },
  ];
};
const MIN_ZOOM = 0.08; const MAX_ZOOM = 4;
const HUB_R = 56;
const NODE_R_MAX = 38;
const personRadius = (label: string) => {
  const len = (label || "").length;
  if (len <= 3) return 26; if (len <= 6) return 32; return 38;
};
const personCollisionRadius = (label: string, hasPhoto: boolean) => {
  const r = personRadius(label);
  return hasPhoto ? r + 58 : r + 22;
};
const randomBetween = (a: number, b: number) => Math.random() * (b - a) + a;
let _id = Date.now();
const newId = () => `n${_id++}`;

const defaultData = (): AppData => ({ persons: [], networks: [], connections: [] });

// ─── Helpers ──────────────────────────────────────────────────────────────────
const resizeImage = (file: File, max = 220): Promise<string> =>
  new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(max / img.width, max / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * s); canvas.height = Math.round(img.height * s);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve(ev.target!.result as string);
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });

function wrapNodeText(name: string, maxWidth: number, fontScale = 1) {
  const words = name.split(/\s+/);
  const sizes = [14, 12, 11, 10].map(s => Math.round(s * fontScale));
  for (const fs of sizes) {
    const charsPerLine = Math.floor(maxWidth / (fs * 0.62));
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const candidate = cur ? cur + " " + w : w;
      if (candidate.length <= charsPerLine) { cur = candidate; }
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    const lineH = fs * 1.3;
    if (lines.length * lineH <= maxWidth * 0.9) return { lines, fontSize: fs, lineHeight: lineH };
  }
  return { lines: words, fontSize: 10, lineHeight: 13 };
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={`absolute bottom-[70px] left-1/2 -translate-x-1/2 transition-all duration-200 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg px-5 py-2 text-xs pointer-events-none z-[200] whitespace-nowrap ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
      ✓ {message}
    </div>
  );
}

// ─── ZoomControls ─────────────────────────────────────────────────────────────
function ZoomControls({ zoom, onZoomIn, onZoomOut }: { zoom: number; onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <div className="absolute bottom-3.5 right-3.5 flex flex-col rounded-xl overflow-hidden border border-white/5 z-50 shadow-lg">
      <button onClick={onZoomIn} className="w-9 h-9 bg-[#1a1a28] border-none text-gray-400 cursor-pointer text-lg flex items-center justify-center hover:text-white hover:bg-[#1e1e30] transition-colors">+</button>
      <div className="bg-[#13131c] border-y border-white/5 text-gray-600 text-[11px] text-center py-0.5 select-none font-mono">{Math.round(zoom * 100)}%</div>
      <button onClick={onZoomOut} className="w-9 h-9 bg-[#1a1a28] border-none text-gray-400 cursor-pointer text-lg flex items-center justify-center hover:text-white hover:bg-[#1e1e30] transition-colors">−</button>
    </div>
  );
}

// ─── HubNode ──────────────────────────────────────────────────────────────────
function HubNode({ net, memberCount, isSelected, isHovered, onMouseDown, onTouchStart, onMouseEnter, onMouseLeave, fontScale = 1 }: {
  net: NetworkNode; memberCount: number; isSelected: boolean; isHovered: boolean; fontScale?: number;
  onMouseDown: React.MouseEventHandler; onTouchStart: React.TouchEventHandler;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const { lines, fontSize, lineHeight } = wrapNodeText(net.name, (HUB_R - 10) * 2, fontScale);
  const totalH = (lines.length - 1) * lineHeight;
  return (
    <g transform={`translate(${net.x},${net.y})`} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="cursor-grab">
      {isSelected && <circle r={HUB_R + 16} fill="#C8D8E8" opacity="0.08" />}
      {isHovered && !isSelected && <circle r={HUB_R + 10} fill="#C8D8E8" opacity="0.05" />}
      <circle r={HUB_R} fill="#C8D8E8" opacity={isSelected ? 1 : 0.90} stroke={isSelected ? "#C8D8E8" : "#8AAABB"} strokeWidth={isSelected ? 3 : 1.5} />
      <circle r={HUB_R - 8} fill="none" stroke="#00000018" strokeWidth="1" />
      <text textAnchor="middle" fill="#1a2a38" fontSize={fontSize} fontFamily="ui-monospace,monospace" fontWeight="700" letterSpacing="0.02em">
        {lines.map((l, i) => <tspan key={i} x="0" dy={i === 0 ? -totalH / 2 : lineHeight}>{l}</tspan>)}
      </text>
      <g transform={`translate(${HUB_R - 10},${-(HUB_R - 10)})`}>
        <circle r="11" fill="#1a2a38" />
        <text textAnchor="middle" dominantBaseline="middle" fill="#C8D8E8" fontSize="10" fontFamily="ui-monospace,monospace" fontWeight="700">{memberCount}</text>
      </g>
    </g>
  );
}

// ─── PersonNode ───────────────────────────────────────────────────────────────
function PersonNode({ person, isSelected, isHovered, isConnectSrc, mode, colors, onMouseDown, onTouchStart, onMouseEnter, onMouseLeave, fontScale = 1, displayLabel }: {
  person: Person; isSelected: boolean; isHovered: boolean; isConnectSrc: boolean; mode: string;
  colors: string[]; fontScale?: number; displayLabel: string;
  onMouseDown: React.MouseEventHandler; onTouchStart: React.TouchEventHandler;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const clipId = `clip-${person.id}`;
  const mainColor = colors[0] || "#888";
  const R = personRadius(displayLabel);
  const strokeW = isSelected ? 3 : 2;
  const segCount = colors.length;
  const circ = 2 * Math.PI * R;
  const gap = segCount > 1 ? 1.5 : 0;
  const segLen = circ / segCount - gap;

  return (
    <g transform={`translate(${person.x},${person.y})`} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={mode === "connect" ? "cursor-pointer" : "cursor-grab"}>
      <defs><clipPath id={clipId}><circle r={R} /></clipPath></defs>
      {(isSelected || isConnectSrc) && <circle r={R + 14} fill={mainColor} opacity="0.13" />}
      {isHovered && !isSelected && <circle r={R + 8} fill={mainColor} opacity="0.07" />}
      <circle r={R} fill="#13131c" />
      {isConnectSrc ? (
        <circle r={R} fill="none" stroke="#fff" strokeWidth={strokeW} />
      ) : segCount === 1 ? (
        <circle r={R} fill="none" stroke={mainColor} strokeWidth={strokeW} />
      ) : (
        colors.map((col, i) => {
          const offset = -(circ / 4) + i * (segLen + gap);
          return <circle key={i} r={R} fill="none" stroke={col} strokeWidth={strokeW} strokeDasharray={`${segLen} ${circ - segLen}`} strokeDashoffset={-offset} />;
        })
      )}
      {person.photo ? (
        <image href={person.photo} x={-R} y={-R} width={R * 2} height={R * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
      ) : (() => {
        const GAP = 10;
        const { lines, fontSize, lineHeight } = wrapNodeText(displayLabel, (R - GAP) * 2, fontScale);
        const totalH = (lines.length - 1) * lineHeight;
        return <>
          <circle r={R - 5} fill="none" stroke={mainColor} strokeWidth="1" opacity="0.12" />
          <text textAnchor="middle" fill={mainColor} fontSize={fontSize} fontFamily="ui-monospace,monospace" fontWeight="600" letterSpacing="0.02em">
            {lines.map((l, i) => <tspan key={i} x="0" dy={i === 0 ? -totalH / 2 : lineHeight}>{l}</tspan>)}
          </text>
        </>;
      })()}
      {person.photo && (() => {
        const GAP = 22;
        const { lines, fontSize, lineHeight } = wrapNodeText(displayLabel, R * 2, fontScale);
        const totalTextH = lines.length * lineHeight;
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={-R} y={R + GAP - fontSize} width={R * 2} height={totalTextH + 4} fill="#0d0d14" opacity="0.72" rx="3" />
            <text textAnchor="middle" fill={mainColor} fontSize={fontSize} fontFamily="ui-monospace,monospace" fontWeight="600">
              {lines.map((l, i) => <tspan key={i} x="0" dy={i === 0 ? R + GAP : lineHeight}>{l}</tspan>)}
            </text>
          </g>
        );
      })()}
    </g>
  );
}

// ─── Shared panel event blocker ───────────────────────────────────────────────
const stopAll = {
  onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseMove: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseUp: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchMove: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.SyntheticEvent) => e.stopPropagation(),
};

const fieldLabel = "block text-[10px] text-gray-600 tracking-widest uppercase mb-1.5";
const panelInput = "w-full bg-[#0d0d14] border border-white/8 rounded-md text-[#e2e2e8] px-3 py-1.5 text-sm outline-none focus:border-white/20 transition-colors";

// ─── PersonPanel ──────────────────────────────────────────────────────────────
function PersonPanel({ person, networks, connections, allPersons, onClose, onPhotoChange, onRename, onUpdateFields, onGroupChange, onAddToNetwork, onRemoveFromNetwork, onCreateAndAddToNetwork, onDeletePerson, onUpdateConnectionLabel, getGroupColor, getGroupLabel, getNetGroups }: {
  person: Person; networks: NetworkNode[]; connections: Connection[]; allPersons: Person[];
  onClose: () => void; onPhotoChange: (id: string, photo: string | null) => void;
  onRename: (id: string, name: string) => void; onUpdateFields: (id: string, fields: Partial<Person>) => void;
  onGroupChange: (personId: string, netId: string, groupId: string) => void;
  onAddToNetwork: (personId: string, netId: string) => void;
  onRemoveFromNetwork: (personId: string, netId: string) => void;
  onCreateAndAddToNetwork: (personId: string) => void;
  onDeletePerson: (id: string) => void;
  onUpdateConnectionLabel: (connId: string, label: string) => void;
  getGroupColor: (groupId: string, netGroups: Group[]) => string;
  getGroupLabel: (groupId: string, netGroups: Group[]) => string;
  getNetGroups: (netId: string) => Group[];
}) {
  const [editName, setEditName] = useState(person.name);
  const [fields, setFields] = useState({ fullName: person.fullName || "", note: person.note || "" });
  const memberNets = networks.filter(n => n.members?.some(m => m.personId === person.id));
  const nonMemberNets = networks.filter(n => !n.members?.some(m => m.personId === person.id));
  const firstMember = memberNets[0]?.members?.find(m => m.personId === person.id);
  const netGroups = firstMember ? getNetGroups(memberNets[0]?.id) : [];
  const color = firstMember ? getGroupColor(firstMember.group, netGroups) : "#888";
  const saveField = (key: keyof Person, val: string) => onUpdateFields(person.id, { [key]: val } as Partial<Person>);

  return (
    <div className="absolute inset-y-0 right-0 w-[min(280px,92%)] bg-[#13131c] z-[60] flex flex-col shadow-[-8px_0_30px_rgba(0,0,0,0.5)]"
      style={{ borderLeft: `2px solid ${color}40` }} {...stopAll}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <span className="text-[11px] tracking-widest uppercase" style={{ color }}>Person</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg leading-none cursor-pointer bg-transparent border-none transition-colors">×</button>
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto" style={{ touchAction: "pan-y" }}
        onWheel={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>

        {/* Photo */}
        <div className="px-4 pt-4 pb-3">
          {person.photo && (
            <div className="w-[90px] h-[90px] rounded-full mx-auto overflow-hidden mb-2 border-2" style={{ borderColor: color }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={person.photo} alt={person.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex gap-1.5 justify-center flex-wrap">
            <label className="inline-block px-3 py-1.5 bg-[#1a1a28] rounded-md text-[11px] cursor-pointer transition-colors hover:bg-[#1e1e30]" style={{ border: `1px solid ${color}40`, color }}>
              📷 {person.photo ? "Foto ändern" : "Foto hochladen"}
              <input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { onPhotoChange(person.id, await resizeImage(f)); } e.target.value = ""; }} />
            </label>
            {person.photo && (
              <button onClick={() => onPhotoChange(person.id, null)} className="px-3 py-1.5 bg-transparent border border-red-500/20 text-red-400 rounded-md text-[11px] cursor-pointer hover:bg-red-500/10 transition-colors">
                ✕ Entfernen
              </button>
            )}
          </div>
        </div>

        <div className="mx-4 mb-3 border-t border-white/5" />

        {/* Name */}
        <div className="px-4 pb-3">
          <label className={fieldLabel}>👤 Name</label>
          <div className="flex gap-1.5">
            <input value={editName} maxLength={24} onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onRename(person.id, editName); }}
              className={`${panelInput} flex-1 font-semibold`} style={{ borderColor: `${color}30` }} />
            <button onClick={() => onRename(person.id, editName)}
              className="px-3 py-1.5 rounded-md text-sm font-bold cursor-pointer border-none transition-opacity hover:opacity-80"
              style={{ background: color, color: "#000" }}>✓</button>
          </div>
        </div>

        {/* Full name */}
        <div className="px-4 pb-3">
          <label className={fieldLabel}>✦ Ganzer Name</label>
          <input type="text" value={fields.fullName} onChange={e => setFields(f => ({ ...f, fullName: e.target.value }))}
            onBlur={e => saveField("fullName", e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Vor- und Nachname…" className={panelInput} style={{ borderColor: `${color}20` }} />
        </div>

        {/* Dates */}
        {(person.createdAt || person.lastMentionedAt) && (() => {
          const fmt = (ms: number) => new Date(ms).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
          return (
            <div className="px-4 pb-3">
              {person.createdAt && (
                <div className="flex justify-between text-[10px] text-gray-700 mb-0.5">
                  <span>Hinzugefügt</span>
                  <span>{fmt(person.createdAt)}</span>
                </div>
              )}
              {person.lastMentionedAt && (
                <div className="flex justify-between text-[10px] text-gray-700">
                  <span>Zuletzt erwähnt</span>
                  <span>{fmt(person.lastMentionedAt)}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Group per network */}
        {memberNets.map(net => {
          const m = net.members?.find(m => m.personId === person.id);
          if (!m) return null;
          const ng = getNetGroups(net.id);
          const gc = getGroupColor(m.group, ng);
          const gl = getGroupLabel(m.group, ng);
          return (
            <div key={net.id} className="px-4 pb-3">
              <label className={fieldLabel}>
                ● Gruppe in <span className="text-[#C8D8E8]">{net.name}</span>
              </label>
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {ng.map(g => (
                  <button key={g.id} onClick={() => onGroupChange(person.id, net.id, g.id)} title={g.label}
                    className="w-6 h-6 rounded-full cursor-pointer transition-transform"
                    style={{ background: g.color, border: m.group === g.id ? "3px solid #fff" : "3px solid transparent", transform: m.group === g.id ? "scale(1.18)" : "scale(1)" }} />
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: gc }} />
                <span className="text-[11px]" style={{ color: gc }}>{gl}</span>
              </div>
            </div>
          );
        })}

        <div className="mx-4 mb-3 border-t border-white/5" />

        {/* Note */}
        <div className="px-4 pb-3">
          <label className={fieldLabel}>📝 Notiz</label>
          <textarea value={fields.note} rows={3}
            onChange={e => setFields(f => ({ ...f, note: e.target.value }))}
            onBlur={e => saveField("note", e.target.value)}
            className={`${panelInput} resize-y leading-relaxed`} style={{ borderColor: `${color}20` }} />
        </div>

        <div className="mx-4 mb-3 border-t border-white/5" />

        {/* Networks */}
        <div className="px-4 pb-2">
          <label className={fieldLabel}>◉ Netzwerke</label>
          {memberNets.map(net => (
            <div key={net.id} className="flex items-center gap-2 mt-1.5">
              <div className="w-3 h-3 rounded-full bg-[#C8D8E8] shrink-0" />
              <span className="flex-1 text-xs text-gray-300 truncate">{net.name}</span>
              <button onClick={() => onRemoveFromNetwork(person.id, net.id)}
                className="text-[10px] text-red-400 border border-red-500/20 rounded px-1.5 py-0.5 cursor-pointer hover:bg-red-500/10 transition-colors bg-transparent">
                entfernen
              </button>
            </div>
          ))}
          {nonMemberNets.length > 0 && (
            <div className="mt-2.5">
              <span className="text-[10px] text-gray-700">Hinzufügen zu:</span>
              {nonMemberNets.map(net => (
                <button key={net.id} onClick={() => onAddToNetwork(person.id, net.id)}
                  className="flex items-center gap-2 w-full mt-1.5 bg-[#1a1a28] border border-white/5 rounded-md px-2.5 py-1.5 cursor-pointer text-gray-400 hover:border-white/10 hover:text-gray-200 transition-colors text-left">
                  <span className="text-sm">+</span>
                  <span className="text-xs truncate">{net.name}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => onCreateAndAddToNetwork(person.id)}
            className="flex items-center gap-2 w-full mt-1.5 bg-[#1a1a28] border border-dashed border-teal-500/30 rounded-md px-2.5 py-1.5 cursor-pointer text-teal-400 hover:border-teal-500/50 transition-colors text-left">
            <span className="text-sm">✦</span>
            <span className="text-xs">Neues Netzwerk</span>
          </button>
        </div>

        {/* Connections */}
        {(() => {
          const myConns = connections.filter(c => c.a === person.id || c.b === person.id);
          if (myConns.length === 0) return null;
          return (
            <>
              <div className="mx-4 mb-3 border-t border-white/5" />
              <div className="px-4 pb-2">
                <label className={fieldLabel}>🔗 Verbindungen ({myConns.length})</label>
                {myConns.map(c => {
                  const otherId = c.a === person.id ? c.b : c.a;
                  const other = allPersons.find(p => p.id === otherId);
                  if (!other) return null;
                  return (
                    <div key={c.id} className="mt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-purple-400/60 shrink-0" />
                        <span className="text-xs text-gray-300 truncate flex-1">{other.name}</span>
                      </div>
                      <input
                        type="text"
                        defaultValue={c.label || ""}
                        placeholder="Art (Freund, Familie…)"
                        maxLength={32}
                        onBlur={e => onUpdateConnectionLabel(c.id, e.target.value.trim())}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="w-full bg-[#0d0d14] border border-white/8 rounded-md text-[#e2e2e8] px-2.5 py-1 text-xs outline-none focus:border-purple-500/30 transition-colors"
                      />
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        <div className="h-2" />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5 shrink-0">
        <button onClick={() => { onDeletePerson(person.id); onClose(); }}
          className="w-full py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm cursor-pointer hover:bg-red-500/15 transition-colors">
          ✕ Person überall löschen
        </button>
      </div>
    </div>
  );
}

// ─── HubPanel ─────────────────────────────────────────────────────────────────
function HubPanel({ net, allPersons, onClose, onRename, onDelete, onSelectPerson, onUpdateGroup, onAddGroup, onDeleteGroup, getGroupColor, getGroupLabel, onUpdateNote }: {
  net: NetworkNode; allPersons: Person[]; onClose: () => void;
  onRename: (id: string, name: string) => void; onDelete: (id: string) => void;
  onSelectPerson: (p: Person) => void;
  onUpdateGroup: (netId: string, groupId: string, patch: Partial<Group>) => void;
  onAddGroup: () => void; onDeleteGroup: (gid: string) => void;
  getGroupColor: (groupId: string, netGroups: Group[]) => string;
  getGroupLabel: (groupId: string, netGroups: Group[]) => string;
  onUpdateNote: (netId: string, note: string) => void;
}) {
  const [editName, setEditName] = useState(net.name);
  const [colorPickFor, setColorPickFor] = useState<string | null>(null);
  const [note, setNote] = useState(net.note || "");
  const members = net.members || [];
  const groups = net.groups || [];

  return (
    <div className="absolute inset-y-0 right-0 w-[min(280px,92%)] bg-[#13131c] border-l-2 border-[#C8D8E8]/15 z-[60] flex flex-col shadow-[-8px_0_30px_rgba(0,0,0,0.5)]"
      {...stopAll}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 rounded-full bg-[#C8D8E8] shrink-0" />
          <span className="text-[11px] text-gray-300 tracking-widest uppercase">Netzwerk</span>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-lg leading-none cursor-pointer bg-transparent border-none transition-colors">×</button>
      </div>

      {/* Name */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <label className={fieldLabel}>Name</label>
        <div className="flex gap-1.5">
          <input value={editName} maxLength={editName.includes(" ") ? 23 : 15}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onRename(net.id, editName); }}
            className={`${panelInput} flex-1 text-sm font-semibold`} />
          <button onClick={() => onRename(net.id, editName)}
            className="px-3 py-1.5 bg-[#C8D8E8] text-[#1a2a38] rounded-md font-bold text-sm cursor-pointer hover:opacity-90 transition-opacity border-none">
            ✓
          </button>
        </div>
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto" style={{ touchAction: "pan-y" }}
        onWheel={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>

        {/* Note */}
        <div className="px-4 py-3 border-b border-white/5">
          <label className={fieldLabel}>📝 Notiz</label>
          <textarea value={note} rows={4}
            onChange={e => setNote(e.target.value)}
            onBlur={e => onUpdateNote(net.id, e.target.value)}
            className={`${panelInput} w-full resize-y leading-relaxed mt-1`} />
        </div>

        {/* Members */}
        <div className="border-b border-white/5">
          <div className="px-4 pt-2.5 pb-1">
            <label className={fieldLabel}>👤 Personen ({members.length})</label>
          </div>
          {members.length === 0 && <p className="px-4 pb-3 text-xs text-gray-700">Noch keine Personen</p>}
          {members.map(m => {
            const person = allPersons.find(p => p.id === m.personId);
            if (!person) return null;
            const color = getGroupColor(m.group, net.groups);
            const label = getGroupLabel(m.group, net.groups);
            return (
              <button key={m.personId} onClick={() => onSelectPerson(person)}
                className="w-full flex items-center gap-3 px-4 py-2 bg-transparent border-none cursor-pointer text-left hover:bg-white/3 transition-colors">
                <div className="w-9 h-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center bg-[#0d0d14]"
                  style={{ border: `2px solid ${color}` }}>
                  {person.photo
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={person.photo} alt={person.name} className="w-full h-full object-cover" />
                    : <span className="text-xs font-bold" style={{ color }}>{person.name.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#e2e2e8] font-semibold truncate">
                    {allPersons.filter(p => p.name === person.name).length > 1 && person.fullName ? person.fullName : person.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[10px] text-gray-600">{label}</span>
                  </div>
                </div>
                <span className="text-gray-700 text-sm shrink-0">›</span>
              </button>
            );
          })}
        </div>

        {/* Groups */}
        <div className="py-2">
          <div className="px-4 pb-1.5">
            <label className={fieldLabel}>🎨 Gruppen</label>
          </div>
          {groups.map(g => (
            <div key={g.id} className="px-4 py-1.5">
              <div className="flex items-center gap-2">
                <button onClick={() => setColorPickFor(colorPickFor === g.id ? null : g.id)}
                  className="w-6 h-6 rounded-full cursor-pointer shrink-0 outline-none border-2 border-white/10 hover:border-white/30 transition-colors"
                  style={{ background: g.color }} />
                <input value={g.label}
                  onChange={e => onUpdateGroup(net.id, g.id, { label: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="flex-1 bg-[#0d0d14] rounded-md text-[#e2e2e8] px-2 py-1 text-xs outline-none border"
                  style={{ borderColor: `${g.color}40` }} />
                {groups.length > 1 && (
                  <button onClick={() => { onDeleteGroup(g.id); if (colorPickFor === g.id) setColorPickFor(null); }}
                    className="text-gray-600 hover:text-gray-300 text-base leading-none cursor-pointer bg-transparent border-none px-0.5 shrink-0 transition-colors">
                    ×
                  </button>
                )}
              </div>
              {colorPickFor === g.id && (
                <div className="mt-2 ml-8 flex flex-wrap gap-1">
                  {PALETTE.map(col => (
                    <button key={col} onClick={() => { onUpdateGroup(net.id, g.id, { color: col }); setColorPickFor(null); }}
                      className="w-5 h-5 rounded-full cursor-pointer outline-none transition-transform hover:scale-110"
                      style={{ background: col, border: col === g.color ? "2px solid #fff" : "2px solid transparent" }} />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="px-4 pt-1 pb-1.5">
            <button onClick={onAddGroup}
              className="w-full py-1.5 bg-[#1a1a28] border border-dashed border-white/10 rounded-md text-gray-600 cursor-pointer text-xs hover:border-white/20 hover:text-gray-400 transition-colors">
              + Gruppe hinzufügen
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5 shrink-0">
        <button onClick={() => { onDelete(net.id); onClose(); }}
          className="w-full py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm cursor-pointer hover:bg-red-500/15 transition-colors">
          ✕ Netzwerk löschen
        </button>
      </div>
    </div>
  );
}

// ─── SettingsModal ────────────────────────────────────────────────────────────
function SettingsModal({ onClose, data, onImport, fontScale, setFontScale }: {
  onClose: () => void; data: AppData;
  onImport: (d: AppData) => void;
  fontScale: number; setFontScale: (fn: (s: number) => number) => void;
}) {
  const [tab, setTab] = useState("data");
  const [importError, setImportError] = useState("");
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target!.result as string) as AppData;
        if (!parsed.persons || !parsed.networks) throw new Error("Ungültiges Format");
        onImport(parsed); setImportError(""); onClose();
      } catch (err) { setImportError("Fehler: " + (err as Error).message); }
    };
    reader.readAsText(file);
  };

  return (
    <div onClick={onClose} className="absolute inset-0 bg-black/60 z-[200] flex items-center justify-center">
      <div onClick={e => e.stopPropagation()}
        className="w-[min(420px,92%)] max-h-[80%] bg-[#13131c] border border-white/5 rounded-xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5 shrink-0">
          <span className="text-sm font-bold text-[#C8D8E8] tracking-widest">⚙ EINSTELLUNGEN</span>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-xl leading-none cursor-pointer bg-transparent border-none transition-colors">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 shrink-0">
          {["data", "info"].map(id => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 py-2.5 bg-transparent border-none cursor-pointer text-[11px] tracking-widest transition-colors ${tab === id ? "border-b-2 border-[#C8D8E8] text-[#C8D8E8]" : "border-b-2 border-transparent text-gray-600 hover:text-gray-400"}`}>
              {id === "data" ? "DATEN" : "INFO"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4" style={{ touchAction: "pan-y" }}>
          {tab === "data" && (
            <div className="flex flex-col gap-4">
              <button onClick={() => {
                const json = JSON.stringify(data, null, 2);
                const a = document.createElement("a");
                a.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(json));
                const d = new Date(); const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                a.setAttribute("download", `namensnetz-${stamp}.json`);
                document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100);
              }} className="w-full py-2.5 bg-[#C8D8E8]/5 border border-[#C8D8E8]/20 text-[#C8D8E8] rounded-lg cursor-pointer text-sm font-semibold hover:bg-[#C8D8E8]/10 transition-colors">
                📤 Daten exportieren (JSON)
              </button>

              <div className="border-t border-white/5" />

              {/* Font scale */}
              <div>
                <label className={fieldLabel}>🔤 Schriftgrösse</label>
                <div className="flex items-center gap-3 mt-1">
                  <button onClick={() => setFontScale(s => Math.max(0.5, +(s - 0.1).toFixed(1)))}
                    className="w-9 h-9 rounded-lg border border-white/8 bg-transparent text-gray-400 cursor-pointer text-xl font-black flex items-center justify-center hover:text-white hover:border-white/20 transition-colors">−</button>
                  <div className="flex-1 text-center">
                    <div className="text-xl font-bold text-[#C8D8E8]">{Math.round(fontScale * 100)}%</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Standard: 100%</div>
                  </div>
                  <button onClick={() => setFontScale(s => Math.min(2, +(s + 0.1).toFixed(1)))}
                    className="w-9 h-9 rounded-lg border border-white/8 bg-transparent text-gray-400 cursor-pointer text-xl font-black flex items-center justify-center hover:text-white hover:border-white/20 transition-colors">+</button>
                </div>
                <input type="range" min="50" max="200" step="10" value={Math.round(fontScale * 100)}
                  onChange={e => setFontScale(() => +(Number(e.target.value) / 100).toFixed(1) as unknown as number)}
                  className="w-full mt-2.5 accent-[#C8D8E8]" />
              </div>

              <div className="border-t border-white/5" />

              {/* Import */}
              <div>
                <label className="block w-full py-2.5 bg-red-500/5 border border-red-500/20 text-red-400 rounded-lg cursor-pointer text-sm font-semibold text-center hover:bg-red-500/10 transition-colors">
                  📥 JSON-Datei importieren
                  <input type="file" accept=".json,application/json" onChange={handleFileImport} className="hidden" />
                </label>
                <p className="text-[11px] text-gray-600 mt-1.5">Achtung: überschreibt alle aktuellen Daten.</p>
                {importError && <p className="text-[11px] text-red-400 mt-1.5">{importError}</p>}
              </div>
            </div>
          )}
          {tab === "info" && (
            <div className="flex flex-col gap-3.5 text-sm text-gray-500 leading-relaxed">
              <p className="text-[#e2e2e8] font-semibold text-base m-0">◉ Namensnetz</p>
              <p className="text-xs m-0">Netzwerk-Visualisierungswerkzeug. Daten werden automatisch im Baddi-Backend gespeichert und sind geräteübergreifend verfügbar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { boardId?: string; onBoardId?: (id: string) => void; reloadKey?: number; setHeaderExtra?: (content: React.ReactNode) => void; }

export default function NetzwerkWindow({ boardId: initialBoardId, onBoardId, reloadKey, setHeaderExtra }: Props) {
  const [data, setData] = useState<AppData>(defaultData);
  const [loading, setLoading] = useState(true);
  const history = useRef<AppData[]>([]);
  const [histLen, setHistLen] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: "" });
  const [showSettings, setShowSettings] = useState(false);
  const [activeNetId, setActiveNetId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ type: "person" | "hub"; id: string } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ type: string; id: string } | null>(null);
  const [selected, setSelected] = useState<{ type: string; id: string } | null>(null);
  const [panelPerson, setPanelPerson] = useState<Person | null>(null);
  const [panelHub, setPanelHub] = useState<NetworkNode | null>(null);
  const [mode, setMode] = useState("move");
  const [fontScale, setFontScale] = useState(1);
  const [input, setInput] = useState("");
  const [selGroup, setSelGroup] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const touches = useRef<Record<number, { x: number; y: number }>>({});
  const lastPinch = useRef<number | null>(null);
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const lastTap = useRef<{ id: string | null; time: number }>({ id: null, time: 0 });
  const clickStart = useRef<{ x: number; y: number } | null>(null);
  const clickedNode = useRef(false);
  const lastClickedNode = useRef<{ type: string; id: string } | null>(null);
  const boardIdRef = useRef<string | null>(initialBoardId ?? null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<AppData>(defaultData());
  const hasLoaded = useRef(false); // guard: don't flush empty defaultData before first load
  const MAX_HISTORY = 50;

  // ── Backend persistence ────────────────────────────────────────────────────
  const scheduleSave = useCallback((d: AppData) => {
    latestDataRef.current = d;
    const id = boardIdRef.current; if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        // Use latestDataRef.current (not closure) so a loadSingleton() that ran
        // between scheduleSave() and the timer firing always wins.
        await apiFetch(`${BACKEND_URL}/v1/windows/boards/${id}`, {
          method: "PUT",
          body: JSON.stringify({ data: latestDataRef.current }),
        });
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  // Reload when Baddi executed a network action
  useEffect(() => {
    if (reloadKey === undefined || reloadKey === 0) return;
    loadSingleton();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Flush on unload / unmount — only after real data has been loaded
  useEffect(() => {
    const flush = () => {
      if (!hasLoaded.current) return; // never flush default-empty state
      const id = boardIdRef.current;
      if (!id) return;
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      const token = getToken();
      if (!token) return;
      fetch(`${BACKEND_URL}/v1/windows/boards/${id}`, {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: latestDataRef.current }),
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  useEffect(() => {
    loadSingleton();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSingleton() {
    // Cancel any pending debounced save so it doesn't overwrite what we're about to load
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/windows/boards/singleton/netzwerk`);
      if (!res.ok) { setLoading(false); return; }
      const board = await res.json();
      boardIdRef.current = board.id;
      onBoardId?.(board.id);
      const d: AppData = board.data ?? defaultData();
      if (!d.persons) d.persons = [];
      if (!d.networks) d.networks = [];
      if (!d.connections) d.connections = [];
      latestDataRef.current = d; // keep flush-on-unmount in sync with freshly loaded data
      hasLoaded.current = true;
      setData(d);
      setActiveNetId(prev => {
        if (prev && d.networks.some(n => n.id === prev)) return prev;
        return d.networks.length > 0 ? d.networks[0].id : null;
      });
    } catch { /* show empty */ }
    setLoading(false);
  }

  // ── Update + Undo ──────────────────────────────────────────────────────────
  const update = (fn: (prev: AppData) => AppData) => {
    setData(prev => {
      history.current = [...history.current.slice(-MAX_HISTORY), prev];
      setHistLen(history.current.length);
      const next = fn(prev);
      scheduleSave(next);
      return next;
    });
  };
  const undo = () => {
    if (history.current.length === 0) return;
    const prev = history.current[history.current.length - 1];
    history.current = history.current.slice(0, -1);
    setHistLen(history.current.length);
    setData(prev);
    scheduleSave(prev);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const persons = data.persons || [];
  const nets = data.networks || [];
  const connections = data.connections || [];
  const activeNet = nets.find(n => n.id === activeNetId);
  const getPerson = (id: string) => persons.find(p => p.id === id);
  const getDisplayLabel = (person: Person) => {
    if (person.fullName && persons.filter(p => p.name === person.name).length > 1) return person.fullName;
    return person.name;
  };
  const getNet = (id: string) => nets.find(n => n.id === id);
  const getNetGroups = (netId: string) => { const n = nets.find(x => x.id === netId); return n?.groups?.length ? n.groups : makeDefaultGroups(); };
  const getGroupFrom = (groupId: string, netGroups: Group[]) => (netGroups || []).find(g => g.id === groupId) || { id: groupId, color: "#888", label: "Gruppe" };
  const getGroupColor = (groupId: string, netGroups: Group[]) => getGroupFrom(groupId, netGroups).color;
  const getGroupLabel = (groupId: string, netGroups: Group[]) => getGroupFrom(groupId, netGroups).label;
  const personColor = (personId: string) => {
    for (const net of nets) { const m = net.members?.find(m => m.personId === personId); if (m) return getGroupColor(m.group, net.groups); }
    return "#888";
  };

  // Toolbar into ArtifactShell header
  const setterRef = useRef(setHeaderExtra);
  useEffect(() => { setterRef.current = setHeaderExtra; });
  useEffect(() => {
    if (!setterRef.current) return;
    setterRef.current(
      <div className="flex items-center gap-1 w-full min-w-0">
        {/* Scrollable network tabs */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {nets.map(net => (
            <button key={net.id}
              onClick={() => { setActiveNetId(net.id); setMode("move"); setConnecting(null); }}
              className={`h-5 px-2 rounded text-[10px] border transition-colors truncate shrink-0 max-w-[80px] cursor-pointer ${activeNetId === net.id ? "bg-[#1a2a38] border-[#C8D8E8]/30 text-[#C8D8E8]" : "bg-transparent border-white/8 text-gray-500 hover:text-gray-300"}`}>
              {net.name}
            </button>
          ))}
        </div>
        {/* Static action buttons — always visible */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => createNetwork()} title="Netzwerk erstellen"
            className="h-5 px-2 rounded border border-dashed border-white/8 text-teal-400 hover:border-teal-500/40 text-sm font-bold cursor-pointer bg-transparent transition-colors">+</button>
          <div className="w-px h-3.5 bg-white/8 mx-0.5" />
          <button onClick={() => { setMode(m => m === "connect" ? "move" : "connect"); setConnecting(null); }}
            title="Verbinden-Modus"
            className={`h-5 px-2 rounded border text-[11px] cursor-pointer transition-colors ${mode === "connect" ? "bg-[#2a2a3a] border-white/20 text-white font-black" : "bg-transparent border-white/8 text-gray-500 hover:text-gray-300"}`}>
            —
          </button>
          <button onClick={autoLayout} title="Auto-Layout"
            className="h-5 px-2 rounded border border-white/8 bg-transparent text-gray-500 hover:text-gray-300 text-[11px] cursor-pointer transition-colors">✦</button>
          <button onClick={undo} title="Rückgängig (Ctrl+Z)" disabled={histLen === 0}
            className={`h-5 px-2 rounded border border-white/8 bg-transparent text-[11px] cursor-pointer transition-colors ${histLen > 0 ? "text-gray-500 hover:text-gray-300" : "text-gray-800 cursor-default"}`}>↩</button>
          <button onClick={() => setShowSettings(true)} title="Einstellungen"
            className="h-5 px-2 rounded border border-white/8 bg-transparent text-gray-500 hover:text-gray-300 text-[11px] cursor-pointer transition-colors">⚙</button>
        </div>
      </div>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nets, activeNetId, mode, histLen]);

  // Keep selGroup valid when activeNet changes
  useEffect(() => {
    if (!activeNet) return;
    const groups = activeNet.groups || [];
    if (!groups.find(g => g.id === selGroup)) setSelGroup(groups[0]?.id || null);
  }, [activeNetId, data]);

  // Sync panels when data changes
  useEffect(() => {
    if (!panelPerson) return;
    const p = persons.find(x => x.id === panelPerson.id);
    if (p) setPanelPerson(p); else setPanelPerson(null);
  }, [data]);
  useEffect(() => {
    if (!panelHub) return;
    const n = nets.find(x => x.id === panelHub.id);
    if (n) setPanelHub(n); else setPanelHub(null);
  }, [data]);

  const showToast = (msg: string) => { setToast({ visible: true, message: msg }); setTimeout(() => setToast(t => ({ ...t, visible: false })), 2000); };

  // ── Viewport ───────────────────────────────────────────────────────────────
  const screenToWorld = (cx: number, cy: number) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - viewport.x) / viewport.zoom, y: (cy - r.top - viewport.y) / viewport.zoom };
  };
  const applyZoom = (delta: number, fx: number, fy: number) => {
    setViewport(v => {
      const f = delta > 0 ? 1 / 1.15 : 1.15, nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * f));
      const r = containerRef.current?.getBoundingClientRect();
      const sx = fx - (r?.left ?? 0), sy = fy - (r?.top ?? 0);
      return { x: sx - (sx - v.x) * (nz / v.zoom), y: sy - (sy - v.y) * (nz / v.zoom), zoom: nz };
    });
  };
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); applyZoom(e.deltaY, e.clientX, e.clientY); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, []);

  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  const draggingRef = useRef(dragging);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  // Pointer events for pinch/pan
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const pointers: Record<number, { x: number; y: number }> = {};
    const getTwo = () => {
      const ids = Object.keys(pointers);
      if (ids.length < 2) return null;
      const a = pointers[Number(ids[0])], b = pointers[Number(ids[1])];
      return { a, b, dist: Math.hypot(b.x - a.x, b.y - a.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const onPointerDown = (e: PointerEvent) => {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pointers).length === 2) {
        const two = getTwo(); lastPinch.current = two!.dist; lastPinchMid.current = two!.mid;
        setDragging(null); isPanning.current = false; e.preventDefault();
      } else if (Object.keys(pointers).length === 1 && !draggingRef.current) {
        const v = viewportRef.current;
        panStart.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
        isPanning.current = true;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      const two = getTwo();
      if (two && lastPinch.current !== null) {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const sx = two.mid.x - r.left, sy = two.mid.y - r.top;
        const pm = lastPinchMid.current!;
        setViewport(v => {
          const rawRatio = two.dist / lastPinch.current!;
          const clampedRatio = Math.min(1.12, Math.max(0.88, rawRatio));
          const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * clampedRatio));
          return { x: sx - (sx - v.x) * (nz / v.zoom) + (two.mid.x - pm.x), y: sy - (sy - v.y) * (nz / v.zoom) + (two.mid.y - pm.y), zoom: nz };
        });
        lastPinch.current = two.dist; lastPinchMid.current = two.mid;
      } else if (Object.keys(pointers).length === 1) {
        if (draggingRef.current) moveDrag(e.clientX, e.clientY);
        else if (isPanning.current) setViewport(v => ({ ...v, x: panStart.current.vx + e.clientX - panStart.current.x, y: panStart.current.vy + e.clientY - panStart.current.y }));
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) { lastPinch.current = null; lastPinchMid.current = null; }
      if (Object.keys(pointers).length === 0) { setDragging(null); isPanning.current = false; }
      else if (Object.keys(pointers).length === 1) {
        const remaining = Object.values(pointers)[0];
        const v = viewportRef.current;
        panStart.current = { x: remaining.x, y: remaining.y, vx: v.x, vy: v.y };
        isPanning.current = true;
      }
    };
    el.addEventListener("pointerdown", onPointerDown, { passive: false });
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // ── Collision helpers ──────────────────────────────────────────────────────
  const allCircles = (d: AppData) => {
    const c: { x: number; y: number; r: number }[] = [];
    (d.networks || []).forEach(n => c.push({ x: n.x, y: n.y, r: HUB_R }));
    (d.persons || []).forEach(p => {
      const hasDup = (d.persons || []).filter(q => q.name === p.name).length > 1;
      const label = (hasDup && p.fullName) ? p.fullName : p.name;
      c.push({ x: p.x, y: p.y, r: personCollisionRadius(label, !!p.photo) });
    });
    return c;
  };
  const findFreePos = (cx: number, cy: number, r: number, occupied: { x: number; y: number; r: number }[], gap = 20) => {
    const step = 18; let rad = 0, ang = 0;
    for (let i = 0; i < 800; i++) {
      const x = cx + Math.cos(ang * Math.PI / 180) * rad, y = cy + Math.sin(ang * Math.PI / 180) * rad;
      if (occupied.every(o => Math.hypot(x - o.x, y - o.y) >= o.r + r + gap)) return { x, y };
      ang += step;
      if (ang >= 360) { ang -= 360; rad += (r * 2 + gap) / (360 / step); }
    }
    return { x: cx + randomBetween(-300, 300), y: cy + randomBetween(-300, 300) };
  };

  // ── Collision resolver ─────────────────────────────────────────────────────
  const resolveCollisions = (nodes: { id: string; x: number; y: number; r: number; pinned?: boolean }[], iterations = 80) => {
    const pos = nodes.map(n => ({ ...n }));
    const GAP = 22;
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i], b = pos[j];
          const minDist = a.r + b.r + GAP;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            if (!a.pinned) { a.x -= nx * push; a.y -= ny * push; }
            if (!b.pinned) { b.x += nx * push; b.y += ny * push; }
          }
        }
      }
    }
    const result: Record<string, { x: number; y: number }> = {};
    pos.forEach(n => { result[n.id] = { x: n.x, y: n.y }; });
    return result;
  };

  // ── Auto Layout ────────────────────────────────────────────────────────────
  const autoLayout = () => {
    const r = containerRef.current?.getBoundingClientRect() ?? { width: 900, height: 600 };
    const W = r.width, H = r.height;
    const margin = HUB_R + 20;
    const newNetPositions: Record<string, { x: number; y: number }> = {};
    const hubR = Math.min(W, H) * 0.28;
    const cx = W / 2, cy = H / 2;
    nets.forEach((net, i) => {
      const angle = (i / Math.max(nets.length, 1)) * 2 * Math.PI - Math.PI / 2;
      newNetPositions[net.id] = { x: cx + Math.cos(angle) * hubR, y: cy + Math.sin(angle) * hubR };
    });
    const personPos: Record<string, { x: number; y: number }> = {};
    const RING_DIST = HUB_R + 100;
    const hubPersons: Record<string, Person[]> = {};
    nets.forEach(n => { hubPersons[n.id] = []; });
    const freePersons: Person[] = [];
    persons.forEach(p => {
      const mem = nets.find(n => n.members?.some(m => m.personId === p.id));
      if (mem) hubPersons[mem.id].push(p); else freePersons.push(p);
    });
    nets.forEach(n => {
      const hub = newNetPositions[n.id];
      const pList = hubPersons[n.id];
      pList.forEach((p, i) => {
        const angle = (i / Math.max(pList.length, 1)) * 2 * Math.PI - Math.PI / 2;
        personPos[p.id] = { x: hub.x + Math.cos(angle) * RING_DIST, y: hub.y + Math.sin(angle) * RING_DIST };
      });
    });
    freePersons.forEach((p, i) => {
      const angle = (i / Math.max(freePersons.length, 1)) * 2 * Math.PI;
      personPos[p.id] = { x: cx + Math.cos(angle) * 160, y: cy + Math.sin(angle) * 160 };
    });
    persons.forEach(p => {
      if (!personPos[p.id]) return;
      personPos[p.id].x = Math.max(margin, Math.min(W - margin, personPos[p.id].x));
      personPos[p.id].y = Math.max(margin, Math.min(H - margin, personPos[p.id].y));
    });
    update(prev => ({
      ...prev,
      networks: prev.networks.map(n => {
        const pos = newNetPositions[n.id]; if (!pos) return n;
        return { ...n, x: (pos.x - viewport.x) / viewport.zoom, y: (pos.y - viewport.y) / viewport.zoom };
      }),
      persons: prev.persons.map(p => {
        const pos = personPos[p.id]; if (!pos) return p;
        return { ...p, x: (pos.x - viewport.x) / viewport.zoom, y: (pos.y - viewport.y) / viewport.zoom };
      }),
    }));
    showToast("Canvas geordnet");
  };

  const zoomBtn = (f: number) => {
    const r = containerRef.current?.getBoundingClientRect(); if (!r) return;
    setViewport(v => { const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * f)); const sx = r.width / 2, sy = r.height / 2; return { x: sx - (sx - v.x) * (nz / v.zoom), y: sy - (sy - v.y) * (nz / v.zoom), zoom: nz }; });
  };

  // ── Layout helpers ─────────────────────────────────────────────────────────
  const layoutNetworkMembers = (netId: string) => {
    const net = getNet(netId); if (!net || !net.members?.length) return;
    const memberPersons = net.members.map(m => getPerson(m.personId)).filter(Boolean) as Person[];
    if (memberPersons.length === 0) return;
    const radii = memberPersons.map(p => personCollisionRadius(p.fullName || p.name, !!p.photo));
    const maxR = Math.max(...radii);
    const GAP = 22;
    const rings: { radius: number; items: { p: Person; r: number }[] }[] = [];
    let remaining = memberPersons.map((p, i) => ({ p, r: radii[i] }));
    let ringRadius = HUB_R + GAP + maxR;
    while (remaining.length > 0) {
      const slotAngle = 2 * Math.asin(Math.min(1, (maxR + GAP / 2) / ringRadius));
      const capacity = Math.max(1, Math.floor(2 * Math.PI / slotAngle));
      const batch = remaining.splice(0, capacity);
      rings.push({ radius: ringRadius, items: batch });
      ringRadius += maxR * 2 + GAP;
    }
    const movingIds = new Set<string>();
    const nodes: { id: string; x: number; y: number; r: number; pinned?: boolean }[] = [];
    nodes.push({ id: net.id, x: net.x, y: net.y, r: HUB_R, pinned: true });
    rings.forEach(({ radius, items }) => {
      items.forEach(({ p, r }, i) => {
        const angle = (i / items.length) * 2 * Math.PI - Math.PI / 2;
        nodes.push({ id: p.id, x: net.x + Math.cos(angle) * radius, y: net.y + Math.sin(angle) * radius, r, pinned: false });
        movingIds.add(p.id);
      });
    });
    persons.forEach(p => { if (!movingIds.has(p.id)) nodes.push({ id: `obs_p_${p.id}`, x: p.x, y: p.y, r: personCollisionRadius(p.fullName || p.name, !!p.photo), pinned: true }); });
    nets.forEach(n => { if (n.id !== netId) nodes.push({ id: `obs_n_${n.id}`, x: n.x, y: n.y, r: HUB_R, pinned: true }); });
    const resolved = resolveCollisions(nodes);
    update(prev => ({ ...prev, persons: prev.persons.map(p => movingIds.has(p.id) && resolved[p.id] ? { ...p, x: resolved[p.id].x, y: resolved[p.id].y } : p) }));
  };

  const layoutPersonNetworks = (personId: string) => {
    const person = getPerson(personId); if (!person) return;
    const memberNets = nets.filter(n => n.members?.some(m => m.personId === personId));
    const connectedPersonIds = connections.filter(c => c.a === personId || c.b === personId).map(c => c.a === personId ? c.b : c.a);
    const connectedPersons = connectedPersonIds.map(id => getPerson(id)).filter(Boolean) as Person[];
    if (memberNets.length === 0 && connectedPersons.length === 0) return;
    const GAP = 22;
    const pR = personCollisionRadius(person.fullName || person.name, !!person.photo);
    const movingNetIds = new Set(memberNets.map(n => n.id));
    const movingPersonIds = new Set(connectedPersonIds);
    const allMovable = [
      ...memberNets.map(n => ({ id: n.id, r: HUB_R, type: "net" })),
      ...connectedPersons.map(p => ({ id: p.id, r: personCollisionRadius(p.fullName || p.name, !!p.photo), type: "person" })),
    ];
    if (allMovable.length === 0) return;
    const maxR = Math.max(...allMovable.map(n => n.r));
    const ringRadius = pR + GAP + maxR;
    const nodes: { id: string; x: number; y: number; r: number; pinned?: boolean }[] = [];
    nodes.push({ id: personId, x: person.x, y: person.y, r: pR, pinned: true });
    allMovable.forEach((item, i) => {
      const angle = (i / allMovable.length) * 2 * Math.PI - Math.PI / 2;
      nodes.push({ id: item.id, x: person.x + Math.cos(angle) * ringRadius, y: person.y + Math.sin(angle) * ringRadius, r: item.r, pinned: false });
    });
    nets.forEach(n => { if (!movingNetIds.has(n.id)) nodes.push({ id: `obs_n_${n.id}`, x: n.x, y: n.y, r: HUB_R, pinned: true }); });
    persons.forEach(p => { if (p.id !== personId && !movingPersonIds.has(p.id)) nodes.push({ id: `obs_p_${p.id}`, x: p.x, y: p.y, r: personCollisionRadius(p.fullName || p.name, !!p.photo), pinned: true }); });
    const resolved = resolveCollisions(nodes);
    update(prev => ({
      ...prev,
      networks: prev.networks.map(n => movingNetIds.has(n.id) && resolved[n.id] ? { ...n, x: resolved[n.id].x, y: resolved[n.id].y } : n),
      persons: prev.persons.map(p => movingPersonIds.has(p.id) && resolved[p.id] ? { ...p, x: resolved[p.id].x, y: resolved[p.id].y } : p),
    }));
  };

  // ── Network CRUD ───────────────────────────────────────────────────────────
  const createNetwork = (name?: string) => {
    const id = newId();
    const r = containerRef.current?.getBoundingClientRect() ?? { width: 600, height: 400 };
    const cx = (r.width / 2 - viewport.x) / viewport.zoom, cy = (r.height / 2 - viewport.y) / viewport.zoom;
    const { x, y } = findFreePos(cx, cy, HUB_R, allCircles(data), 40);
    const net: NetworkNode = { id, name: name || `Netzwerk ${nets.length + 1}`, members: [], groups: makeDefaultGroups(), x, y, createdAt: Date.now() };
    update(prev => ({ ...prev, networks: [...prev.networks, net] }));
    setActiveNetId(id); showToast(`"${net.name}" erstellt`);
  };
  const deleteNetwork = (id: string) => {
    update(prev => ({ ...prev, networks: prev.networks.filter(n => n.id !== id) }));
    if (activeNetId === id) { const rem = nets.filter(n => n.id !== id); setActiveNetId(rem.length > 0 ? rem[rem.length - 1].id : null); }
    showToast("Netzwerk gelöscht");
  };
  const renameNetwork = (id: string, name: string) => {
    if (!name.trim()) return;
    update(prev => ({ ...prev, networks: prev.networks.map(n => n.id === id ? { ...n, name: name.trim() } : n) }));
    showToast("Umbenannt");
  };
  const updateNetGroup = (netId: string, groupId: string, patch: Partial<Group>) => {
    update(prev => ({ ...prev, networks: prev.networks.map(n => n.id !== netId ? n : { ...n, groups: (n.groups || []).map(g => g.id === groupId ? { ...g, ...patch } : g) }) }));
  };
  const addNetGroup = (netId: string) => {
    const ng = getNet(netId)?.groups || [];
    const used = ng.map(g => g.color);
    const color = PALETTE.find(c => !used.includes(c)) || PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const g: Group = { id: newId(), color, label: `Gruppe ${ng.length + 1}` };
    update(prev => ({ ...prev, networks: prev.networks.map(n => n.id !== netId ? n : { ...n, groups: [...(n.groups || []), g] }) }));
  };
  const deleteNetGroup = (netId: string, groupId: string) => {
    const ng = getNet(netId)?.groups || [];
    if (ng.length <= 1) return;
    const fallback = ng.find(g => g.id !== groupId)?.id;
    update(prev => ({ ...prev, networks: prev.networks.map(n => { if (n.id !== netId) return n; return { ...n, groups: (n.groups || []).filter(g => g.id !== groupId), members: (n.members || []).map(m => m.group === groupId ? { ...m, group: fallback! } : m) }; }) }));
  };

  // ── Person CRUD ────────────────────────────────────────────────────────────
  const addName = () => {
    const trimmed = input.trim(); if (!trimmed) return;
    const parts = trimmed.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const targetNetId = activeNetId || null;
    const net = getNet(targetNetId || ""); if (!net) { showToast("Zuerst ein Netzwerk erstellen"); return; }
    const effectiveGroup = net.groups?.find(g => g.id === selGroup) ? selGroup : (net.groups?.[0]?.id || selGroup);
    const occ = allCircles(data);
    update(prev => {
      const newPersons = [...prev.persons];
      const newMembers: NetworkMember[] = [];
      parts.forEach(rawName => {
        const name = rawName.slice(0, 24);
        const { x, y } = findFreePos(net.x, net.y, NODE_R_MAX, occ, 16);
        occ.push({ x, y, r: NODE_R_MAX });
        const person: Person = { id: newId(), name, photo: null, x, y, note: "", fullName: "", createdAt: Date.now() };
        newPersons.push(person);
        newMembers.push({ personId: person.id, group: effectiveGroup! });
      });
      return { ...prev, persons: newPersons, networks: prev.networks.map(n => n.id === targetNetId ? { ...n, members: [...(n.members || []), ...newMembers] } : n) };
    });
    setInput(""); inputRef.current?.focus();
    if (parts.length > 1) showToast(`${parts.length} Namen hinzugefügt`);
  };
  const updatePersonFields = (personId: string, fields: Partial<Person>) => {
    update(prev => ({ ...prev, persons: prev.persons.map(p => p.id === personId ? { ...p, ...fields } : p) }));
  };
  const renamePerson = (personId: string, name: string) => {
    if (!name.trim()) return;
    update(prev => ({ ...prev, persons: prev.persons.map(p => p.id === personId ? { ...p, name: name.trim().slice(0, 24) } : p) }));
    showToast("Umbenannt");
  };
  const setPersonPhoto = (personId: string, photo: string | null) => {
    update(prev => ({ ...prev, persons: prev.persons.map(p => p.id === personId ? { ...p, photo } : p) }));
    showToast(photo ? "Foto gespeichert" : "Foto entfernt");
  };
  const changePersonGroup = (personId: string, netId: string, groupId: string) => {
    update(prev => ({ ...prev, networks: prev.networks.map(n => n.id !== netId ? n : { ...n, members: (n.members || []).map(m => m.personId === personId ? { ...m, group: groupId } : m) }) }));
  };
  const addPersonToNetwork = (personId: string, netId: string) => {
    const net = getNet(netId); if (!net || net.members?.some(m => m.personId === personId)) return;
    const effectiveGroup = net.groups?.[0]?.id || selGroup!;
    update(prev => ({ ...prev, networks: prev.networks.map(n => n.id !== netId ? n : { ...n, members: [...(n.members || []), { personId, group: effectiveGroup }] }) }));
    showToast("Hinzugefügt");
  };
  const createAndAddToNetwork = (personId: string) => {
    const id = newId();
    const r = containerRef.current?.getBoundingClientRect() ?? { width: 600, height: 400 };
    const cx = (r.width / 2 - viewport.x) / viewport.zoom, cy = (r.height / 2 - viewport.y) / viewport.zoom;
    const { x, y } = findFreePos(cx, cy, HUB_R, allCircles(data), 40);
    const groups = makeDefaultGroups();
    const net: NetworkNode = { id, name: `Netzwerk ${nets.length + 1}`, members: [{ personId, group: groups[0].id }], groups, x, y, createdAt: Date.now() };
    update(prev => ({ ...prev, networks: [...prev.networks, net] }));
    setActiveNetId(id); showToast(`"${net.name}" erstellt`);
  };
  const removePersonFromNetwork = (personId: string, netId: string) => {
    update(prev => ({ ...prev, networks: prev.networks.map(n => n.id !== netId ? n : { ...n, members: (n.members || []).filter(m => m.personId !== personId) }) }));
    showToast("Aus Netzwerk entfernt");
  };
  const deletePerson = (personId: string) => {
    update(prev => ({
      ...prev,
      persons: prev.persons.filter(p => p.id !== personId),
      networks: prev.networks.map(n => ({ ...n, members: (n.members || []).filter(m => m.personId !== personId) })),
      connections: (prev.connections || []).filter(c => c.a !== personId && c.b !== personId),
    }));
    showToast("Person gelöscht");
  };

  const updateConnectionLabel = (connId: string, label: string) => {
    update(prev => ({
      ...prev,
      connections: prev.connections.map(c => c.id === connId ? { ...c, label: label || undefined } : c),
    }));
  };

  // ── Connections ────────────────────────────────────────────────────────────
  const handleConnectTap = (personId: string) => {
    if (!connecting) { setConnecting(personId); return; }
    if (connecting === personId) { setConnecting(null); return; }
    const srcId = connecting;
    update(prev => {
      const exists = (prev.connections || []).find(c => (c.a === srcId && c.b === personId) || (c.a === personId && c.b === srcId));
      const conns = exists ? (prev.connections || []).filter(c => c !== exists) : [...(prev.connections || []), { id: newId(), a: srcId, b: personId }];
      return { ...prev, connections: conns };
    });
    showToast("Verbunden ✓"); setConnecting(null);
  };

  // ── Drag ───────────────────────────────────────────────────────────────────
  const startDragPerson = (cx: number, cy: number, personId: string) => {
    const p = getPerson(personId); if (!p) return;
    const wpt = screenToWorld(cx, cy);
    dragOffset.current = { x: wpt.x - p.x, y: wpt.y - p.y };
    setDragging({ type: "person", id: personId }); setSelected({ type: "person", id: personId });
  };
  const startDragHub = (cx: number, cy: number, netId: string) => {
    const n = getNet(netId); if (!n) return;
    const wpt = screenToWorld(cx, cy);
    dragOffset.current = { x: wpt.x - n.x, y: wpt.y - n.y };
    setDragging({ type: "hub", id: netId }); setSelected({ type: "hub", id: netId }); setActiveNetId(netId);
  };
  const moveDrag = (cx: number, cy: number) => {
    if (!dragging) return;
    const { x, y } = screenToWorld(cx, cy);
    const nx = x - dragOffset.current.x, ny = y - dragOffset.current.y;
    if (dragging.type === "person") {
      update(prev => ({ ...prev, persons: prev.persons.map(p => p.id === dragging.id ? { ...p, x: nx, y: ny } : p) }));
    } else {
      update(prev => ({ ...prev, networks: prev.networks.map(n => n.id !== dragging.id ? n : { ...n, x: nx, y: ny }) }));
    }
  };

  // ── Mouse ──────────────────────────────────────────────────────────────────
  const onPersonMouseDown = (e: React.MouseEvent, personId: string) => {
    e.stopPropagation(); clickStart.current = { x: e.clientX, y: e.clientY };
    if (mode === "connect") { handleConnectTap(personId); return; }
    startDragPerson(e.clientX, e.clientY, personId);
  };
  const onPersonClick = (e: React.MouseEvent, personId: string) => {
    e.stopPropagation(); if (mode !== "move") return;
    const dist = clickStart.current ? Math.hypot(e.clientX - clickStart.current.x, e.clientY - clickStart.current.y) : 0;
    if (dist < 6) {
      clickedNode.current = true;
      if (lastClickedNode.current?.type === "person" && lastClickedNode.current?.id === personId) {
        setPanelPerson(getPerson(personId) || null); setPanelHub(null); lastClickedNode.current = null;
      } else {
        setSelected({ type: "person", id: personId }); setPanelPerson(null); setPanelHub(null);
        layoutPersonNetworks(personId); lastClickedNode.current = { type: "person", id: personId };
      }
    }
  };
  const onHubMouseDown = (e: React.MouseEvent, netId: string) => {
    e.stopPropagation(); clickStart.current = { x: e.clientX, y: e.clientY };
    startDragHub(e.clientX, e.clientY, netId);
  };
  const onHubClick = (e: React.MouseEvent, netId: string) => {
    e.stopPropagation();
    const dist = clickStart.current ? Math.hypot(e.clientX - clickStart.current.x, e.clientY - clickStart.current.y) : 0;
    if (dist < 6) {
      clickedNode.current = true; setActiveNetId(netId); setMode("move"); setConnecting(null);
      if (lastClickedNode.current?.type === "hub" && lastClickedNode.current?.id === netId) {
        setSelected({ type: "hub", id: netId }); setPanelHub(getNet(netId) || null); setPanelPerson(null); lastClickedNode.current = null;
      } else {
        setSelected({ type: "hub", id: netId }); setPanelHub(null); setPanelPerson(null);
        layoutNetworkMembers(netId); lastClickedNode.current = { type: "hub", id: netId };
      }
    }
  };
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    clickStart.current = { x: e.clientX, y: e.clientY }; clickedNode.current = false;
    if (!dragging) { isPanning.current = true; panStart.current = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y }; }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging) moveDrag(e.clientX, e.clientY);
    else if (isPanning.current) setViewport(v => ({ ...v, x: panStart.current.vx + (e.clientX - panStart.current.x), y: panStart.current.vy + (e.clientY - panStart.current.y) }));
  };
  const onMouseUp = () => { setDragging(null); isPanning.current = false; };
  const onCanvasClick = (e: React.MouseEvent) => {
    if (clickedNode.current) { clickedNode.current = false; return; }
    const dist = clickStart.current ? Math.hypot(e.clientX - clickStart.current.x, e.clientY - clickStart.current.y) : 0;
    if (dist < 6) { setSelected(null); setPanelPerson(null); setPanelHub(null); setMode("move"); setConnecting(null); lastClickedNode.current = null; }
  };

  // ── Touch ──────────────────────────────────────────────────────────────────
  const onPersonTouchStart = (e: React.TouchEvent, personId: string) => {
    e.stopPropagation(); const t = e.touches[0], now = Date.now();
    if (lastTap.current.id === personId && now - lastTap.current.time < 300) {
      lastTap.current = { id: null, time: 0 }; setPanelPerson(getPerson(personId) || null); setPanelHub(null); layoutPersonNetworks(personId); return;
    }
    lastTap.current = { id: personId, time: now };
    if (mode === "connect") { handleConnectTap(personId); return; }
    startDragPerson(t.clientX, t.clientY, personId);
  };
  const onHubTouchStart = (e: React.TouchEvent, netId: string) => {
    e.stopPropagation(); const t = e.touches[0], now = Date.now();
    if (lastTap.current.id === netId && now - lastTap.current.time < 300) {
      lastTap.current = { id: null, time: 0 }; setPanelHub(getNet(netId) || null); setPanelPerson(null); layoutNetworkMembers(netId); return;
    }
    lastTap.current = { id: netId, time: now }; startDragHub(t.clientX, t.clientY, netId);
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Lade Namensnetz…
      </div>
    );
  }

  const canvasCursor = dragging ? "grabbing" : mode === "connect" ? (connecting ? "crosshair" : "cell") : "grab";

  return (
    <div className="h-full bg-[#0d0d14] text-[#e2e2e8] flex flex-col overflow-hidden touch-none">
      <Toast message={toast.message} visible={toast.visible} />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)} data={data}
          onImport={imported => { setData(imported); scheduleSave(imported); showToast("Daten importiert"); }}
          fontScale={fontScale} setFontScale={setFontScale}
        />
      )}

      {/* ── Input row ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-[#10101a] shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={e => {
            const val = e.target.value;
            const parts = val.split(/[,;\n]/);
            if (parts[parts.length - 1].length > 24) return;
            setInput(val);
          }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addName(); } }}
          placeholder={activeNet ? `Name → ${activeNet.name}` : "Zuerst Netzwerk erstellen"}
          className="flex-1 bg-[#16161f] border border-white/8 rounded-lg text-[#e2e2e8] px-3 py-1.5 text-sm outline-none focus:border-white/20 transition-colors"
        />
        {activeNet && (
          <div className="flex gap-1">
            {(activeNet.groups || []).map(g => (
              <button key={g.id} onClick={() => setSelGroup(g.id)} title={g.label}
                className="w-5 h-5 rounded-full cursor-pointer shrink-0 transition-transform hover:scale-110"
                style={{ background: g.color, border: selGroup === g.id ? "2px solid #fff" : "2px solid transparent" }} />
            ))}
          </div>
        )}
        <button onClick={addName}
          className="h-8 px-3.5 rounded-lg bg-[#C8D8E8] text-[#1a2a38] border-none cursor-pointer text-sm font-bold shrink-0 hover:opacity-90 transition-opacity">
          +
        </button>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden touch-none"
        style={{ cursor: canvasCursor }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onCanvasClick}
      >
        <svg width="100%" height="100%" className="block select-none touch-none">
          <defs>
            <pattern id="nm-grid" width="40" height="40" patternUnits="userSpaceOnUse"
              patternTransform={`translate(${viewport.x % (40 * viewport.zoom)},${viewport.y % (40 * viewport.zoom)}) scale(${viewport.zoom})`}>
              <circle cx="20" cy="20" r="1" fill="#1e1e2e" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#nm-grid)" />
          <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
            {/* Spokes (hub → person, rendered first / below connections) */}
            {nets.map(net => (net.members || []).map(m => {
              const p = getPerson(m.personId); if (!p) return null;
              const spokeColor = getGroupColor(m.group, net.groups);
              const selectedHubId = selected?.type === "hub" ? selected.id : null;
              const spokeOpacity = selectedHubId ? (net.id === selectedHubId ? 0.7 : 0.06) : 0.4;
              return <line key={`spoke-${net.id}-${m.personId}`} x1={net.x} y1={net.y} x2={p.x} y2={p.y} stroke={spokeColor} strokeWidth={3.5 / viewport.zoom} opacity={spokeOpacity} style={{ transition: "opacity 0.2s" }} />;
            }))}
            {/* Connections (person → person, curved + rendered above spokes) */}
            {connections.map(c => {
              const pa = getPerson(c.a), pb = getPerson(c.b);
              if (!pa || !pb) return null;
              const ca = personColor(c.a), cb = personColor(c.b);
              const selectedHubId = selected?.type === "hub" ? selected.id : null;
              const connOpacity = selectedHubId ? (nets.find(n => n.id === selectedHubId)?.members?.some(m => m.personId === c.a || m.personId === c.b) ? 0.9 : 0.25) : 0.9;
              // Curved bezier so the line is visible even when persons share x/y with a hub spoke
              const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
              const dx = pb.x - pa.x, dy = pb.y - pa.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const offset = Math.min(50, len * 0.35);
              const cpx = mx - (dy / len) * offset, cpy = my + (dx / len) * offset;
              const d = `M ${pa.x} ${pa.y} Q ${cpx} ${cpy} ${pb.x} ${pb.y}`;
              const strokeColor = ca === cb ? ca : "#a78bfa";
              return (
                <g key={c.id} style={{ transition: "opacity 0.2s" }} opacity={connOpacity}>
                  <path d={d} fill="none" stroke="#ffffff" strokeWidth={7 / viewport.zoom} opacity={0.12} strokeLinecap="round" />
                  <path d={d} fill="none" stroke={strokeColor} strokeWidth={3 / viewport.zoom} strokeDasharray={`${7 / viewport.zoom} ${4 / viewport.zoom}`} strokeLinecap="round" />
                </g>
              );
            })}
            {/* Hub nodes */}
            {nets.map(net => (
              <g key={`hub-${net.id}`} onClick={e => onHubClick(e, net.id)}>
                <HubNode net={net} memberCount={net.members?.length || 0}
                  isSelected={selected?.type === "hub" && selected?.id === net.id}
                  isHovered={hovered?.type === "hub" && hovered?.id === net.id}
                  onMouseDown={e => onHubMouseDown(e, net.id)} onTouchStart={e => onHubTouchStart(e, net.id)}
                  onMouseEnter={() => setHovered({ type: "hub", id: net.id })} onMouseLeave={() => setHovered(null)}
                  fontScale={fontScale} />
              </g>
            ))}
            {/* Person nodes */}
            {persons.map(person => {
              const personColors = nets.filter(n => n.members?.some(m => m.personId === person.id)).map(n => { const m = n.members.find(m => m.personId === person.id)!; return getGroupColor(m.group, n.groups); });
              const colors = personColors.length > 0 ? personColors : [personColor(person.id)];
              const selectedHubId = selected?.type === "hub" ? selected.id : null;
              const inSelectedNet = !selectedHubId || nets.find(n => n.id === selectedHubId)?.members?.some(m => m.personId === person.id);
              return (
                <g key={person.id} onClick={e => onPersonClick(e, person.id)}
                  style={{ opacity: selectedHubId ? (inSelectedNet ? 1 : 0.15) : 1, transition: "opacity 0.2s" }}>
                  <PersonNode person={person} colors={colors}
                    isSelected={selected?.type === "person" && selected?.id === person.id}
                    isHovered={hovered?.type === "person" && hovered?.id === person.id}
                    isConnectSrc={connecting === person.id}
                    mode={mode}
                    onMouseDown={e => onPersonMouseDown(e, person.id)}
                    onTouchStart={e => onPersonTouchStart(e, person.id)}
                    onMouseEnter={() => setHovered({ type: "person", id: person.id })}
                    onMouseLeave={() => setHovered(null)}
                    fontScale={fontScale}
                    displayLabel={getDisplayLabel(person)} />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Empty state */}
        {nets.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
            <span className="text-5xl opacity-10">◎</span>
            <p className="text-gray-700 text-sm tracking-widest">Oben ein Netzwerk erstellen mit +</p>
          </div>
        )}

        {/* Connect mode hint */}
        {mode === "connect" && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#1a1a28]/80 backdrop-blur-sm border border-white/8 rounded-xl px-4 py-2 text-xs text-gray-500 pointer-events-none whitespace-nowrap z-40">
            {connecting ? "Zweite Person antippen" : "Erste Person antippen"}
          </div>
        )}

        <ZoomControls zoom={viewport.zoom} onZoomIn={() => zoomBtn(1.25)} onZoomOut={() => zoomBtn(0.8)} />

        {panelPerson && (
          <PersonPanel key={panelPerson.id} person={panelPerson} networks={nets} connections={connections} allPersons={persons}
            onClose={() => setPanelPerson(null)} onPhotoChange={setPersonPhoto} onRename={renamePerson}
            onUpdateFields={updatePersonFields} onGroupChange={changePersonGroup}
            onAddToNetwork={addPersonToNetwork} onRemoveFromNetwork={removePersonFromNetwork}
            onCreateAndAddToNetwork={createAndAddToNetwork} onDeletePerson={deletePerson}
            onUpdateConnectionLabel={updateConnectionLabel}
            getGroupColor={getGroupColor} getGroupLabel={getGroupLabel} getNetGroups={getNetGroups} />
        )}
        {panelHub && (
          <HubPanel key={panelHub.id} net={panelHub} allPersons={persons}
            onClose={() => setPanelHub(null)} onRename={renameNetwork} onDelete={deleteNetwork}
            onUpdateGroup={updateNetGroup} onAddGroup={() => addNetGroup(panelHub.id)}
            onDeleteGroup={gid => deleteNetGroup(panelHub.id, gid)}
            getGroupColor={getGroupColor} getGroupLabel={getGroupLabel}
            onSelectPerson={person => { setPanelPerson(person); setPanelHub(null); }}
            onUpdateNote={(netId, note) => update(prev => ({ ...prev, networks: prev.networks.map(n => n.id === netId ? { ...n, note } : n) }))} />
        )}
      </div>
    </div>
  );
}
