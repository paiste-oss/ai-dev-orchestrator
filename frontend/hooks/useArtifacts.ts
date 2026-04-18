"use client";

import { useReducer, useCallback, useEffect } from "react";
import { ArtifactEntry } from "@/lib/chat-types";
import { WINDOW_MODULES } from "@/lib/window-registry";

const STORAGE_KEY = "baddi:artifacts";

// Typen mit temporären blob-URLs oder großen binären Daten — nicht persistieren
const SKIP_PERSIST_TYPES = new Set(["file_viewer"]);

function sanitizeForStorage(state: ArtifactState): ArtifactState {
  return {
    ...state,
    artifacts: state.artifacts
      .filter((a) => !SKIP_PERSIST_TYPES.has(a.type))
      .map((a) => {
        if (!a.data) return a;
        // screenshot_b64 nicht persistieren (zu groß, temporär)
        const { screenshot_b64: _omit, ...rest } = a.data as Record<string, unknown>;
        return { ...a, data: rest };
      }),
  };
}

function loadFromStorage(): ArtifactState {
  if (typeof window === "undefined") return { artifacts: [], activeId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { artifacts: [], activeId: null };
    const parsed = JSON.parse(raw) as ArtifactState;
    if (!Array.isArray(parsed.artifacts)) return { artifacts: [], activeId: null };
    return parsed;
  } catch {
    return { artifacts: [], activeId: null };
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
          // Singleton bereits offen → Daten mergen + fokussieren
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

    case "update": {
      return {
        ...state,
        artifacts: state.artifacts.map((a) =>
          a.id === action.id ? { ...a, data: { ...a.data, ...action.patch } } : a
        ),
      };
    }

    case "close": {
      const next = state.artifacts.filter((a) => a.id !== action.id);
      const activeId = state.activeId === action.id
        ? (next[next.length - 1]?.id ?? null)
        : state.activeId;
      return { artifacts: next, activeId };
    }

    case "closeByType": {
      const removed = new Set(
        state.artifacts.filter((a) => a.type === action.artifactType).map((a) => a.id)
      );
      const next = state.artifacts.filter((a) => !removed.has(a.id));
      const activeId = removed.has(state.activeId ?? "")
        ? (next[next.length - 1]?.id ?? null)
        : state.activeId;
      return { artifacts: next, activeId };
    }

    case "focus":
      return { ...state, activeId: action.id };

    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useArtifacts() {
  const [state, dispatch] = useReducer(reducer, undefined, loadFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForStorage(state)));
    } catch {
      // QuotaExceededError ignorieren — kein kritischer Fehler
    }
  }, [state]);

  /** Öffnet ein Artifact. Singleton-Typen werden aktualisiert statt dupliziert. */
  const openArtifact = useCallback(
    (artifactType: string, title: string, data?: Record<string, unknown>) =>
      dispatch({ kind: "open", artifactType, title, data }),
    []
  );

  /** Aktualisiert die Daten eines bestehenden Artifacts (z.B. boardId in NetzwerkWindow). */
  const updateArtifact = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      dispatch({ kind: "update", id, patch }),
    []
  );

  /** Schliesst ein Artifact per ID. */
  const closeArtifact = useCallback(
    (id: string) => dispatch({ kind: "close", id }),
    []
  );

  /** Schliesst alle Artifacts eines bestimmten Typs (für [FENSTER_SCHLIESSEN:]-Marker). */
  const closeArtifactByType = useCallback(
    (artifactType: string) => dispatch({ kind: "closeByType", artifactType }),
    []
  );

  /** Setzt den aktiven Tab. */
  const focusArtifact = useCallback(
    (id: string) => dispatch({ kind: "focus", id }),
    []
  );

  return {
    artifacts: state.artifacts,
    activeId: state.activeId,
    openArtifact,
    updateArtifact,
    closeArtifact,
    closeArtifactByType,
    focusArtifact,
  };
}
