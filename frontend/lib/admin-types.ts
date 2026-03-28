/**
 * Gemeinsame TypeScript-Definitionen für alle Admin-Pages.
 * Verhindert Duplikation lokaler Interfaces.
 */

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Kunden ───────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  subscription_plan_name: string | null;
  subscription_status: string | null;
}

export type CustomerListResponse = PaginatedResponse<Customer>;

// ─── Entwicklung / Capability Requests ───────────────────────────────────────

export interface DialogMessage {
  role: "uhrwerk" | "admin";
  content: string;
  created_at: string;
}

export interface CapabilityRequest {
  id: string;
  customer_id: string;
  buddy_id: string | null;
  original_message: string;
  detected_intent: string | null;
  status: string;
  status_label: string;
  tool_proposal: Record<string, unknown> | null;
  dialog: DialogMessage[];
  admin_notes: string | null;
  deployed_tool_key: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  total_messages: number;
  unique_sessions: number;
  total_tokens: number;
  avg_tokens: number;
  messages_today: number;
  messages_7d: number;
}

export interface ResponseTypeCount {
  response_type: string;
  cnt: number;
}

export interface DailyCount {
  day: string;
  cnt: number;
}

export interface HourlyCount {
  hour_of_day: number;
  cnt: number;
}

export interface AnalyticsMessage {
  id: string;
  session_hash: string;
  user_message: string;
  assistant_message: string;
  response_type: string;
  tokens_used: number;
  language: string;
  day: string;
  hour_of_day: number;
  system_prompt_name: string;
  tools_used: string;
  memory_facts: string;
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export interface ApiStatus {
  provider: string;
  key_required: boolean;
  configured: boolean;
}

export interface Tool {
  key: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  tool_count: number;
  tool_names: string[];
  api_status: ApiStatus;
}

export interface ToolParam {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, ToolParam>;
    required?: string[];
  };
}

export interface HandlerInfo {
  function: string;
  module: string;
  file: string;
  line: number | null;
}

export interface ToolDetail extends Tool {
  tool_defs: ToolDef[];
  handler: HandlerInfo | null;
}
