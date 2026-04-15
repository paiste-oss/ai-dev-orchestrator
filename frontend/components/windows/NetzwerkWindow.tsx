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
}
interface Connection { id: string; a: string; b: string; }
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
    <div style={{ position: "absolute", bottom: "70px", left: "50%", transform: `translateX(-50%) translateY(${visible ? 0 : "12px"})`, opacity: visible ? 1 : 0, transition: "all 0.25s", background: "#22c55e22", border: "1px solid #22c55e55", color: "#22c55e", borderRadius: "8px", padding: "8px 20px", fontSize: "13px", pointerEvents: "none", zIndex: 200, whiteSpace: "nowrap" }}>
      ✓ {message}
    </div>
  );
}

// ─── ZoomControls ─────────────────────────────────────────────────────────────
function ZoomControls({ zoom, onZoomIn, onZoomOut }: { zoom: number; onZoomIn: () => void; onZoomOut: () => void }) {
  const S: React.CSSProperties = { width: "36px", height: "36px", background: "#1a1a28", border: "1px solid #2a2a3a", color: "#aaa", cursor: "pointer", fontSize: "18px", lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" };
  return (
    <div style={{ position: "absolute", bottom: "14px", right: "14px", display: "flex", flexDirection: "column", borderRadius: "10px", overflow: "hidden", border: "1px solid #2a2a3a", zIndex: 50, boxShadow: "0 4px 20px #00000066" }}>
      <button onClick={onZoomIn} style={S}>+</button>
      <div style={{ background: "#13131c", borderTop: "1px solid #2a2a3a", borderBottom: "1px solid #2a2a3a", color: "#555", fontSize: "11px", textAlign: "center", padding: "3px 0", userSelect: "none", fontFamily: "monospace" }}>{Math.round(zoom * 100)}%</div>
      <button onClick={onZoomOut} style={S}>−</button>
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
    <g transform={`translate(${net.x},${net.y})`} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ cursor: "grab" }}>
      {isSelected && <circle r={HUB_R + 16} fill="#C8D8E8" opacity="0.08" />}
      {isHovered && !isSelected && <circle r={HUB_R + 10} fill="#C8D8E8" opacity="0.05" />}
      <circle r={HUB_R} fill="#C8D8E8" opacity={isSelected ? 1 : 0.90} stroke={isSelected ? "#C8D8E8" : "#8AAABB"} strokeWidth={isSelected ? 3 : 1.5} />
      <circle r={HUB_R - 8} fill="none" stroke="#00000018" strokeWidth="1" />
      <text textAnchor="middle" fill="#1a2a38" fontSize={fontSize} fontFamily="'DM Mono',monospace" fontWeight="700" letterSpacing="0.02em">
        {lines.map((l, i) => <tspan key={i} x="0" dy={i === 0 ? -totalH / 2 : lineHeight}>{l}</tspan>)}
      </text>
      <g transform={`translate(${HUB_R - 10},${-(HUB_R - 10)})`}>
        <circle r="11" fill="#1a2a38" />
        <text textAnchor="middle" dominantBaseline="middle" fill="#C8D8E8" fontSize="10" fontFamily="'DM Mono',monospace" fontWeight="700">{memberCount}</text>
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
    <g transform={`translate(${person.x},${person.y})`} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ cursor: mode === "connect" ? "pointer" : "grab" }}>
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
          <text textAnchor="middle" fill={mainColor} fontSize={fontSize} fontFamily="'DM Mono',monospace" fontWeight="600" letterSpacing="0.02em">
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
            <text textAnchor="middle" fill={mainColor} fontSize={fontSize} fontFamily="'DM Mono',monospace" fontWeight="600">
              {lines.map((l, i) => <tspan key={i} x="0" dy={i === 0 ? R + GAP : lineHeight}>{l}</tspan>)}
            </text>
          </g>
        );
      })()}
    </g>
  );
}

// ─── PersonPanel ──────────────────────────────────────────────────────────────
function PersonPanel({ person, networks, connections, allPersons, onClose, onPhotoChange, onRename, onUpdateFields, onGroupChange, onAddToNetwork, onRemoveFromNetwork, onCreateAndAddToNetwork, onDeletePerson, getGroupColor, getGroupLabel, getNetGroups }: {
  person: Person; networks: NetworkNode[]; connections: Connection[]; allPersons: Person[];
  onClose: () => void; onPhotoChange: (id: string, photo: string | null) => void;
  onRename: (id: string, name: string) => void; onUpdateFields: (id: string, fields: Partial<Person>) => void;
  onGroupChange: (personId: string, netId: string, groupId: string) => void;
  onAddToNetwork: (personId: string, netId: string) => void;
  onRemoveFromNetwork: (personId: string, netId: string) => void;
  onCreateAndAddToNetwork: (personId: string) => void;
  onDeletePerson: (id: string) => void;
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
  const inputSty: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0d0d14", border: `1px solid ${color}22`, borderRadius: "6px", color: "#e2e2e8", padding: "7px 10px", fontSize: "13px", outline: "none", fontFamily: "inherit" };

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(280px, 92%)", background: "#13131c", borderLeft: `2px solid ${color}44`, zIndex: 60, display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px #00000088" }}
      onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onMouseMove={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: "12px", color, letterSpacing: "0.08em" }}>PERSON</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "18px", lineHeight: "1" }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", touchAction: "pan-y" }} onWheel={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
        <div style={{ padding: "16px 16px 10px" }}>
          {person.photo && (
            <div style={{ width: "90px", height: "90px", borderRadius: "50%", margin: "0 auto", overflow: "hidden", border: `2px solid ${color}`, marginBottom: "6px" }}>
              <img src={person.photo} alt={person.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-block", padding: "6px 12px", background: "#1a1a28", border: `1px solid ${color}44`, borderRadius: "6px", color, fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}>
              📷 {person.photo ? "Foto ändern" : "Foto hochladen"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const f = e.target.files?.[0]; if (f) { onPhotoChange(person.id, await resizeImage(f)); } e.target.value = ""; }} />
            </label>
            {person.photo && <button onClick={() => onPhotoChange(person.id, null)} style={{ padding: "6px 12px", background: "none", border: "1px solid #ff444433", color: "#ff4444", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>✕ Entfernen</button>}
          </div>
        </div>
        <div style={{ margin: "0 16px 12px", borderTop: "1px solid #1e1e2e" }} />
        <div style={{ padding: "0 16px 12px" }}>
          <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>👤 NAME</label>
          <div style={{ display: "flex", gap: "6px", marginTop: "5px" }}>
            <input value={editName} maxLength={9} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onRename(person.id, editName); }} style={{ flex: 1, background: "#0d0d14", border: `1px solid ${color}44`, borderRadius: "6px", color: "#e2e2e8", padding: "7px 10px", fontSize: "14px", outline: "none", fontFamily: "inherit", fontWeight: "600" }} />
            <button onClick={() => onRename(person.id, editName)} style={{ background: color, color: "#000", border: "none", borderRadius: "6px", padding: "7px 10px", fontWeight: "700", cursor: "pointer", fontSize: "13px" }}>✓</button>
          </div>
        </div>
        <div style={{ padding: "0 16px 12px" }}>
          <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>✦ GANZER NAME</label>
          <input type="text" value={fields.fullName} onChange={e => setFields(f => ({ ...f, fullName: e.target.value }))} onBlur={e => saveField("fullName", e.target.value)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder="Vor- und Nachname…" style={{ ...inputSty, marginTop: "5px" }} />
        </div>
        {memberNets.map(net => {
          const m = net.members?.find(m => m.personId === person.id);
          if (!m) return null;
          const ng = getNetGroups(net.id);
          const gc = getGroupColor(m.group, ng);
          const gl = getGroupLabel(m.group, ng);
          return (
            <div key={net.id} style={{ padding: "0 16px 12px" }}>
              <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.08em" }}>● GRUPPE in <span style={{ color: "#C8D8E8" }}>{net.name}</span></label>
              <div style={{ display: "flex", gap: "7px", marginTop: "7px", flexWrap: "wrap" }}>
                {ng.map(g => <button key={g.id} onClick={() => onGroupChange(person.id, net.id, g.id)} title={g.label} style={{ width: "24px", height: "24px", borderRadius: "50%", background: g.color, cursor: "pointer", border: m.group === g.id ? "3px solid #fff" : "3px solid transparent", transform: m.group === g.id ? "scale(1.18)" : "scale(1)", transition: "transform 0.1s" }} />)}
              </div>
              <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: gc, flexShrink: 0 }} />
                <span style={{ fontSize: "11px", color: gc }}>{gl}</span>
              </div>
            </div>
          );
        })}
        <div style={{ margin: "0 16px 12px", borderTop: "1px solid #1e1e2e" }} />
        <div style={{ padding: "0 16px 10px" }}>
          <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>📝 NOTIZ</label>
          <textarea value={fields.note} rows={3} onChange={e => setFields(f => ({ ...f, note: e.target.value }))} onBlur={e => saveField("note", e.target.value)} style={{ ...inputSty, marginTop: "5px", resize: "vertical", lineHeight: "1.5" }} />
        </div>
        <div style={{ margin: "0 16px 12px", borderTop: "1px solid #1e1e2e" }} />
        <div style={{ padding: "0 16px 8px" }}>
          <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>◉ NETZWERKE</label>
          {memberNets.map(net => (
            <div key={net.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "7px" }}>
              <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: "#C8D8E8", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: "12px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{net.name}</span>
              <button onClick={() => onRemoveFromNetwork(person.id, net.id)} style={{ background: "none", border: "1px solid #ff444433", color: "#ff4444", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "10px", fontFamily: "inherit", flexShrink: 0 }}>entfernen</button>
            </div>
          ))}
          <div style={{ marginTop: "10px" }}>
            <label style={{ fontSize: "10px", color: "#333", letterSpacing: "0.08em" }}>Hinzufügen zu:</label>
            {nonMemberNets.map(net => (
              <button key={net.id} onClick={() => onAddToNetwork(person.id, net.id)} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", marginTop: "5px", background: "#1a1a28", border: "1px solid #2a2a3a", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", color: "#888" }}>
                <span style={{ fontSize: "14px" }}>+</span>
                <span style={{ fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{net.name}</span>
              </button>
            ))}
            <button onClick={() => onCreateAndAddToNetwork(person.id)} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", marginTop: "5px", background: "#1a1a28", border: "1px dashed #4ECDC455", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontFamily: "inherit", color: "#4ECDC4" }}>
              <span style={{ fontSize: "14px" }}>✦</span>
              <span style={{ fontSize: "12px" }}>Neues Netzwerk</span>
            </button>
          </div>
        </div>
        <div style={{ height: "8px" }} />
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1e1e2e", flexShrink: 0 }}>
        <button onClick={() => { onDeletePerson(person.id); onClose(); }} style={{ width: "100%", padding: "9px", background: "#ff444411", border: "1px solid #ff444433", color: "#ff4444", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontSize: "13px" }}>✕ Person überall löschen</button>
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
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(280px, 92%)", background: "#13131c", borderLeft: "2px solid #C8D8E833", zIndex: 60, display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px #00000088" }}
      onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onMouseMove={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "#C8D8E8", flexShrink: 0 }} />
          <span style={{ fontSize: "12px", color: "#ccc", letterSpacing: "0.08em" }}>NETZWERK</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "18px", lineHeight: "1" }}>×</button>
      </div>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e2e", flexShrink: 0 }}>
        <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>NAME</label>
        <div style={{ display: "flex", gap: "6px", marginTop: "5px" }}>
          <input value={editName} maxLength={editName.includes(" ") ? 23 : 15} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onRename(net.id, editName); }} style={{ flex: 1, background: "#0d0d14", border: "1px solid #C8D8E822", borderRadius: "6px", color: "#e2e2e8", padding: "7px 10px", fontSize: "14px", outline: "none", fontFamily: "inherit" }} />
          <button onClick={() => onRename(net.id, editName)} style={{ background: "#C8D8E8", color: "#1a2a38", border: "none", borderRadius: "6px", padding: "7px 10px", fontWeight: "700", cursor: "pointer", fontSize: "13px" }}>✓</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", touchAction: "pan-y" }} onWheel={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e2e" }}>
          <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>📝 NOTIZ</label>
          <textarea value={note} rows={4} onChange={e => setNote(e.target.value)} onBlur={e => onUpdateNote(net.id, e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginTop: "5px", background: "#0d0d14", border: "1px solid #C8D8E822", borderRadius: "6px", color: "#e2e2e8", padding: "7px 10px", fontSize: "13px", outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: "1.5" }} />
        </div>
        <div style={{ borderBottom: "1px solid #1e1e2e" }}>
          <div style={{ padding: "10px 16px 4px" }}>
            <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>👤 PERSONEN ({members.length})</label>
          </div>
          {members.length === 0 && <div style={{ padding: "8px 16px 12px", color: "#333", fontSize: "12px" }}>Noch keine Personen</div>}
          {members.map(m => {
            const person = allPersons.find(p => p.id === m.personId);
            if (!person) return null;
            const color = getGroupColor(m.group, net.groups);
            const label = getGroupLabel(m.group, net.groups);
            return (
              <button key={m.personId} onClick={() => onSelectPerson(person)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0, overflow: "hidden", border: `2px solid ${color}`, background: "#0d0d14", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {person.photo ? <img src={person.photo} alt={person.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "13px", color, fontWeight: "700" }}>{person.name.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", color: "#e2e2e8", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{allPersons.filter(p => p.name === person.name).length > 1 && person.fullName ? person.fullName : person.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: "10px", color: "#555" }}>{label}</span>
                  </div>
                </div>
                <span style={{ color: "#333", fontSize: "14px", flexShrink: 0 }}>›</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: "10px 0 4px" }}>
          <div style={{ padding: "0 16px 6px" }}>
            <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em" }}>🎨 GRUPPEN</label>
          </div>
          {groups.map(g => (
            <div key={g.id} style={{ padding: "6px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button onClick={() => setColorPickFor(colorPickFor === g.id ? null : g.id)} style={{ width: "26px", height: "26px", borderRadius: "50%", background: g.color, border: "2px solid #2a2a3a", cursor: "pointer", flexShrink: 0, outline: "none" }} />
                <input value={g.label} onChange={e => onUpdateGroup(net.id, g.id, { label: e.target.value })} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ flex: 1, background: "#0d0d14", border: `1px solid ${g.color}44`, borderRadius: "6px", color: "#e2e2e8", padding: "5px 9px", fontSize: "13px", outline: "none", fontFamily: "inherit" }} />
                {groups.length > 1 && <button onClick={() => { onDeleteGroup(g.id); if (colorPickFor === g.id) setColorPickFor(null); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "16px", lineHeight: "1", padding: "0 2px", flexShrink: 0 }}>×</button>}
              </div>
              {colorPickFor === g.id && (
                <div style={{ marginTop: "8px", marginLeft: "34px", display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {PALETTE.map(col => <button key={col} onClick={() => { onUpdateGroup(net.id, g.id, { color: col }); setColorPickFor(null); }} style={{ width: "20px", height: "20px", borderRadius: "50%", background: col, border: col === g.color ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", outline: "none" }} />)}
                </div>
              )}
            </div>
          ))}
          <div style={{ padding: "6px 16px 4px" }}>
            <button onClick={onAddGroup} style={{ width: "100%", padding: "7px", background: "#1a1a28", border: "1px dashed #2a2a3a", borderRadius: "6px", color: "#555", cursor: "pointer", fontFamily: "inherit", fontSize: "12px" }}>+ Gruppe hinzufügen</button>
          </div>
        </div>
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1e1e2e", flexShrink: 0 }}>
        <button onClick={() => { onDelete(net.id); onClose(); }} style={{ width: "100%", padding: "9px", background: "#ff444411", border: "1px solid #ff444433", color: "#ff4444", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontSize: "13px" }}>✕ Netzwerk löschen</button>
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
  const Tab = ({ id, label }: { id: string; label: string }) => (
    <button onClick={() => setTab(id)} style={{ flex: 1, padding: "9px 0", background: "none", border: "none", borderBottom: tab === id ? "2px solid #C8D8E8" : "2px solid transparent", color: tab === id ? "#C8D8E8" : "#555", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", letterSpacing: "0.08em" }}>{label}</button>
  );
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "#000000aa", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(420px,92%)", maxHeight: "80%", background: "#13131c", border: "1px solid #C8D8E822", borderRadius: "12px", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px #00000088", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#C8D8E8", letterSpacing: "0.1em" }}>⚙ EINSTELLUNGEN</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "20px", lineHeight: "1" }}>×</button>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e2e", flexShrink: 0 }}>
          <Tab id="data" label="DATEN" /><Tab id="info" label="INFO" />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px", touchAction: "pan-y" }}>
          {tab === "data" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <button onClick={() => {
                const json = JSON.stringify(data, null, 2);
                const a = document.createElement("a");
                a.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(json));
                const d = new Date(); const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                a.setAttribute("download", `namensnetz-${stamp}.json`);
                document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100);
              }} style={{ width: "100%", padding: "10px", background: "#C8D8E811", border: "1px solid #C8D8E833", color: "#C8D8E8", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: "600" }}>
                📤 Daten exportieren (JSON)
              </button>
              <div style={{ borderTop: "1px solid #1e1e2e" }} />
              <div>
                <label style={{ fontSize: "10px", color: "#444", letterSpacing: "0.1em", display: "block", marginBottom: "8px" }}>🔤 SCHRIFTGRÖSSE</label>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
                  <button onClick={() => setFontScale(s => Math.max(0.5, +(s - 0.1).toFixed(1)))} style={{ width: "36px", height: "36px", borderRadius: "8px", border: "1px solid #2a2a3a", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: "20px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: "22px", fontWeight: "700", color: "#C8D8E8" }}>{Math.round(fontScale * 100)}%</div>
                    <div style={{ fontSize: "10px", color: "#444", marginTop: "2px" }}>Standard: 100%</div>
                  </div>
                  <button onClick={() => setFontScale(s => Math.min(2, +(s + 0.1).toFixed(1)))} style={{ width: "36px", height: "36px", borderRadius: "8px", border: "1px solid #2a2a3a", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: "20px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
                <input type="range" min="50" max="200" step="10" value={Math.round(fontScale * 100)} onChange={e => setFontScale(() => +(Number(e.target.value) / 100).toFixed(1) as unknown as number)} style={{ width: "100%", marginTop: "10px", accentColor: "#C8D8E8" } as React.CSSProperties} />
              </div>
              <div style={{ borderTop: "1px solid #1e1e2e" }} />
              <div>
                <label style={{ display: "block", width: "100%", padding: "10px", background: "#ff444411", border: "1px solid #ff444433", color: "#ff8888", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: "600", textAlign: "center", boxSizing: "border-box" }}>
                  📥 JSON-Datei importieren
                  <input type="file" accept=".json,application/json" onChange={handleFileImport} style={{ display: "none" }} />
                </label>
                <p style={{ fontSize: "11px", color: "#555", margin: "6px 0 0" }}>Achtung: überschreibt alle aktuellen Daten.</p>
                {importError && <p style={{ color: "#ff6666", fontSize: "11px", margin: "6px 0 0" }}>{importError}</p>}
              </div>
            </div>
          )}
          {tab === "info" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", color: "#888", fontSize: "13px", lineHeight: "1.8" }}>
              <p style={{ margin: 0, color: "#e2e2e8", fontWeight: "600", fontSize: "15px" }}>◉ Namensnetz</p>
              <p style={{ margin: 0, fontSize: "12px" }}>Netzwerk-Visualisierungswerkzeug. Daten werden automatisch im Baddi-Backend gespeichert und sind geräteübergreifend verfügbar.</p>
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
  const MAX_HISTORY = 50;

  // ── Backend persistence ────────────────────────────────────────────────────
  const scheduleSave = useCallback((d: AppData) => {
    latestDataRef.current = d;
    const id = boardIdRef.current; if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch(`${BACKEND_URL}/v1/windows/boards/${id}`, {
          method: "PUT",
          body: JSON.stringify({ data: d }),
        });
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  // Reload wenn Baddi eine Netzwerk-Aktion ausgeführt hat (reloadKey ändert sich)
  useEffect(() => {
    if (reloadKey === undefined || reloadKey === 0) return;
    loadSingleton();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Sofort speichern bei Seitenentladen oder Fenster-Unmount
  useEffect(() => {
    const flush = () => {
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
      flush(); // auch beim Unmount (Fenster schließen) speichern
    };
  }, []);

  useEffect(() => {
    // Immer über Singleton-Endpoint laden — verhindert Datenverlust durch Netzwerkfehler
    // und stellt sicher dass immer dasselbe Board geöffnet wird (kein doppeltes Board möglich).
    loadSingleton();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSingleton() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/windows/boards/singleton/netzwerk`);
      if (!res.ok) {
        // Backend-Fehler → leeres Board zeigen, KEIN neues Board erstellen
        setLoading(false);
        return;
      }
      const board = await res.json();
      boardIdRef.current = board.id;
      onBoardId?.(board.id);
      const d: AppData = board.data ?? defaultData();
      if (!d.persons) d.persons = [];
      if (!d.networks) d.networks = [];
      if (!d.connections) d.connections = [];
      setData(d);
      // Aktives Netzwerk nur setzen wenn noch keines gewählt oder das gewählte nicht mehr existiert
      setActiveNetId(prev => {
        if (prev && d.networks.some(n => n.id === prev)) return prev;
        return d.networks.length > 0 ? d.networks[0].id : null;
      });
    } catch {
      // Netzwerkfehler → leeres Board zeigen, KEIN neues Board erstellen
    }
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

  // Toolbar in CanvasCard-Header pushen (nach nets-Definition)
  const setterRef = useRef(setHeaderExtra);
  useEffect(() => { setterRef.current = setHeaderExtra; });
  useEffect(() => {
    if (!setterRef.current) return;
    const S: React.CSSProperties = { height: "20px", padding: "0 7px", borderRadius: "4px", border: "1px solid #2a2a3a", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", color: "#aaa", display: "flex", alignItems: "center" };
    const SActive: React.CSSProperties = { ...S, background: "#1a2a38", border: "1px solid #C8D8E844", color: "#C8D8E8" };
    const SDim: React.CSSProperties = { ...S, color: "#333", cursor: "default" };
    setterRef.current(
      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
        {nets.map(net => (
          <button key={net.id}
            onClick={() => { setActiveNetId(net.id); setMode("move"); setConnecting(null); }}
            style={activeNetId === net.id ? SActive : S} title={net.name}>
            <span style={{ maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px" }}>{net.name}</span>
          </button>
        ))}
        <button onClick={() => createNetwork()} title="Netzwerk erstellen"
          style={{ ...S, color: "#4ECDC4", border: "1px dashed #2a2a3a", padding: "0 6px", fontSize: "14px", fontWeight: "bold" }}>+</button>
        <div style={{ width: "1px", height: "14px", background: "#2a2a3a", margin: "0 2px" }} />
        <button onClick={() => { setMode(m => m === "connect" ? "move" : "connect"); setConnecting(null); }}
          title="Verbinden-Modus" style={mode === "connect" ? { ...S, background: "#2a2a3a", color: "#fff", fontWeight: "900" } : S}>—</button>
        <button onClick={autoLayout} title="Auto-Layout" style={S}>✦</button>
        <button onClick={undo} title="Rückgängig (Ctrl+Z)" disabled={histLen === 0} style={histLen > 0 ? S : SDim}>↩</button>
        <button onClick={() => setShowSettings(true)} title="Einstellungen" style={S}>⚙</button>
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
        const person: Person = { id: newId(), name, photo: null, x, y, note: "", fullName: "" };
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

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#555", fontSize: "13px", fontFamily: "monospace" }}>Lade Namensnetz…</div>;

  return (
    <div style={{ height: "100%", background: "#0d0d14", fontFamily: "'DM Mono','Courier New',monospace", color: "#e2e2e8", display: "flex", flexDirection: "column", overflow: "hidden", touchAction: "none" }}>
      <Toast message={toast.message} visible={toast.visible} />
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)} data={data}
          onImport={imported => { setData(imported); scheduleSave(imported); showToast("Daten importiert"); }}
          fontScale={fontScale} setFontScale={setFontScale}
        />
      )}

      {/* ── Input row ── */}
      <div style={{ padding: "6px 12px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", gap: "8px", background: "#10101a", flexShrink: 0 }}>
        <input ref={inputRef} value={input}
          onChange={e => {
            const val = e.target.value;
            const parts = val.split(/[,;\n]/);
            if (parts[parts.length - 1].length > 9) return;
            setInput(val);
          }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addName(); } }}
          placeholder={activeNet ? `Name → ${activeNet.name}` : "Zuerst Netzwerk erstellen"}
          style={{ flex: 1, background: "#16161f", border: "1px solid #2a2a3a", borderRadius: "8px", color: "#e2e2e8", padding: "7px 12px", fontSize: "13px", outline: "none", fontFamily: "inherit" }} />
        {activeNet && (
          <div style={{ display: "flex", gap: "4px" }}>
            {(activeNet.groups || []).map(g => (
              <button key={g.id} onClick={() => setSelGroup(g.id)} title={g.label}
                style={{ width: "20px", height: "20px", borderRadius: "50%", background: g.color, border: selGroup === g.id ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", flexShrink: 0 }} />
            ))}
          </div>
        )}
        <button onClick={addName} style={{ height: "32px", padding: "0 14px", borderRadius: "8px", background: "#C8D8E8", color: "#1a2a38", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: "700", flexShrink: 0 }}>+</button>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden", touchAction: "none", cursor: dragging ? "grabbing" : isPanning.current ? "grabbing" : mode === "connect" ? (connecting ? "crosshair" : "cell") : "grab" }}
        onMouseDown={onCanvasMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={onCanvasClick}>
        <svg width="100%" height="100%" style={{ display: "block", userSelect: "none", touchAction: "none" }}>
          <defs>
            <pattern id="nm-grid" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform={`translate(${viewport.x % (40 * viewport.zoom)},${viewport.y % (40 * viewport.zoom)}) scale(${viewport.zoom})`}>
              <circle cx="20" cy="20" r="1" fill="#1e1e2e" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#nm-grid)" />
          <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
            {/* Connections */}
            {connections.map(c => {
              const pa = getPerson(c.a), pb = getPerson(c.b);
              if (!pa || !pb) return null;
              const ca = personColor(c.a), cb = personColor(c.b);
              const sameColor = ca === cb;
              const selectedHubId = selected?.type === "hub" ? selected.id : null;
              const connOpacity = selectedHubId ? (nets.find(n => n.id === selectedHubId)?.members?.some(m => m.personId === c.a || m.personId === c.b) ? 0.4 : 0.06) : 0.4;
              return <line key={c.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={sameColor ? ca : "#666"} strokeWidth={3.5 / viewport.zoom} strokeDasharray={!sameColor ? `${6 / viewport.zoom} ${4 / viewport.zoom}` : undefined} opacity={connOpacity} style={{ transition: "opacity 0.2s" }} />;
            })}
            {/* Spokes */}
            {nets.map(net => (net.members || []).map(m => {
              const p = getPerson(m.personId); if (!p) return null;
              const spokeColor = getGroupColor(m.group, net.groups);
              const selectedHubId = selected?.type === "hub" ? selected.id : null;
              const spokeOpacity = selectedHubId ? (net.id === selectedHubId ? 0.7 : 0.06) : 0.4;
              return <line key={`spoke-${net.id}-${m.personId}`} x1={net.x} y1={net.y} x2={p.x} y2={p.y} stroke={spokeColor} strokeWidth={3.5 / viewport.zoom} opacity={spokeOpacity} style={{ transition: "opacity 0.2s" }} />;
            }))}
            {/* Hub nodes */}
            {nets.map(net => (
              <g key={`hub-${net.id}`} onClick={e => onHubClick(e, net.id)}>
                <HubNode net={net} memberCount={net.members?.length || 0} isSelected={selected?.type === "hub" && selected?.id === net.id} isHovered={hovered?.type === "hub" && hovered?.id === net.id} onMouseDown={e => onHubMouseDown(e, net.id)} onTouchStart={e => onHubTouchStart(e, net.id)} onMouseEnter={() => setHovered({ type: "hub", id: net.id })} onMouseLeave={() => setHovered(null)} fontScale={fontScale} />
              </g>
            ))}
            {/* Person nodes */}
            {persons.map(person => {
              const personColors = nets.filter(n => n.members?.some(m => m.personId === person.id)).map(n => { const m = n.members.find(m => m.personId === person.id)!; return getGroupColor(m.group, n.groups); });
              const colors = personColors.length > 0 ? personColors : [personColor(person.id)];
              const selectedHubId = selected?.type === "hub" ? selected.id : null;
              const inSelectedNet = !selectedHubId || nets.find(n => n.id === selectedHubId)?.members?.some(m => m.personId === person.id);
              return (
                <g key={person.id} onClick={e => onPersonClick(e, person.id)} style={{ opacity: selectedHubId ? (inSelectedNet ? 1 : 0.15) : 1, transition: "opacity 0.2s" }}>
                  <PersonNode person={person} colors={colors} isSelected={selected?.type === "person" && selected?.id === person.id} isHovered={hovered?.type === "person" && hovered?.id === person.id} isConnectSrc={connecting === person.id} mode={mode} onMouseDown={e => onPersonMouseDown(e, person.id)} onTouchStart={e => onPersonTouchStart(e, person.id)} onMouseEnter={() => setHovered({ type: "person", id: person.id })} onMouseLeave={() => setHovered(null)} fontScale={fontScale} displayLabel={getDisplayLabel(person)} />
                </g>
              );
            })}
          </g>
        </svg>

        {nets.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", gap: "12px" }}>
            <div style={{ fontSize: "48px", opacity: 0.1 }}>◎</div>
            <p style={{ color: "#333", fontSize: "13px", letterSpacing: "0.1em" }}>Oben ein Netzwerk erstellen mit +</p>
          </div>
        )}
        {mode === "connect" && (
          <div style={{ position: "absolute", bottom: "60px", left: "50%", transform: "translateX(-50%)", background: "#1a1a28cc", backdropFilter: "blur(8px)", border: "1px solid #2a2a3a", borderRadius: "10px", padding: "8px 18px", fontSize: "12px", color: "#888", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 40 }}>
            {connecting ? "Zweite Person antippen" : "Erste Person antippen"}
          </div>
        )}
        <ZoomControls zoom={viewport.zoom} onZoomIn={() => zoomBtn(1.25)} onZoomOut={() => zoomBtn(0.8)} />
        {panelPerson && (
          <PersonPanel key={panelPerson.id} person={panelPerson} networks={nets} connections={connections} allPersons={persons} onClose={() => setPanelPerson(null)} onPhotoChange={setPersonPhoto} onRename={renamePerson} onUpdateFields={updatePersonFields} onGroupChange={changePersonGroup} onAddToNetwork={addPersonToNetwork} onRemoveFromNetwork={removePersonFromNetwork} onCreateAndAddToNetwork={createAndAddToNetwork} onDeletePerson={deletePerson} getGroupColor={getGroupColor} getGroupLabel={getGroupLabel} getNetGroups={getNetGroups} />
        )}
        {panelHub && (
          <HubPanel key={panelHub.id} net={panelHub} allPersons={persons} onClose={() => setPanelHub(null)} onRename={renameNetwork} onDelete={deleteNetwork} onUpdateGroup={updateNetGroup} onAddGroup={() => addNetGroup(panelHub.id)} onDeleteGroup={gid => deleteNetGroup(panelHub.id, gid)} getGroupColor={getGroupColor} getGroupLabel={getGroupLabel} onSelectPerson={person => { setPanelPerson(person); setPanelHub(null); }} onUpdateNote={(netId, note) => update(prev => ({ ...prev, networks: prev.networks.map(n => n.id === netId ? { ...n, note } : n) }))} />
        )}
      </div>
    </div>
  );
}
