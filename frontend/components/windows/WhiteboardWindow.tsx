"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface Sticker {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

interface BoardData {
  strokes: Stroke[];
  stickers: Sticker[];
}

interface Props {
  boardId?: string; // gespeicherte Board-ID aus Card-Data
  onBoardId?: (id: string) => void; // callback wenn neues Board erstellt
}

const COLORS = ["#ffffff", "#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#c084fc", "#f472b6"];
const STICKER_COLORS = ["#fef08a", "#86efac", "#93c5fd", "#f9a8d4", "#d8b4fe"];

export default function WhiteboardWindow({ boardId: initialBoardId, onBoardId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boardId, setBoardId] = useState<string | null>(initialBoardId ?? null);
  const [boardData, setBoardData] = useState<BoardData>({ strokes: [], stickers: [] });
  const [tool, setTool] = useState<"pen" | "eraser" | "sticker">("pen");
  const [color, setColor] = useState("#ffffff");
  const [lineWidth, setLineWidth] = useState(3);
  const [saving, setSaving] = useState(false);
  const [boardName, setBoardName] = useState("Neues Board");
  const [editingName, setEditingName] = useState(false);
  const [showStickerInput, setShowStickerInput] = useState<{ x: number; y: number } | null>(null);
  const [stickerText, setStickerText] = useState("");
  const [stickerColor, setStickerColor] = useState(STICKER_COLORS[0]);
  const [draggingSticker, setDraggingSticker] = useState<string | null>(null);
  const stickerDragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const drawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Board laden oder erstellen
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
      if (!res.ok) { createBoard(); return; }
      const board = await res.json();
      setBoardName(board.name);
      setBoardData(board.data?.strokes ? board.data : { strokes: [], stickers: [] });
    } catch { createBoard(); }
  }

  async function createBoard() {
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/windows/boards`, {
        method: "POST",
        body: JSON.stringify({ name: "Neues Board", board_type: "whiteboard" }),
      });
      if (!res.ok) return;
      const board = await res.json();
      setBoardId(board.id);
      onBoardId?.(board.id);
    } catch { /* ignore */ }
  }

  // Debounciertes Speichern
  const scheduleSave = useCallback((data: BoardData, name: string, id: string | null) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await apiFetch(`${BACKEND_URL}/v1/windows/boards/${id}`, {
          method: "PUT",
          body: JSON.stringify({ name, data }),
        });
      } catch { /* ignore */ }
      setSaving(false);
    }, 1000);
  }, []);

  // Canvas neuzeichnen
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of boardData.strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [boardData.strokes]);

  function getCanvasPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === "sticker") {
      const pos = getCanvasPos(e);
      setShowStickerInput(pos);
      return;
    }
    drawing.current = true;
    const pos = getCanvasPos(e);
    currentStroke.current = {
      points: [pos],
      color: tool === "eraser" ? "#0a0e1a" : color,
      width: tool === "eraser" ? lineWidth * 4 : lineWidth,
    };
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current || !currentStroke.current || !canvasRef.current) return;
    const pos = getCanvasPos(e);
    currentStroke.current.points.push(pos);
    // Live-Zeichnen
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const pts = currentStroke.current.points;
    ctx.beginPath();
    ctx.strokeStyle = currentStroke.current.color;
    ctx.lineWidth = currentStroke.current.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (pts.length >= 2) {
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  }

  function endDraw() {
    if (!drawing.current || !currentStroke.current) return;
    drawing.current = false;
    const stroke = currentStroke.current;
    currentStroke.current = null;
    if (stroke.points.length < 2) return;
    const newData = { ...boardData, strokes: [...boardData.strokes, stroke] };
    setBoardData(newData);
    scheduleSave(newData, boardName, boardId);
  }

  function addSticker() {
    if (!showStickerInput || !stickerText.trim()) { setShowStickerInput(null); return; }
    const sticker: Sticker = {
      id: `s-${Date.now()}`,
      x: showStickerInput.x,
      y: showStickerInput.y,
      text: stickerText.trim(),
      color: stickerColor,
    };
    const newData = { ...boardData, stickers: [...boardData.stickers, sticker] };
    setBoardData(newData);
    scheduleSave(newData, boardName, boardId);
    setStickerText("");
    setShowStickerInput(null);
  }

  function deleteSticker(id: string) {
    const newData = { ...boardData, stickers: boardData.stickers.filter(s => s.id !== id) };
    setBoardData(newData);
    scheduleSave(newData, boardName, boardId);
  }

  function clearCanvas() {
    const newData = { strokes: [], stickers: [] };
    setBoardData(newData);
    scheduleSave(newData, boardName, boardId);
  }

  function saveName(name: string) {
    setBoardName(name);
    setEditingName(false);
    scheduleSave(boardData, name, boardId);
  }

  // Sticker-Drag
  function startStickerDrag(e: React.MouseEvent, id: string, sx: number, sy: number) {
    e.stopPropagation();
    setDraggingSticker(id);
    stickerDragOffset.current = { dx: e.clientX - sx, dy: e.clientY - sy };
    function onMove(ev: MouseEvent) {
      setBoardData(prev => ({
        ...prev,
        stickers: prev.stickers.map(s => s.id === id
          ? { ...s, x: ev.clientX - stickerDragOffset.current.dx, y: ev.clientY - stickerDragOffset.current.dy }
          : s
        ),
      }));
    }
    function onUp() {
      setDraggingSticker(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setBoardData(prev => { scheduleSave(prev, boardName, boardId); return prev; });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#0a0e1a" }}>
      {/* Toolbar */}
      <div className="shrink-0 border-b border-white/5 px-2 py-1.5 flex gap-2 items-center flex-wrap">
        {/* Board-Name */}
        {editingName ? (
          <input
            autoFocus
            defaultValue={boardName}
            onBlur={e => saveName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveName(e.currentTarget.value); }}
            className="bg-white/8 border border-white/15 rounded px-2 py-0.5 text-xs text-white outline-none w-32"
          />
        ) : (
          <button onClick={() => setEditingName(true)} className="text-xs text-gray-400 hover:text-white transition-colors max-w-[120px] truncate">
            {boardName}
          </button>
        )}
        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* Tools */}
        {(["pen", "eraser", "sticker"] as const).map(t => (
          <button key={t} onClick={() => setTool(t)}
            className={`px-2 py-1 rounded text-xs transition-colors ${tool === t ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white hover:bg-white/8"}`}>
            {t === "pen" ? "✏️" : t === "eraser" ? "⬜" : "🗒"}
          </button>
        ))}

        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* Farben (nur bei pen/sticker) */}
        {tool !== "eraser" && (
          <div className="flex gap-1">
            {(tool === "sticker" ? STICKER_COLORS : COLORS).map(c => (
              <button key={c} onClick={() => tool === "sticker" ? setStickerColor(c) : setColor(c)}
                className="w-4 h-4 rounded-full border-2 transition-all"
                style={{
                  background: c,
                  borderColor: (tool === "sticker" ? stickerColor : color) === c ? "#fff" : "transparent",
                }} />
            ))}
          </div>
        )}

        {/* Strichbreite (nur bei pen/eraser) */}
        {tool !== "sticker" && (
          <input type="range" min={1} max={20} value={lineWidth}
            onChange={e => setLineWidth(Number(e.target.value))}
            className="w-16 h-1 accent-indigo-500" />
        )}

        <div className="flex-1" />

        {/* Speicher-Status */}
        {saving && <span className="text-[10px] text-gray-600 animate-pulse">Speichert…</span>}
        {!saving && boardId && <span className="text-[10px] text-gray-700">✓ Gespeichert</span>}

        {/* Löschen */}
        <button onClick={clearCanvas} className="text-xs text-gray-600 hover:text-red-400 transition-colors px-1" title="Alles löschen">
          🗑
        </button>
      </div>

      {/* Canvas-Bereich */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={2000}
          height={2000}
          className="absolute top-0 left-0"
          style={{ cursor: tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : "copy" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
        />

        {/* Sticker */}
        {boardData.stickers.map(s => (
          <div
            key={s.id}
            className="absolute rounded-lg px-3 py-2 text-sm text-gray-900 font-medium shadow-lg min-w-[80px] max-w-[200px] break-words"
            style={{
              left: s.x,
              top: s.y,
              background: s.color,
              cursor: draggingSticker === s.id ? "grabbing" : "grab",
              userSelect: "none",
            }}
            onMouseDown={e => startStickerDrag(e, s.id, s.x, s.y)}
          >
            {s.text}
            <button
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 text-white text-[10px] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              onClick={() => deleteSticker(s.id)}
              onMouseDown={e => e.stopPropagation()}
            >×</button>
          </div>
        ))}

        {/* Sticker-Eingabe */}
        {showStickerInput && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowStickerInput(null)} />
            <div className="absolute z-20 bg-gray-900 border border-white/15 rounded-xl p-3 shadow-2xl flex flex-col gap-2 w-48"
              style={{ left: showStickerInput.x, top: showStickerInput.y }}>
              <textarea
                autoFocus
                value={stickerText}
                onChange={e => setStickerText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addSticker(); } }}
                placeholder="Sticker-Text…"
                rows={2}
                className="bg-white/8 rounded px-2 py-1 text-xs text-white outline-none resize-none placeholder-gray-600"
              />
              <div className="flex gap-1">
                {STICKER_COLORS.map(c => (
                  <button key={c} onClick={() => setStickerColor(c)}
                    className="w-4 h-4 rounded-full border-2 transition-all"
                    style={{ background: c, borderColor: stickerColor === c ? "#fff" : "transparent" }} />
                ))}
              </div>
              <button onClick={addSticker}
                className="py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors">
                Hinzufügen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
