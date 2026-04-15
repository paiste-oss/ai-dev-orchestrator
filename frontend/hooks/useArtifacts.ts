"use client";

import { useReducer, useCallback } from "react";
import { ArtifactEntry } from "@/lib/chat-types";

// Typen die nur einmal gleichzeitig offen sein können
const SINGLETON_TYPES = new Set([
  "chart", "netzwerk", "whiteboard", "geo_map", "assistenz",
  "design", "memory", "documents", "diktieren", "image_viewer",
]);

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
  const [state, dispatch] = useReducer(reducer, { artifacts: [], activeId: null });

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
