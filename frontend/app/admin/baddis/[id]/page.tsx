"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import AdminSidebar from "@/components/AdminSidebar";
import { getUseCase } from "@/lib/usecases";
import { AGENTS } from "@/lib/agents";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BaddiConfig {
  system_prompt: string;
  tone: string;
  language: string;
  preferred_model: string;
  fallback_model: string;
  n8n_workflow_id: string;
  skills: string[];
  memory_enabled: boolean;
  context_window: number;
  capabilities: string[];
  agents: string[];
}

const DEFAULT_CONFIG: BaddiConfig = {
  system_prompt: "",
  tone: "warm",
  language: "de",
  preferred_model: "gemini-2.0-flash",
  fallback_model: "gpt-4o-mini",
  n8n_workflow_id: "",
  skills: [],
  memory_enabled: true,
  context_window: 10,
  capabilities: ["conversation"],
  agents: [],
};

const ALL_SKILLS = [
  { id: "web_search",      label: "Web-Suche",          icon: "🔍" },
  { id: "document_read",   label: "Dokumente lesen",     icon: "📄" },
  { id: "image_analysis",  label: "Bild-Analyse",        icon: "🖼️" },
  { id: "voice_input",     label: "Spracheingabe",       icon: "🎙️" },
  { id: "calendar",        label: "Kalender-Zugriff",   icon: "📅" },
  { id: "email",           label: "E-Mail",             icon: "📧" },
  { id: "translation",     label: "Übersetzung",        icon: "🌐" },
  { id: "code_execution",  label: "Code ausführen",     icon: "💻" },
  { id: "n8n_trigger",     label: "n8n Workflow",       icon: "⚙️" },
  { id: "knowledge_base",  label: "Wissensdatenbank",   icon: "🧠" },
];

const ALL_CAPABILITIES = [
  "conversation", "document_analysis", "summarization",
  "translation", "code_help", "creative_writing",
  "data_analysis", "scheduling", "research",
];

const TONES = [
  { id: "warm",         label: "Warm & empathisch" },
  { id: "professional", label: "Professionell & sachlich" },
  { id: "friendly",     label: "Freundlich & locker" },
  { id: "concise",      label: "Präzise & direkt" },
  { id: "playful",      label: "Spielerisch & kreativ" },
];

const MODELS = [
  { id: "gemini-2.0-flash",  label: "Gemini 2.0 Flash (Standard)" },
  { id: "gemini-1.5-pro",    label: "Gemini 1.5 Pro" },
  { id: "gpt-4o-mini",       label: "GPT-4o Mini" },
  { id: "gpt-4o",            label: "GPT-4o" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function BaddiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = getSession();
  const uc = getUseCase(id);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [config, setConfig] = useState<BaddiConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"prompt" | "agents" | "skills" | "model" | "workflows">("prompt");

  useEffect(() => {
    if (!user || user.role !== "admin") { router.replace("/login"); return; }
    if (!uc) { router.replace("/admin/baddis"); return; }

    // Load saved config from backend (Redis key per baddiD)
    apiFetch(`${BACKEND_URL}/v1/settings/baddi/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setConfig(prev => ({ ...prev, ...data }));
        else setConfig({ ...DEFAULT_CONFIG, system_prompt: uc?.systemPrompt ?? "" });
      })
      .catch(() => setConfig({ ...DEFAULT_CONFIG, system_prompt: uc?.systemPrompt ?? "" }))
      .finally(() => setLoading(false));
  }, [id]);

  if (!uc) return null;

  const set = <K extends keyof BaddiConfig>(key: K, value: BaddiConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  const toggleSkill = (skill: string) =>
    set("skills", config.skills.includes(skill)
      ? config.skills.filter(s => s !== skill)
      : [...config.skills, skill]);

  const toggleCapability = (cap: string) =>
    set("capabilities", config.capabilities.includes(cap)
      ? config.capabilities.filter(c => c !== cap)
      : [...config.capabilities, cap]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`${BACKEND_URL}/v1/settings/baddi/${id}`, {
        method: "PUT",
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const toggleAgent = (agentId: string) =>
    set("agents", config.agents.includes(agentId)
      ? config.agents.filter(a => a !== agentId)
      : [...config.agents, agentId]);

  const TABS = [
    { id: "prompt",    label: "System-Prompt", icon: "📝" },
    { id: "agents",    label: "Agenten",       icon: "🤖" },
    { id: "skills",    label: "Skills",        icon: "⚡" },
    { id: "model",     label: "Modell",        icon: "🧠" },
    { id: "workflows", label: "Workflows",     icon: "⚙️" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {/* Mobile header */}
        <div className="flex items-center gap-3 md:hidden mb-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white text-2xl">☰</button>
          <h1 className="text-lg font-bold text-yellow-400">{uc.buddyName}</h1>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">

          {/* Hero */}
          <div className={`rounded-2xl border p-6 ${uc.bgColor} ${uc.borderColor}`}>
            <div className="flex items-center gap-4">
              <span className="text-5xl">{uc.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={`text-2xl font-bold ${uc.color}`}>{uc.buddyName}</h2>
                  <span className={`text-sm font-medium text-white`}>{uc.name}</span>
                  <span className="font-mono text-xs text-yellow-400 bg-black/30 px-2 py-0.5 rounded-lg">{uc.baddiD}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${uc.status === "active" ? "bg-green-900/50 text-green-400 border border-green-800" : "bg-gray-800 text-gray-500"}`}>
                    {uc.status === "active" ? "Aktiv" : "In Entwicklung"}
                  </span>
                </div>
                <p className="text-gray-300 text-sm mt-1">{uc.tagline}</p>
                <p className="text-gray-500 text-xs mt-1">Segment: {uc.segment} · Zielgruppe: {uc.ageRange}</p>
              </div>
              <button
                onClick={() => router.push("/admin/baddis")}
                className="text-gray-500 hover:text-white text-xl shrink-0"
              >←</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-yellow-500 text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-600">Lädt…</div>
          ) : (
            <>
              {/* ── System Prompt ── */}
              {activeTab === "prompt" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">System-Prompt</label>
                    <p className="text-xs text-gray-500">Definiert die Persönlichkeit, Rolle und Verhaltensregeln dieses Baddis.</p>
                    <textarea
                      rows={14}
                      value={config.system_prompt}
                      onChange={e => set("system_prompt", e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500 resize-none font-mono leading-relaxed"
                      placeholder="Du bist …"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-400">Ton / Stil</label>
                      <select
                        value={config.tone}
                        onChange={e => set("tone", e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                      >
                        {TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-400">Sprache</label>
                      <select
                        value={config.language}
                        onChange={e => set("language", e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                      >
                        <option value="de">🇩🇪 Deutsch</option>
                        <option value="de-ch">🇨🇭 Schweizerdeutsch</option>
                        <option value="fr">🇫🇷 Français</option>
                        <option value="it">🇮🇹 Italiano</option>
                        <option value="en">🇬🇧 English</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Agenten ── */}
              {activeTab === "agents" && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-300">Agenten zuweisen</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Aktive Agenten erweitern die Fähigkeiten dieses Baddis. Der System-Prompt wird automatisch um die Agent-Capabilities ergänzt.
                    </p>
                  </div>

                  {config.agents.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 bg-gray-900 border border-yellow-500/20 rounded-xl">
                      <p className="w-full text-xs text-yellow-400 font-medium mb-1">Zugewiesen ({config.agents.length})</p>
                      {config.agents.map(id => {
                        const a = AGENTS.find(x => x.id === id);
                        return a ? (
                          <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-300">
                            {a.icon} {a.name}
                            <button onClick={() => toggleAgent(id)} className="text-yellow-600 hover:text-red-400 ml-1">✕</button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AGENTS.map(agent => {
                      const isAssigned = config.agents.includes(agent.id);
                      const isPlanned = agent.status === "planned";
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          disabled={isPlanned}
                          onClick={() => !isPlanned && toggleAgent(agent.id)}
                          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                            isAssigned
                              ? "border-yellow-500 bg-yellow-950/30"
                              : isPlanned
                              ? "border-gray-800 bg-gray-900/50 opacity-40 cursor-not-allowed"
                              : "border-gray-700 bg-gray-900 hover:border-gray-500"
                          }`}
                        >
                          <span className={`text-2xl shrink-0 ${isPlanned ? "grayscale" : ""}`}>{agent.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-semibold ${isAssigned ? "text-yellow-200" : "text-gray-200"}`}>
                                {agent.name}
                              </p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${
                                agent.status === "active" ? "bg-green-500/20 text-green-300 border-green-500/30" :
                                agent.status === "beta"   ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" :
                                "bg-gray-500/20 text-gray-400 border-gray-500/30"
                              }`}>
                                {agent.status === "active" ? "Aktiv" : agent.status === "beta" ? "Beta" : "In Planung"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{agent.capability}</p>
                          </div>
                          {isAssigned && <span className="text-yellow-400 text-sm shrink-0">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Skills ── */}
              {activeTab === "skills" && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-300">Skills</label>
                      <p className="text-xs text-gray-500 mt-0.5">Welche Fähigkeiten soll dieser Baddi besitzen?</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_SKILLS.map(skill => (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => toggleSkill(skill.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                            config.skills.includes(skill.id)
                              ? "border-yellow-500 bg-yellow-950/30 text-yellow-200"
                              : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          <span className="text-xl">{skill.icon}</span>
                          <span className="text-sm font-medium">{skill.label}</span>
                          {config.skills.includes(skill.id) && <span className="ml-auto text-yellow-400 text-xs">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-300">Fähigkeiten (Capabilities)</label>
                      <p className="text-xs text-gray-500 mt-0.5">Technische Capabilities die der Baddi unterstützt.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ALL_CAPABILITIES.map(cap => (
                        <button
                          key={cap}
                          type="button"
                          onClick={() => toggleCapability(cap)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            config.capabilities.includes(cap)
                              ? "border-yellow-500 bg-yellow-950/30 text-yellow-300"
                              : "border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-500"
                          }`}
                        >
                          {cap}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-900 border border-gray-700 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-white">Gedächtnis (Memory)</p>
                      <p className="text-xs text-gray-500">Speichert wichtige Kontext-Informationen über den User</p>
                    </div>
                    <button
                      onClick={() => set("memory_enabled", !config.memory_enabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ml-4 ${config.memory_enabled ? "bg-yellow-500" : "bg-gray-600"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${config.memory_enabled ? "translate-x-7" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {config.memory_enabled && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-400">Kontext-Fenster (letzte N Nachrichten)</label>
                      <input
                        type="number" min={1} max={50}
                        value={config.context_window}
                        onChange={e => set("context_window", parseInt(e.target.value) || 10)}
                        className="w-32 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── Model ── */}
              {activeTab === "model" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Primäres Modell</label>
                    <p className="text-xs text-gray-500">Wird für alle Anfragen dieses Baddis bevorzugt verwendet.</p>
                    <div className="space-y-2">
                      {MODELS.map(m => (
                        <button
                          key={m.id}
                          onClick={() => set("preferred_model", m.id)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors ${
                            config.preferred_model === m.id
                              ? "border-yellow-500 bg-yellow-950/20 text-yellow-200"
                              : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          <span>{m.label}</span>
                          {config.preferred_model === m.id && <span className="text-yellow-400">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Fallback-Modell</label>
                    <p className="text-xs text-gray-500">Wird verwendet wenn das primäre Modell nicht antwortet.</p>
                    <select
                      value={config.fallback_model}
                      onChange={e => set("fallback_model", e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500"
                    >
                      {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>

                  <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-xs text-gray-500 space-y-1">
                    <p className="font-medium text-gray-400">Routing-Logik</p>
                    <p>1. Primäres Modell → 2. Fallback bei Fehler/Timeout → 3. Antwort an User</p>
                    <p>Gemini Flash ist Standard (günstig, schnell). GPT-4o Mini als Fallback.</p>
                  </div>
                </div>
              )}

              {/* ── Workflows ── */}
              {activeTab === "workflows" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">n8n Workflow ID</label>
                    <p className="text-xs text-gray-500">Verknüpft diesen Baddi mit einem n8n-Workflow (optional).</p>
                    <input
                      value={config.n8n_workflow_id}
                      onChange={e => set("n8n_workflow_id", e.target.value)}
                      placeholder="z.B. abc123"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-yellow-500 font-mono"
                    />
                  </div>

                  <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-300">Trigger-Logiken</p>
                    <p className="text-xs text-gray-500">Wann soll der Baddi automatisch Aktionen auslösen?</p>
                    {[
                      { id: "on_message",    label: "Bei jeder Nachricht",     desc: "Workflow wird nach jeder User-Nachricht getriggert" },
                      { id: "on_keyword",    label: "Bei Keyword",             desc: "Nur wenn bestimmte Schlüsselwörter erkannt werden" },
                      { id: "on_schedule",   label: "Zeitgesteuert",           desc: "Täglich / wöchentlich via Celery Beat" },
                    ].map(trigger => (
                      <div key={trigger.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                        <div>
                          <p className="text-sm text-white">{trigger.label}</p>
                          <p className="text-xs text-gray-500">{trigger.desc}</p>
                        </div>
                        <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">Bald</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Save button */}
          <div className="sticky bottom-4">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="w-full py-3 rounded-xl font-bold text-sm transition-colors bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-50 shadow-lg"
            >
              {saved ? "✓ Gespeichert" : saving ? "Speichern…" : "Konfiguration speichern"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
