"use client";

import { useState, useEffect, useMemo } from "react";

type Category = "Aktionen" | "Navigation" | "Status" | "Dateien" | "Literatur" | "Benutzer" | "System" | "Kommunikation" | "Finanzen";

interface IconVariant {
  label: string;
  svg: string; // full <svg> string
}

interface IconDef {
  id: string;
  label: string;
  category: Category;
  tags: string[];
  variants: IconVariant[];
}

const SZ = 24;

function svg(paths: string, extra?: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SZ}" height="${SZ}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra ?? ""}>${paths}</svg>`;
}
function svgFill(paths: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SZ}" height="${SZ}" viewBox="0 0 24 24" fill="currentColor" stroke="none">${paths}</svg>`;
}

const ICONS: IconDef[] = [
  // ── Aktionen ────────────────────────────────────────────────────────────────
  {
    id: "add", label: "Hinzufügen", category: "Aktionen", tags: ["plus", "neu", "create"],
    variants: [
      { label: "Kreis Plus", svg: svg(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>`) },
      { label: "Einfaches Plus", svg: svg(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`) },
      { label: "Quadrat Plus", svg: svg(`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>`) },
      { label: "Plus Badge", svg: svg(`<path d="M12 5v14M5 12h14" stroke-width="2.5"/>`) },
    ],
  },
  {
    id: "delete", label: "Löschen", category: "Aktionen", tags: ["trash", "remove", "müll"],
    variants: [
      { label: "Papierkorb", svg: svg(`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>`) },
      { label: "Papierkorb gefüllt", svg: svgFill(`<path d="M3 6h18l-1.5 14.5a2 2 0 01-2 1.5H6.5a2 2 0 01-2-1.5L3 6zm6-2h6V3H9v1zM2 6h20v1H2z"/>`) },
      { label: "X-Kreis", svg: svg(`<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`) },
      { label: "X", svg: svg(`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`) },
    ],
  },
  {
    id: "edit", label: "Bearbeiten", category: "Aktionen", tags: ["stift", "ändern", "pencil"],
    variants: [
      { label: "Stift", svg: svg(`<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>`) },
      { label: "Stift 2", svg: svg(`<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>`) },
      { label: "Stift Quadrat", svg: svg(`<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`) },
      { label: "Stift minimal", svg: svg(`<path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke-width="1.5"/>`) },
    ],
  },
  {
    id: "save", label: "Speichern", category: "Aktionen", tags: ["floppy", "disk", "sichern"],
    variants: [
      { label: "Diskette", svg: svg(`<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>`) },
      { label: "Wolke Hoch", svg: svg(`<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>`) },
      { label: "Prüfzeichen", svg: svg(`<polyline points="20 6 9 17 4 12"/>`) },
      { label: "Prüfkreis", svg: svg(`<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`) },
    ],
  },
  {
    id: "search", label: "Suchen", category: "Aktionen", tags: ["lupe", "find", "magnify"],
    variants: [
      { label: "Lupe", svg: svg(`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`) },
      { label: "Lupe Plus", svg: svg(`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>`) },
      { label: "Lupe Bold", svg: svg(`<circle cx="10" cy="10" r="7" stroke-width="2.5"/><path d="M21 21l-4.35-4.35" stroke-width="2.5"/>`) },
      { label: "Lupe Rahmen", svg: svg(`<rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="11" cy="11" r="5"/><line x1="19" y1="19" x2="15.5" y2="15.5"/>`) },
    ],
  },
  {
    id: "filter", label: "Filter", category: "Aktionen", tags: ["trichter", "sort", "funnel"],
    variants: [
      { label: "Trichter", svg: svg(`<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`) },
      { label: "Schieberegler", svg: svg(`<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>`) },
      { label: "Trichter Pfeil", svg: svg(`<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>`) },
      { label: "Liste Filter", svg: svg(`<line x1="3" y1="5" x2="21" y2="5"/><line x1="6" y1="10" x2="18" y2="10"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="11" y1="20" x2="13" y2="20"/>`) },
    ],
  },
  {
    id: "download", label: "Herunterladen", category: "Aktionen", tags: ["download", "export", "pfeil unten"],
    variants: [
      { label: "Pfeil Unten Box", svg: svg(`<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`) },
      { label: "Wolke Runter", svg: svg(`<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>`) },
      { label: "Pfeil Runter", svg: svg(`<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>`) },
      { label: "Disk Runter", svg: svg(`<path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 002-2v-4M17 9l-5 5-5-5M12 12.8V2.5"/>`) },
    ],
  },
  {
    id: "upload", label: "Hochladen", category: "Aktionen", tags: ["upload", "import", "pfeil oben"],
    variants: [
      { label: "Pfeil Oben Box", svg: svg(`<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`) },
      { label: "Wolke Hoch", svg: svg(`<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>`) },
      { label: "Pfeil Oben", svg: svg(`<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>`) },
      { label: "Tray Hoch", svg: svg(`<polyline points="8 8 12 4 16 8"/><line x1="12" y1="4" x2="12" y2="14"/><path d="M20 14v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5"/>`) },
    ],
  },
  {
    id: "copy", label: "Kopieren", category: "Aktionen", tags: ["clipboard", "duplicate"],
    variants: [
      { label: "Kopieren", svg: svg(`<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>`) },
      { label: "Clipboard", svg: svg(`<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>`) },
      { label: "Clipboard Check", svg: svg(`<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/>`) },
      { label: "Kopieren Bold", svg: svg(`<rect x="8" y="8" width="14" height="14" rx="2" stroke-width="2.5"/><path d="M4 16H3a2 2 0 01-2-2V3a2 2 0 012-2h11a2 2 0 012 2v1" stroke-width="2.5"/>`) },
    ],
  },
  {
    id: "share", label: "Teilen", category: "Aktionen", tags: ["share", "export", "link"],
    variants: [
      { label: "Teilen Knoten", svg: svg(`<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>`) },
      { label: "Pfeil Box", svg: svg(`<path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>`) },
      { label: "Link", svg: svg(`<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>`) },
      { label: "Extern", svg: svg(`<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`) },
    ],
  },
  // ── Navigation ──────────────────────────────────────────────────────────────
  {
    id: "home", label: "Startseite", category: "Navigation", tags: ["haus", "home", "start"],
    variants: [
      { label: "Haus", svg: svg(`<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`) },
      { label: "Haus gefüllt", svg: svgFill(`<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>`) },
      { label: "Haus Modern", svg: svg(`<path d="M2 12L12 3l10 9"/><path d="M4 10.5V20a1 1 0 001 1h4v-5h6v5h4a1 1 0 001-1v-9.5"/>`) },
      { label: "Haus Strich", svg: svg(`<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>`) },
    ],
  },
  {
    id: "chevron_right", label: "Pfeil Rechts", category: "Navigation", tags: ["chevron", "pfeil", "weiter"],
    variants: [
      { label: "Chevron Rechts", svg: svg(`<polyline points="9 18 15 12 9 6"/>`) },
      { label: "Pfeil Rechts", svg: svg(`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`) },
      { label: "Kreis Pfeil", svg: svg(`<circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/>`) },
      { label: "Doppel Chevron", svg: svg(`<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>`) },
    ],
  },
  {
    id: "menu", label: "Menü", category: "Navigation", tags: ["hamburger", "sidebar", "burger"],
    variants: [
      { label: "Hamburger", svg: svg(`<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>`) },
      { label: "Menü dots", svg: svg(`<circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>`) },
      { label: "Hamburger Links", svg: svg(`<line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>`) },
      { label: "Grid", svg: svg(`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>`) },
    ],
  },
  {
    id: "close", label: "Schließen", category: "Navigation", tags: ["x", "close", "schließen"],
    variants: [
      { label: "X", svg: svg(`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`) },
      { label: "X Kreis", svg: svg(`<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`) },
      { label: "X Bold", svg: svg(`<path d="M18 6L6 18M6 6l12 12" stroke-width="2.5"/>`) },
      { label: "X Quadrat", svg: svg(`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`) },
    ],
  },
  {
    id: "back", label: "Zurück", category: "Navigation", tags: ["back", "zurück", "previous"],
    variants: [
      { label: "Pfeil Links", svg: svg(`<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`) },
      { label: "Chevron Links", svg: svg(`<polyline points="15 18 9 12 15 6"/>`) },
      { label: "Kreis Zurück", svg: svg(`<circle cx="12" cy="12" r="10"/><polyline points="12 8 8 12 12 16"/><line x1="16" y1="12" x2="8" y2="12"/>`) },
      { label: "Undo", svg: svg(`<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>`) },
    ],
  },
  // ── Status ──────────────────────────────────────────────────────────────────
  {
    id: "check", label: "Erledigt", category: "Status", tags: ["check", "done", "ok", "success"],
    variants: [
      { label: "Prüfzeichen", svg: svg(`<polyline points="20 6 9 17 4 12"/>`) },
      { label: "Kreis Check", svg: svg(`<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`) },
      { label: "Doppel Check", svg: svg(`<path d="M4 12l5 5 11-11"/><path d="M1 12l5 5"/>`) },
      { label: "Kreis Check gefüllt", svg: svgFill(`<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4.5-4.5 1.41-1.41L10 13.67l7.59-7.59L19 7.5l-9 9z"/>`) },
    ],
  },
  {
    id: "warning", label: "Warnung", category: "Status", tags: ["warning", "alert", "achtung"],
    variants: [
      { label: "Dreieck Warn", svg: svg(`<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`) },
      { label: "Kreis Warn", svg: svg(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`) },
      { label: "Dreieck gefüllt", svg: svgFill(`<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>`) },
      { label: "Ausrufer", svg: svg(`<line x1="12" y1="2" x2="12" y2="14"/><line x1="12" y1="18" x2="12.01" y2="18" stroke-width="3"/>`) },
    ],
  },
  {
    id: "info", label: "Info", category: "Status", tags: ["information", "i", "hint"],
    variants: [
      { label: "Info Kreis", svg: svg(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`) },
      { label: "Info gefüllt", svg: svgFill(`<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>`) },
      { label: "Info Quadrat", svg: svg(`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`) },
      { label: "i schlicht", svg: svg(`<line x1="12" y1="10" x2="12" y2="18"/><line x1="12" y1="6" x2="12.01" y2="6" stroke-width="3"/>`) },
    ],
  },
  {
    id: "loading", label: "Laden", category: "Status", tags: ["spinner", "loading", "wait"],
    variants: [
      { label: "Spinner", svg: svg(`<path d="M21 12a9 9 0 11-6.219-8.56" stroke-width="2.5"/>`) },
      { label: "Loader Punkte", svg: svg(`<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>`) },
      { label: "Refresh", svg: svg(`<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>`) },
      { label: "Uhr", svg: svg(`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`) },
    ],
  },
  {
    id: "star", label: "Favorit", category: "Status", tags: ["stern", "star", "favorite", "favorit"],
    variants: [
      { label: "Stern Kontur", svg: svg(`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`) },
      { label: "Stern gefüllt", svg: svgFill(`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`) },
      { label: "Herz", svg: svg(`<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>`) },
      { label: "Herz gefüllt", svg: svgFill(`<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`) },
    ],
  },
  {
    id: "bookmark", label: "Lesezeichen", category: "Status", tags: ["bookmark", "merken", "lesen"],
    variants: [
      { label: "Lesezeichen Kontur", svg: svg(`<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>`) },
      { label: "Lesezeichen gefüllt", svg: svgFill(`<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>`) },
      { label: "Lesezeichen Plus", svg: svg(`<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/>`) },
      { label: "Tag", svg: svg(`<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7" stroke-width="3"/>`) },
    ],
  },
  // ── Dateien ─────────────────────────────────────────────────────────────────
  {
    id: "file", label: "Datei", category: "Dateien", tags: ["file", "dokument", "document"],
    variants: [
      { label: "Seite", svg: svg(`<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>`) },
      { label: "Seite Text", svg: svg(`<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`) },
      { label: "Seite gefüllt", svg: svgFill(`<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>`) },
      { label: "Seite Stern", svg: svg(`<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/><path d="M9.5 14.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z"/>`) },
    ],
  },
  {
    id: "folder", label: "Ordner", category: "Dateien", tags: ["folder", "ordner", "directory"],
    variants: [
      { label: "Ordner Kontur", svg: svg(`<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>`) },
      { label: "Ordner gefüllt", svg: svgFill(`<path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>`) },
      { label: "Ordner Offen", svg: svg(`<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><polyline points="16 13 12 17 8 13"/><line x1="12" y1="17" x2="12" y2="9"/>`) },
      { label: "Ordner Plus", svg: svg(`<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>`) },
    ],
  },
  {
    id: "pdf", label: "PDF", category: "Dateien", tags: ["pdf", "dokument", "acrobat"],
    variants: [
      { label: "PDF Badge", svg: svg(`<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/><text x="6" y="19" font-size="5" font-weight="bold" fill="currentColor" stroke="none">PDF</text>`) },
      { label: "Seite Download", svg: svg(`<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 16 12 19 15 16"/>`) },
      { label: "Seite Lupe", svg: svg(`<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/><circle cx="10" cy="15" r="3"/><line x1="19" y1="20" x2="16.5" y2="17.5"/>`) },
      { label: "Buch Offen", svg: svg(`<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>`) },
    ],
  },
  {
    id: "image", label: "Bild", category: "Dateien", tags: ["image", "foto", "picture", "bild"],
    variants: [
      { label: "Bild Rahmen", svg: svg(`<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`) },
      { label: "Kamera", svg: svg(`<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>`) },
      { label: "Galerie", svg: svg(`<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>`) },
      { label: "Bild Landscape", svg: svg(`<path d="M3 15l5-5 4 4 4-4 5 5"/><rect x="2" y="3" width="20" height="18" rx="2"/>`) },
    ],
  },
  // ── Literatur ───────────────────────────────────────────────────────────────
  {
    id: "book", label: "Buch", category: "Literatur", tags: ["buch", "book", "library", "bibliothek"],
    variants: [
      { label: "Buch Geschlossen", svg: svg(`<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>`) },
      { label: "Buch Offen", svg: svg(`<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>`) },
      { label: "Bücherstapel", svg: svg(`<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="12" y1="6" x2="18" y2="6"/><line x1="12" y1="10" x2="18" y2="10"/>`) },
      { label: "Buch gefüllt", svg: svgFill(`<path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>`) },
    ],
  },
  {
    id: "graduation", label: "Abschluss", category: "Literatur", tags: ["graduation", "akademisch", "bildung"],
    variants: [
      { label: "Doktorhut", svg: svg(`<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>`) },
      { label: "Diplom", svg: svg(`<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>`) },
      { label: "Atom", svg: svg(`<circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>`) },
      { label: "Lampe", svg: svg(`<line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>`) },
    ],
  },
  {
    id: "tag_label", label: "Schlagwort", category: "Literatur", tags: ["tag", "label", "schlagwort", "keyword"],
    variants: [
      { label: "Tag", svg: svg(`<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7" stroke-width="3"/>`) },
      { label: "Tags", svg: svg(`<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7" stroke-width="3"/><path d="M22 13.41l-5.17 5.17"/>`) },
      { label: "Hash", svg: svg(`<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>`) },
      { label: "Badge", svg: svg(`<path d="M12 2L9.09 6.26 4 7.27l3.5 3.41-.83 4.83L12 13.17l5.33 2.34-.83-4.83L20 7.27l-5.09-1.01z"/>`) },
    ],
  },
  {
    id: "quote", label: "Zitat", category: "Literatur", tags: ["quote", "zitat", "citation", "anführungszeichen"],
    variants: [
      { label: "Anführungszeichen", svg: svg(`<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>`) },
      { label: "Sprechblase", svg: svg(`<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>`) },
      { label: "Sprechblase Text", svg: svg(`<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/>`) },
      { label: "Nachricht", svg: svg(`<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>`) },
    ],
  },
  // ── Benutzer ────────────────────────────────────────────────────────────────
  {
    id: "user", label: "Benutzer", category: "Benutzer", tags: ["user", "person", "profil", "account"],
    variants: [
      { label: "Person", svg: svg(`<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>`) },
      { label: "Person Kreis", svg: svg(`<path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>`) },
      { label: "Person Bold", svg: svg(`<circle cx="12" cy="8" r="5" stroke-width="2.5"/><path d="M2 21a9 9 0 0118 0" stroke-width="2.5"/>`) },
      { label: "Person gefüllt", svg: svgFill(`<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>`) },
    ],
  },
  {
    id: "settings_user", label: "Einstellungen", category: "Benutzer", tags: ["settings", "einstellungen", "gear", "config"],
    variants: [
      { label: "Zahnrad", svg: svg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>`) },
      { label: "Schieberegler", svg: svg(`<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/>`) },
      { label: "Schraubschlüssel", svg: svg(`<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>`) },
      { label: "Equalizer", svg: svg(`<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>`) },
    ],
  },
  {
    id: "notification", label: "Benachrichtigung", category: "Benutzer", tags: ["bell", "notification", "glocke", "alarm"],
    variants: [
      { label: "Glocke", svg: svg(`<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>`) },
      { label: "Glocke gefüllt", svg: svgFill(`<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>`) },
      { label: "Glocke Plus", svg: svg(`<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="18" y1="3" x2="18" y2="6"/><line x1="15.5" y1="1.5" x2="20.5" y2="1.5"/>`) },
      { label: "Glocke Slash", svg: svg(`<path d="M13.73 21a2 2 0 01-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0118 8"/><path d="M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 00-9.33-4.97"/><line x1="1" y1="1" x2="23" y2="23"/>`) },
    ],
  },
  // ── System ──────────────────────────────────────────────────────────────────
  {
    id: "server", label: "Server", category: "System", tags: ["server", "database", "db"],
    variants: [
      { label: "Datenbank", svg: svg(`<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>`) },
      { label: "Server", svg: svg(`<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6" stroke-width="3"/><line x1="6" y1="18" x2="6.01" y2="18" stroke-width="3"/>`) },
      { label: "CPU", svg: svg(`<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>`) },
      { label: "Cloud", svg: svg(`<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>`) },
    ],
  },
  {
    id: "key", label: "Schlüssel", category: "System", tags: ["key", "schlüssel", "password", "auth"],
    variants: [
      { label: "Schlüssel", svg: svg(`<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>`) },
      { label: "Schloss", svg: svg(`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>`) },
      { label: "Schloss Offen", svg: svg(`<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/>`) },
      { label: "Fingerabdruck", svg: svg(`<path d="M2 13.5V10a10 10 0 0120 0v3.5"/><path d="M6 13.5V10a6 6 0 0112 0v3.5"/><path d="M10 13.5V10a2 2 0 014 0v3.5"/>`) },
    ],
  },
  {
    id: "ai", label: "KI / Baddi", category: "System", tags: ["ai", "ki", "robot", "bot", "baddi"],
    variants: [
      { label: "Bot", svg: svg(`<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16" stroke-width="2"/><line x1="16" y1="16" x2="16" y2="16" stroke-width="2"/>`) },
      { label: "Gehirn", svg: svg(`<path d="M9.5 2A2.5 2.5 0 017 4.5v0A2.5 2.5 0 014.5 7v0A2.5 2.5 0 012 9.5v0A2.5 2.5 0 014.5 12v0A2.5 2.5 0 017 14.5v0A2.5 2.5 0 019.5 17h5a2.5 2.5 0 002.5-2.5v0a2.5 2.5 0 002.5-2.5v0a2.5 2.5 0 002.5-2.5v0a2.5 2.5 0 00-2.5-2.5v0A2.5 2.5 0 0017 4.5v0A2.5 2.5 0 0014.5 2z"/><path d="M12 2v15"/>`) },
      { label: "Blitz", svg: svg(`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`) },
      { label: "Funkeln", svg: svg(`<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75z"/>`) },
    ],
  },
  {
    id: "activity", label: "Aktivität", category: "System", tags: ["activity", "chart", "pulse", "monitor"],
    variants: [
      { label: "Puls", svg: svg(`<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`) },
      { label: "Balken Chart", svg: svg(`<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`) },
      { label: "Linien Chart", svg: svg(`<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="20" cy="12" r="1" fill="currentColor" stroke="none"/>`) },
      { label: "Kuchen Chart", svg: svg(`<path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>`) },
    ],
  },
  // ── Kommunikation ────────────────────────────────────────────────────────────
  {
    id: "chat", label: "Chat", category: "Kommunikation", tags: ["chat", "nachricht", "message", "bubble"],
    variants: [
      { label: "Sprechblase", svg: svg(`<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>`) },
      { label: "Sprechblase Rund", svg: svg(`<path d="M12 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2 22l5-1.338A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>`) },
      { label: "Zwei Blasen", svg: svg(`<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>`) },
      { label: "Blase Dots", svg: svg(`<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/>`) },
    ],
  },
  {
    id: "email", label: "E-Mail", category: "Kommunikation", tags: ["email", "mail", "envelope", "brief"],
    variants: [
      { label: "Umschlag", svg: svg(`<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>`) },
      { label: "Umschlag Offen", svg: svg(`<path d="M22 13V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12c0 1.1.9 2 2 2h9"/><path d="M22 6l-10 7L2 6"/><path d="M19 16v6M22 19h-6"/>`) },
      { label: "Senden", svg: svg(`<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>`) },
      { label: "Inbox", svg: svg(`<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>`) },
    ],
  },
  {
    id: "phone", label: "Telefon", category: "Kommunikation", tags: ["phone", "telefon", "call", "anruf"],
    variants: [
      { label: "Hörer", svg: svg(`<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.72 4.18 2 2 0 012.72 2H5.5a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 9.5a16 16 0 006.59 6.59l1.36-.86a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>`) },
      { label: "Handy", svg: svg(`<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18" stroke-width="3"/>`) },
      { label: "Video", svg: svg(`<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>`) },
      { label: "Mikrofon", svg: svg(`<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`) },
    ],
  },
  // ── Finanzen ────────────────────────────────────────────────────────────────
  {
    id: "billing", label: "Abrechnung", category: "Finanzen", tags: ["billing", "invoice", "rechnung", "zahlung"],
    variants: [
      { label: "Kreditkarte", svg: svg(`<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>`) },
      { label: "Münze", svg: svg(`<circle cx="12" cy="12" r="10"/><path d="M12 8v8M9.5 10h5a2 2 0 010 4H9.5"/>`) },
      { label: "Banknote", svg: svg(`<rect x="1" y="5" width="22" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M4 8h.01M20 8h.01M4 16h.01M20 16h.01"/>`) },
      { label: "Portemonnaie", svg: svg(`<path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/><path d="M14 12a2 2 0 104 0 2 2 0 00-4 0z" fill="currentColor" stroke="none"/>`) },
    ],
  },
];

const CATEGORIES: Category[] = ["Aktionen", "Navigation", "Status", "Dateien", "Literatur", "Benutzer", "System", "Kommunikation", "Finanzen"];
const PREFS_KEY = "baddi:iconPrefs";

type Prefs = Record<string, number>;

interface VariantPickerProps {
  icon: IconDef;
  currentVariant: number;
  onSelect: (idx: number) => void;
  onClose: () => void;
}

function VariantPicker({ icon, currentVariant, onSelect, onClose }: VariantPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-lg">{icon.label}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {icon.variants.map((v, idx) => (
            <button
              key={idx}
              onClick={() => { onSelect(idx); onClose(); }}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                currentVariant === idx
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white"
              }`}
            >
              <span
                className="w-8 h-8 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: v.svg }}
              />
              <span className="text-xs text-center leading-tight">{v.label}</span>
              {currentVariant === idx && (
                <span className="text-xs text-blue-400 font-medium">Aktiv</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconCard({ icon, prefs, onCardClick }: { icon: IconDef; prefs: Prefs; onCardClick: (icon: IconDef) => void }) {
  const variantIdx = prefs[icon.id] ?? 0;
  const variant = icon.variants[variantIdx];
  return (
    <button
      onClick={() => onCardClick(icon)}
      className="flex flex-col items-center gap-2 p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 hover:border-zinc-500 hover:bg-zinc-800 transition-all text-zinc-300 hover:text-white group"
      title={`${icon.label} — Klicken zum Ändern`}
    >
      <span
        className="w-7 h-7 flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: variant.svg }}
      />
      <span className="text-xs text-center leading-tight text-zinc-400 group-hover:text-zinc-200 truncate w-full text-center">{icon.label}</span>
      {(prefs[icon.id] ?? 0) !== 0 && (
        <span className="text-[10px] text-blue-400">Angepasst</span>
      )}
    </button>
  );
}

export default function IconsPage() {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [activeCategory, setActiveCategory] = useState<Category | "Alle">("Alle");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IconDef | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs(JSON.parse(raw) as Prefs);
    } catch { /* ignore */ }
  }, []);

  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };

  const handleSelect = (iconId: string, variantIdx: number) => {
    const next = { ...prefs };
    if (variantIdx === 0) {
      delete next[iconId];
    } else {
      next[iconId] = variantIdx;
    }
    savePrefs(next);
  };

  const handleReset = () => {
    savePrefs({});
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ICONS.filter((icon) => {
      const catMatch = activeCategory === "Alle" || icon.category === activeCategory;
      const searchMatch = !q || icon.label.toLowerCase().includes(q) || icon.tags.some((t) => t.includes(q));
      return catMatch && searchMatch;
    });
  }, [activeCategory, search]);

  const customizedCount = Object.keys(prefs).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">SVG Icons</h1>
          <p className="text-sm text-zinc-400 mt-1">Alle Icons in Baddi — klicke auf ein Icon um die Variante zu wechseln.</p>
          {customizedCount > 0 && (
            <p className="text-xs text-blue-400 mt-1">{customizedCount} Icon{customizedCount !== 1 ? "s" : ""} angepasst</p>
          )}
        </div>
        {customizedCount > 0 && (
          <button
            onClick={handleReset}
            className="text-sm text-zinc-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded border border-zinc-700 hover:border-red-500/50"
          >
            Alle zurücksetzen
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Icons suchen…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {(["Alle", ...CATEGORIES] as (Category | "Alle")[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Icon grid */}
      {filtered.length === 0 ? (
        <p className="text-zinc-500 text-sm py-12 text-center">Keine Icons gefunden.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {filtered.map((icon) => (
            <IconCard key={icon.id} icon={icon} prefs={prefs} onCardClick={setSelected} />
          ))}
        </div>
      )}

      {/* Variant picker modal */}
      {selected && (
        <VariantPicker
          icon={selected}
          currentVariant={prefs[selected.id] ?? 0}
          onSelect={(idx) => handleSelect(selected.id, idx)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
