// Shared types for the chat feature

export interface StockData {
  symbol: string;
  name?: string;
  price?: number;
  currency?: string;
  change?: number;
  change_pct?: number;
  market_cap?: number;
  volume?: number;
  exchange?: string;
}

export interface StockHistoryData {
  symbol: string;
  period: string;
  currency: string;
  total_change_pct: number;
  start_price: number;
  end_price: number;
  data_points: { date: string; close: number; change_pct: number | null }[];
}

export interface ImageGalleryData {
  images: { image_url: string; description: string; photographer: string; source: string }[];
}

export interface TransportDeparture {
  line: string;
  destination: string;
  departure: string;
  track?: string;
  delay?: number;
  category?: string;
}

export interface TransportBoardData {
  station?: string;
  departures: TransportDeparture[];
}

export interface ActionButtonsData {
  buttons: { label: string; url: string }[];
}

export interface BrowserViewData {
  screenshot_b64: string;
  url: string;
  error?: string;
}

// Marker-based structured data types
export interface OpenWindowData {
  canvasType: string;
  symbols?: string[];
  symbol?: string;
  east?: number;
  north?: number;
  zoom?: number;
  bgLayer?: string;
  url?: string;
  goal?: string;
}

export interface OpenDocumentData {
  filename: string;
}

export interface OpenUrlData {
  url: string;
}

export interface CloseWindowData {
  canvasType: string;
}

export interface NetzwerkAktionData {
  board_id: string;
  added: string[];
}

export interface QuotaExceededData {
  message: string;
}

export type StructuredData =
  | StockData
  | StockHistoryData
  | ImageGalleryData
  | TransportBoardData
  | ActionButtonsData
  | BrowserViewData
  | OpenWindowData
  | OpenDocumentData
  | OpenUrlData
  | CloseWindowData
  | NetzwerkAktionData
  | QuotaExceededData;

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];           // object URLs for display (user uploads)
  generatedImages?: string[];  // URLs from DALL-E
  responseType?: string;
  structuredData?: StructuredData;
  provider?: string;
  model?: string;
  created_at: string;
}

export interface ArtifactEntry {
  id: string;
  title: string;
  type: string;
  data?: Record<string, unknown>;
}

// Response types that produce a visual artifact in the right panel
export const ARTIFACT_RESPONSE_TYPES = new Set([
  "stock_card", "stock_history", "image_gallery", "transport_board",
  "browser_view", "open_window", "open_document", "netzwerk_aktion",
]);

export const ARTIFACT_META: Record<string, { icon: string; label: string }> = {
  stock_card:      { icon: "📈", label: "Aktienkurs" },
  stock_history:   { icon: "📊", label: "Kursverlauf" },
  image_gallery:   { icon: "🖼",  label: "Bilder" },
  transport_board: { icon: "🚆", label: "Abfahrten" },
  browser_view:    { icon: "🌐", label: "Browser" },
  open_window:     { icon: "🪟", label: "Fenster" },
  netzwerk_aktion: { icon: "🕸",  label: "Namensnetz" },
  netzwerk:        { icon: "🕸",  label: "Namensnetz" },
  chart:           { icon: "📊", label: "Chart" },
  whiteboard:      { icon: "✏️", label: "Whiteboard" },
  geo_map:         { icon: "🗺",  label: "Karte" },
  assistenz:       { icon: "🤖", label: "Assistent" },
  design:          { icon: "🎨", label: "Design" },
  documents:       { icon: "📁", label: "Dokumente" },
  file_viewer:     { icon: "📄", label: "Datei" },
  diktieren:       { icon: "🎤", label: "Diktat" },
  memory:          { icon: "🧠", label: "Erinnerungen" },
};

export interface MemoryItem {
  id: string;
  content: string;
  importance: number;
  category: string;
  created_at: string;
}

export interface UiPrefs {
  fontSize: string;
  fontFamily: string;
  accentColor: string;
  background: string;
  lineSpacing: string;
  language: string;
  buddyName: string;
  chatWidth: string;
  showTimestamps: string;
  backgroundImage?: string;
  fontColor: string;
  avatarType?: string;
  ttsDefault?: boolean;
  ttsVoice?: string;
  windowBg?: string;
}
