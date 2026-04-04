"use client";

interface CardData {
  id: string;
  title: string;
  type: string;
}

interface MobilePinnedPanelProps {
  card: CardData;
  children: React.ReactNode;
  onClose: () => void;
  headerExtra?: React.ReactNode;
}

export default function MobilePinnedPanel({ card, children, onClose, headerExtra }: MobilePinnedPanelProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-t border-white/10">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 shrink-0 border-b border-white/8"
        style={{ minHeight: 38, background: "rgba(0,0,0,0.2)" }}
      >
        <span className="text-xs font-medium text-gray-300 truncate" style={{ flexShrink: 1, minWidth: 0 }}>{card.title}</span>
        {headerExtra && (
          <div className="flex items-center overflow-x-auto" style={{ flexShrink: 0 }}>
            {headerExtra}
          </div>
        )}
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0 ml-auto"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  );
}
