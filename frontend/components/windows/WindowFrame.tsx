"use client";

import React from "react";

interface WindowFrameProps {
  /** Optionaler Header-Slot — wird automatisch mit Padding + Border unten versehen */
  header?: React.ReactNode;
  /** Eigene Header-Styles; wenn true, wird KEIN Padding/Border hinzugefügt */
  rawHeader?: boolean;
  /** Hauptinhalt des Fensters */
  children: React.ReactNode;
  /** Extra-Klassen auf dem Root-Element */
  className?: string;
  /** Content-Bereich soll scrollen (default: nein — Inhalt entscheidet selbst) */
  scroll?: boolean;
  /** Fenster rendert eigenen Hintergrund — Frame setzt keinen */
  noBackground?: boolean;
}

/**
 * Gemeinsames Grundgerüst für alle Fenster im Canvas-Panel.
 *
 * Liefert:
 *   • Root-Container mit `--window-bg` als Hintergrund
 *   • Auto-Kontrast-Textfarbe (`.window-text`) auf Basis des BG
 *   • Optionaler Header-Slot mit passender Border
 *   • Scrollbarer oder fixer Content-Slot
 *
 * Die CSS-Variablen (--auto-window-text-color, --auto-window-border-soft, ...)
 * werden von chat/page.tsx gesetzt, sobald der User unter
 * Home → Design einen anderen Fenster-Hintergrund wählt.
 */
export default function WindowFrame({
  header,
  rawHeader = false,
  children,
  className = "",
  scroll = false,
  noBackground = false,
}: WindowFrameProps) {
  const headerPadding = rawHeader ? "" : "px-3 py-2 border-b window-border-soft";

  return (
    <div
      className={`flex flex-col h-full overflow-hidden window-text ${className}`}
      style={noBackground ? undefined : { background: "var(--window-bg, rgba(8,12,22,0.92))" }}
    >
      {header !== undefined && (
        <div className={`shrink-0 ${headerPadding}`}>
          {header}
        </div>
      )}
      <div className={`flex-1 min-h-0 flex flex-col ${scroll ? "overflow-auto" : "overflow-hidden"}`}>
        {children}
      </div>
    </div>
  );
}
