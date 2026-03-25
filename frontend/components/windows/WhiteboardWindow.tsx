"use client";

import "@excalidraw/excalidraw/index.css";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// Excalidraw braucht ssr:false (Browser-only APIs)
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then(m => ({ default: m.Excalidraw })),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Lade Whiteboard…</div> }
);

interface Props {
  boardId?: string;
  onBoardId?: (id: string) => void;
}

export default function WhiteboardWindow({ boardId: initialBoardId, onBoardId }: Props) {
  const [boardId, setBoardId] = useState<string | null>(initialBoardId ?? null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [initialData, setInitialData] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardIdRef = useRef<string | null>(initialBoardId ?? null);

  // Board laden oder neu erstellen
  useEffect(() => {
    if (initialBoardId) {
      loadBoard(initialBoardId);
    } else {
      createBoard();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBoard(id: string) {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/windows/boards/${id}`);
      if (!res.ok) { await createBoard(); return; }
      const board = await res.json();
      const d = board.data ?? {};
      setInitialData({
        elements: d.elements ?? [],
        appState: { ...(d.appState ?? {}), collaborators: [] },
        files: d.files ?? {},
      });
    } catch {
      await createBoard();
    } finally {
      setReady(true);
    }
  }

  async function createBoard() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/windows/boards`, {
        method: "POST",
        body: JSON.stringify({ name: "Whiteboard", board_type: "excalidraw" }),
      });
      if (!res.ok) return;
      const board = await res.json();
      setBoardId(board.id);
      boardIdRef.current = board.id;
      onBoardId?.(board.id);
      setInitialData({ elements: [], appState: { collaborators: [] }, files: {} });
    } catch { /* ignore */ }
    setReady(true);
  }

  // Debounced save — feuert 2s nach letzter Änderung
  const scheduleSave = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (elements: any, appState: any, files: any) => {
      const id = boardIdRef.current;
      if (!id) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        try {
          // appState enthält viele UI-Felder — nur das Nötigste speichern
          const { zoom, scrollX, scrollY, theme } = appState;
          await apiFetch(`${BACKEND_URL}/v1/windows/boards/${id}`, {
            method: "PUT",
            body: JSON.stringify({
              data: { elements, appState: { zoom, scrollX, scrollY, theme }, files },
            }),
          });
        } catch { /* ignore */ }
        setSaving(false);
      }, 2000);
    },
    []
  );

  if (!ready) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        Lade Whiteboard…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Speicher-Indikator */}
      {saving && (
        <div className="absolute top-2 right-3 z-10 text-[10px] text-gray-400 animate-pulse pointer-events-none">
          Speichert…
        </div>
      )}

      <div className="flex-1">
        <Excalidraw
          initialData={initialData}
          theme="dark"
          onChange={(elements, appState, files) => scheduleSave(elements, appState, files)}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
            },
          }}
        />
      </div>
    </div>
  );
}
