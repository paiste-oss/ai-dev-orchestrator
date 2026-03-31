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

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];           // object URLs for display (user uploads)
  generatedImages?: string[];  // URLs from DALL-E
  responseType?: string;
  structuredData?: StockData | StockHistoryData | ImageGalleryData | TransportBoardData | ActionButtonsData | BrowserViewData;
  provider?: string;
  model?: string;
  created_at: string;
}

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
  bubbleStyle: string;
  showTimestamps: string;
  backgroundImage?: string;
  fontColor: string;
  chatMode: string;
}
