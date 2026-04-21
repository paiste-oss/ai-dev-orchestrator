"use client";

import { useReducer, useCallback, useEffect } from "react";
import { ArtifactEntry } from "@/lib/chat-types";
import { WINDOW_MODULES } from "@/lib/window-registry";

// !! SICHERHEIT: Key ist IMMER an userId gebunden — niemals ohne Scope verwenden !!
const storageKey  = (userId: string) => `baddi:artifacts:${encodeURIComponent(userId)}`;

// Legacy-Keys die beim ersten Laden gesäubert werden müssen
const LEGACY_KEYS = ["baddi:artifacts", "baddi_canvas_cards"];

// Typen mit temporären blob-URLs oder großen binären Daten — nicht persistieren
const SKIP_PERSIST_TYPES = new Set(["file_viewer"]);

function sanitizeForStorage(state: ArtifactState): ArtifactState {
  return {
    ...state,
    artifacts: state.artifacts
      .filter((a) => !SKIP_PERSIST_TYPES.has(a.type))
      .map((a) => {
        if (!a.data) return a;
        const { screenshot_b64: _omit, ...rest } = a.data as Record<string, unknown>;
        return { ...a, data: rest };
      }),
  };
}

function loadFromStorage(userId: string): ArtifactState {
  const empty: ArtifactState = { artifacts: [], activeId: null };
  if (typeof window === "undefined") return empty;

  // Legacy-Keys immer löschen — verhindert Kontaminierung anderer Nutzer
  for (const k of LEGACY_KEYS) {
    try { localStorage.removeItem(k); } catch { /* ignored */ }
  }

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as ArtifactState;
    if (!Array.isArray(parsed.artifacts)) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

// Typen die nur einmal gleichzeitig offen sein können — aus Registry abgeleitet
const SINGLETON_TYPES = new Set(
  WINDOW_MODULES.filter((m) => m.singleton).map((m) => m.canvasType)
);

// ── State & Actions ──────────────────────────────────────────────────────────

interface ArtifactState {
  artifacts: ArtifactEntry[];
  activeId: string | null;
}

type ArtifactAction =
  | { kind: "open";        artifactType: string; title: string; data?: Record<string, unknown> }
  | { kind: "update";      id: string;           patch: Record<string, unknown> }
  | { kind: "close";       id: string }
  | { kind: "closeByType"; artifactType: string }
  | { kind: "focus";       id: string };

function reducer(state: ArtifactState, action: ArtifactAction): ArtifactState {
  switch (action.kind) {
    case "open": {
      const newId = `${action.artifactType}-${Date.now()}`;
      if (SINGLETON_TYPES.has(action.artifactType)) {
        const existing = state.artifacts.find((a) => a.type === action.artifactType);
        if (existing) {
          return {
            artifacts: state.artifacts.map((a) =>
              a.id === existing.id
                ? { ...a, title: action.title, data: action.data ? { ...a.data, ...action.data } : a.data }
                : a
            ),
            activeId: existing.id,
          };
        }
      }
      return {
        artifacts: [...state.artifacts, { id: newId, type: action.artifactType, title: action.title, data: action.data }],
        activeId: newId,
      };
    }

    case "update":
      return {
        ...state,
        artifacts: state.artifacts.map((a) =>
          a.id === action.id ? { ...a, data: { ...a.data, ...action.patch } } : a
        ),
      };

    case "close": {
      const next = state.artifacts.filter((a) => a.id !== action.id);
      return {
        artifacts: next,
        activeId: state.activeId === action.id ? (next[next.length - 1]?.id ?? null) : state.activeId,
      };
    }

    case "closeByType": {
      const removed = new Set(
        state.artifacts.filter((a) => a.type === action.artifactType).map((a) => a.id)
      );
      const next = state.artifacts.filter((a) => !removed.has(a.id));
      return {
        artifacts: next,
        activeId: removed.has(state.activeId ?? "") ? (next[next.length - 1]?.id ?? null) : state.activeId,
      };
    }

    case "focus":
      return { ...state, activeId: action.id };

    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * userId MUSS immer der eindeutige Bezeichner des eingeloggten Benutzers sein.
 * Ohne userId werden keine Daten aus localStorage geladen oder gespeichert.
 */
export function useArtifacts(userId: string | null | undefined) {
  const [state, dispatch] = useReducer(
    reducer,
    userId ?? "",
    loadFromStorage,
  );

  useEffect(() => {
    if (!userId) return; // Kein Nutzer → nichts persistieren
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(sanitizeForStorage(state)));
    } catch {
      // QuotaExceededError ignorieren
    }
  }, [state, userId]);

  const openArtifact = useCallback(
    (artifactType: string, title: string, data?: Record<string, unknown>) =>
      dispatch({ kind: "open", artifactType, title, data }),
    []
  );

  const updateArtifact = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      dispatch({ kind: "update", id, patch }),
    []
  );

  const closeArtifact = useCallback(
    (id: string) => dispatch({ kind: "close", id }),
    []
  );

  const closeArtifactByType = useCallback(
    (artifactType: string) => dispatch({ kind: "closeByType", artifactType }),
    []
  );

  const focusArtifact = useCallback(
    (id: string) => dispatch({ kind: "focus", id }),
    []
  );

  return { artifacts: state.artifacts, activeId: state.activeId, openArtifact, updateArtifact, closeArtifact, closeArtifactByType, focusArtifact };
}
