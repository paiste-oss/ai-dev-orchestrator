"use client";

import { useState } from "react";

const LAYERS = [
  { key: "ch.swisstopo.pixelkarte-farbe", label: "Landeskarte" },
  { key: "ch.swisstopo.swissimage",       label: "Luftbild" },
  { key: "ch.swisstopo.pixelkarte-grau",  label: "Graukarte" },
];

interface Props {
  east?: number;
  north?: number;
  zoom?: number;
  bgLayer?: string;
}

export default function GeoMapWindow({ east = 2600000, north = 1200000, zoom = 8, bgLayer = "ch.swisstopo.pixelkarte-farbe" }: Props) {
  const [activeLayer, setActiveLayer] = useState(bgLayer);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState({ east, north, zoom });
  const [loading, setLoading] = useState(false);

  const iframeSrc = `https://map.geo.admin.ch/?lang=de&topic=ech&bgLayer=${activeLayer}&E=${coords.east}&N=${coords.north}&zoom=${coords.zoom}`;

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=${encodeURIComponent(search)}&type=locations&limit=1&lang=de&sr=2056`
      );
      const data = await res.json();
      const attrs = data.results?.[0]?.attrs;
      if (attrs?.x && attrs?.y) {
        setCoords({ east: Math.round(attrs.x), north: Math.round(attrs.y), zoom: 10 });
        setSearch("");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-white/5 shrink-0">
        {/* Suche */}
        <form onSubmit={handleSearch} className="flex items-center gap-1.5 flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ort oder Adresse suchen…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 min-w-0"
          />
          <button
            type="submit"
            disabled={loading || !search.trim()}
            className="px-3 py-1.5 text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors disabled:opacity-40"
          >
            {loading ? "…" : "Suchen"}
          </button>
        </form>

        {/* Layer-Auswahl */}
        <div className="flex items-center gap-1 shrink-0">
          {LAYERS.map(l => (
            <button
              key={l.key}
              onClick={() => setActiveLayer(l.key)}
              className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                activeLayer === l.key
                  ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Direktlink */}
        <a
          href={iframeSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-gray-300 text-xs shrink-0 transition-colors"
          title="In map.geo.admin.ch öffnen"
        >
          ↗
        </a>
      </div>

      {/* Karte */}
      <div className="flex-1 relative">
        <iframe
          key={`${coords.east}-${coords.north}-${coords.zoom}-${activeLayer}`}
          src={iframeSrc}
          className="w-full h-full border-0"
          loading="lazy"
          allowFullScreen
          title="swisstopo Karte"
        />
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-gray-900 border-t border-white/5 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-gray-700">
          © swisstopo — Geodaten Bundesamt für Landestopografie
        </span>
        <span className="text-[10px] text-gray-700">
          E {coords.east} / N {coords.north}
        </span>
      </div>
    </div>
  );
}
