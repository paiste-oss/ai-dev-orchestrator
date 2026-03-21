export type WorkflowPattern = "react" | "plan-execute" | "multi-agent";

/**
 * tool     → Eigenes Tool / Service im Backend implementiert
 * native   → Claude kann es nativ, kein dediziertes Tool nötig
 * roadmap  → Noch nicht implementiert — geplant für die Zukunft
 */
export type AgentStatus = "tool" | "native" | "roadmap";

export interface AgentSkill {
  label: string;
  icon: string;
  area: "reasoning" | "memory" | "tools" | "guardrails";
}

export interface Agent {
  id: string;
  icon: string;
  name: string;
  description: string;
  pattern: WorkflowPattern;
  status: AgentStatus;
  skills: AgentSkill[];
  useCases: string[];
  color: string;
  bgColor: string;
  borderColor: string;
  /** Was im System-Prompt erscheint wenn dieser Agent aktiv ist */
  capability: string;
  /** Was wirklich dahinter steckt (für Admin-Info) */
  implementation: string;
}

export const AGENTS: Agent[] = [
  // ── Implementiert (echte Tools / Services) ────────────────────────────────
  {
    id: "ki-chat",
    icon: "💬",
    name: "KI-Chat-Agent",
    description: "Das Herzstück von Baddi — vielseitiger Gesprächs- und Beratungsagent mit Langzeitgedächtnis.",
    pattern: "react",
    status: "tool",
    color: "text-purple-300",
    bgColor: "bg-purple-900/20",
    borderColor: "border-purple-700/50",
    capability: "Intelligente Konversation, Texterstellung und Beratung",
    implementation: "Claude Haiku / Sonnet + Memory Manager (gemma3:12b) + Qdrant Langzeitgedächtnis",
    skills: [
      { label: "Langzeitgedächtnis", icon: "🧠", area: "memory" },
      { label: "Konversationskontext", icon: "💬", area: "memory" },
      { label: "Texterstellung", icon: "✍️", area: "tools" },
      { label: "Ton-Anpassung", icon: "🎭", area: "guardrails" },
    ],
    useCases: ["Beratungsgespräche", "Textentwürfe", "Brainstorming", "Q&A"],
  },
  {
    id: "research",
    icon: "🔍",
    name: "Forschungs-Agent",
    description: "Durchsucht das Web in Echtzeit und erstellt fundierte Berichte aus aktuellen Quellen.",
    pattern: "react",
    status: "tool",
    color: "text-blue-300",
    bgColor: "bg-blue-900/20",
    borderColor: "border-blue-700/50",
    capability: "Web-Recherche und Faktenprüfung in Echtzeit",
    implementation: "Exa Web Search API + Jina Reader (web_fetch) — beide im Tool-Katalog registriert",
    skills: [
      { label: "Web Search (Exa)", icon: "🌐", area: "tools" },
      { label: "Web Fetch (Jina)", icon: "📰", area: "tools" },
      { label: "Quellen-Validierung", icon: "✅", area: "reasoning" },
      { label: "Zusammenfassung", icon: "📝", area: "reasoning" },
    ],
    useCases: ["Marktanalysen", "Fact-Checking", "Nachrichten-Monitoring", "Wettbewerbsbeobachtung"],
  },
  {
    id: "document",
    icon: "📄",
    name: "Dokument-Analyse-Agent",
    description: "Analysiert PDFs, Word-Dateien und Bilder. Extrahiert strukturierte Daten via RAG.",
    pattern: "react",
    status: "tool",
    color: "text-orange-300",
    bgColor: "bg-orange-900/20",
    borderColor: "border-orange-700/50",
    capability: "Analyse und Zusammenfassung von PDFs, Word- und Textdokumenten",
    implementation: "File-Upload Endpunkt + Claude Vision + Qdrant Vektorsuche (RAG)",
    skills: [
      { label: "PDF / Word Parsing", icon: "📑", area: "tools" },
      { label: "RAG / Vektorsuche", icon: "🧠", area: "memory" },
      { label: "Daten-Extraktion", icon: "🔎", area: "reasoning" },
      { label: "Datenschutz-Filter", icon: "🛡️", area: "guardrails" },
    ],
    useCases: ["Vertrags-Analyse", "Rechnungs-Verarbeitung", "Protokoll-Auswertung", "Due Diligence"],
  },
  {
    id: "image",
    icon: "🖼️",
    name: "Bild-Agent",
    description: "Generiert Bilder per Text-Beschreibung (DALL-E 3) und analysiert hochgeladene Bilder und Videos.",
    pattern: "react",
    status: "tool",
    color: "text-pink-300",
    bgColor: "bg-pink-900/20",
    borderColor: "border-pink-700/50",
    capability: "Bilder generieren mit DALL-E 3 und Bilder / Videos analysieren",
    implementation: "DALL-E 3 (OpenAI API) für Generierung + Claude Vision für Analyse + Client-seitige Video-Frame-Extraktion",
    skills: [
      { label: "DALL-E 3 Generierung", icon: "🎨", area: "tools" },
      { label: "Claude Vision", icon: "👁️", area: "tools" },
      { label: "Video-Frame-Analyse", icon: "🎬", area: "tools" },
      { label: "Prompt-Optimierung", icon: "✍️", area: "reasoning" },
    ],
    useCases: ["Bild-Generierung", "Bild-Analyse", "Video-Analyse", "Logo-Entwürfe"],
  },
  {
    id: "transport",
    icon: "🚆",
    name: "ÖV-Agent",
    description: "Echtzeit-Abfahrtstafeln, Verbindungssuche und Haltestellen im Schweizer öffentlichen Verkehr.",
    pattern: "react",
    status: "tool",
    color: "text-sky-300",
    bgColor: "bg-sky-900/20",
    borderColor: "border-sky-700/50",
    capability: "Echtzeit-Fahrpläne und Verbindungssuche im Schweizer ÖV (SBB/Bus/Tram)",
    implementation: "SBB Open Data API — sbb_locations, sbb_stationboard, sbb_connections",
    skills: [
      { label: "SBB Open Data API", icon: "🚉", area: "tools" },
      { label: "Echtzeit-Daten", icon: "⚡", area: "tools" },
      { label: "Verbindungsplanung", icon: "🗺️", area: "reasoning" },
    ],
    useCases: ["Abfahrtszeiten", "Verbindungssuche", "Gleis-Info", "Verspätungen"],
  },
  {
    id: "code",
    icon: "💻",
    name: "Code-Agent",
    description: "Schreibt, reviewed und führt Code im Projekt aus. Commited direkt via Dev Orchestrator.",
    pattern: "plan-execute",
    status: "tool",
    color: "text-green-300",
    bgColor: "bg-green-900/20",
    borderColor: "border-green-700/50",
    capability: "Code schreiben, reviewen und ausführen",
    implementation: "Dev Orchestrator — Claude Sonnet + task_runner + Git-Integration (nur für Admin)",
    skills: [
      { label: "Git Integration", icon: "🔀", area: "tools" },
      { label: "File Read / Write", icon: "📁", area: "tools" },
      { label: "Self-Reflection", icon: "🪞", area: "reasoning" },
      { label: "Task Decomposition", icon: "🗂️", area: "reasoning" },
    ],
    useCases: ["Feature-Entwicklung", "Bug-Fixing", "Code-Review", "Refactoring"],
  },

  // ── Claude-nativ (kein extra Tool nötig) ─────────────────────────────────
  {
    id: "translation",
    icon: "🌐",
    name: "Übersetzungs-Agent",
    description: "Übersetzt Texte in alle grossen Sprachen mit Fokus auf Natürlichkeit und kulturelle Angemessenheit.",
    pattern: "react",
    status: "native",
    color: "text-cyan-300",
    bgColor: "bg-cyan-900/20",
    borderColor: "border-cyan-700/50",
    capability: "Mehrsprachige Übersetzung mit kulturellem Kontext",
    implementation: "Claude nativ — kein extra Tool nötig. Claude beherrscht 95+ Sprachen out-of-the-box.",
    skills: [
      { label: "Mehrsprachige LLMs", icon: "🗣️", area: "tools" },
      { label: "Kontextverständnis", icon: "🧩", area: "reasoning" },
      { label: "Stil-Anpassung", icon: "🎭", area: "reasoning" },
      { label: "Qualitäts-Check", icon: "✅", area: "guardrails" },
    ],
    useCases: ["Dokument-Übersetzung", "Website-Lokalisierung", "Kundenkommunikation", "E-Mail-Übersetzung"],
  },
  {
    id: "planning",
    icon: "🗺️",
    name: "Planungs-Agent",
    description: "Zerlegt komplexe Ziele in Teilaufgaben, priorisiert und erstellt strukturierte Pläne.",
    pattern: "plan-execute",
    status: "native",
    color: "text-yellow-300",
    bgColor: "bg-yellow-900/20",
    borderColor: "border-yellow-700/50",
    capability: "Komplexe Ziele planen, priorisieren und koordinieren",
    implementation: "Claude nativ — Planungslogik ist eine Stärke von Claude Sonnet out-of-the-box.",
    skills: [
      { label: "Task Decomposition", icon: "🗂️", area: "reasoning" },
      { label: "Priorisierung", icon: "📊", area: "reasoning" },
      { label: "Langzeitgedächtnis", icon: "💾", area: "memory" },
    ],
    useCases: ["Projektplanung", "Sprint-Planung", "Roadmap-Erstellung", "To-do-Strukturierung"],
  },

  // ── Roadmap (noch zu implementieren) ──────────────────────────────────────
  {
    id: "data-analysis",
    icon: "📊",
    name: "Daten-Analyse-Agent",
    description: "Führt statistische Analysen durch, erstellt Visualisierungen und leitet Handlungsempfehlungen ab.",
    pattern: "react",
    status: "roadmap",
    color: "text-cyan-300",
    bgColor: "bg-cyan-900/20",
    borderColor: "border-cyan-700/50",
    capability: "Statistische Analysen, Visualisierungen und Handlungsempfehlungen",
    implementation: "Benötigt: Python Code-Interpreter (Sandbox), Datenbank-Abfragen, Chart-Rendering (z.B. matplotlib / Recharts)",
    skills: [
      { label: "Python Execution", icon: "🐍", area: "tools" },
      { label: "Datenbank-Abfragen", icon: "🗄️", area: "tools" },
      { label: "Statistik-Reasoning", icon: "📐", area: "reasoning" },
      { label: "Budget-Limits", icon: "💰", area: "guardrails" },
    ],
    useCases: ["KPI-Berichte", "Umsatzprognosen", "Nutzungsanalysen", "Excel-Auswertungen"],
  },
  {
    id: "communication",
    icon: "📧",
    name: "Kommunikations-Agent",
    description: "Verwaltet E-Mails, Kalender und CRM-Einträge. Antwortet kontextuell und plant Termine autonom.",
    pattern: "react",
    status: "roadmap",
    color: "text-purple-300",
    bgColor: "bg-purple-900/20",
    borderColor: "border-purple-700/50",
    capability: "E-Mails verfassen, Termine planen und CRM-Einträge verwalten",
    implementation: "Benötigt: SMTP-Integration (Brevo), Google Calendar OAuth, CRM-API-Anbindung",
    skills: [
      { label: "E-Mail API (Brevo)", icon: "📬", area: "tools" },
      { label: "Google Calendar", icon: "📅", area: "tools" },
      { label: "CRM-Zugriff", icon: "👥", area: "tools" },
      { label: "Ton-Anpassung", icon: "🎭", area: "guardrails" },
    ],
    useCases: ["E-Mail-Triage", "Meeting-Planung", "Follow-up-Automatisierung", "Terminbuchung"],
  },
  {
    id: "speech",
    icon: "🎙️",
    name: "Sprach-Agent",
    description: "Verarbeitet Spracheingaben, transkribiert Gespräche und unterstützt beim Diktieren.",
    pattern: "react",
    status: "roadmap",
    color: "text-pink-300",
    bgColor: "bg-pink-900/20",
    borderColor: "border-pink-700/50",
    capability: "Voice-to-Text, Transkription und Sprachsteuerung",
    implementation: "Benötigt: OpenAI Whisper API (Schlüssel vorhanden), Mikrofon-Capture im Browser, Audio-Upload Endpunkt",
    skills: [
      { label: "Whisper (OpenAI)", icon: "🎤", area: "tools" },
      { label: "Sprach-Erkennung", icon: "👂", area: "tools" },
      { label: "Text-Strukturierung", icon: "📋", area: "reasoning" },
    ],
    useCases: ["Diktat & Transkription", "Meeting-Protokolle", "Sprachbefehle", "Barrierefreiheit"],
  },
  {
    id: "automation",
    icon: "♾️",
    name: "Automatisierungs-Agent",
    description: "Plant, erstellt und optimiert n8n-Workflows und Prozessautomatisierungen selbstständig.",
    pattern: "plan-execute",
    status: "roadmap",
    color: "text-lime-300",
    bgColor: "bg-lime-900/20",
    borderColor: "border-lime-700/50",
    capability: "n8n-Workflows planen, optimieren und auslösen",
    implementation: "Benötigt: n8n API-Integration für Workflow-Erstellung, Tool-Definition für Workflow-Trigger",
    skills: [
      { label: "n8n Workflow-Steuerung", icon: "⚡", area: "tools" },
      { label: "API-Interaktion", icon: "🔌", area: "tools" },
      { label: "Prozess-Analyse", icon: "🗂️", area: "reasoning" },
      { label: "Task Decomposition", icon: "🧩", area: "reasoning" },
    ],
    useCases: ["Workflow-Erstellung", "Prozessoptimierung", "API-Integrationen", "Daten-Pipelines"],
  },
  {
    id: "knowledge-base",
    icon: "🧠",
    name: "Wissensdatenbank-Agent",
    description: "Durchsucht und beantwortet Fragen aus einer kundenspezifischen Wissensdatenbank.",
    pattern: "react",
    status: "roadmap",
    color: "text-indigo-300",
    bgColor: "bg-indigo-900/20",
    borderColor: "border-indigo-700/50",
    capability: "Suche und Beantwortung aus eigener Wissensdatenbank (RAG)",
    implementation: "Benötigt: Pro-Kunde Qdrant-Collection für eigene Dokumente, Upload-UI, Retrieval-Tool",
    skills: [
      { label: "RAG / Vektorsuche", icon: "🔍", area: "memory" },
      { label: "Langzeitgedächtnis", icon: "💾", area: "memory" },
      { label: "Quellen-Belegung", icon: "📌", area: "reasoning" },
    ],
    useCases: ["Interne Wissensbasis", "FAQ-Systeme", "Onboarding", "Compliance-Wissen"],
  },
  {
    id: "support",
    icon: "🎧",
    name: "Support-Agent",
    description: "Beantwortet Kundenfragen kontextuell, eskaliert bei Bedarf und lernt aus jeder Interaktion.",
    pattern: "react",
    status: "roadmap",
    color: "text-pink-300",
    bgColor: "bg-pink-900/20",
    borderColor: "border-pink-700/50",
    capability: "Kundenanfragen beantworten und bei Bedarf eskalieren",
    implementation: "Benötigt: Ticket-System-Integration, Wissensdatenbank-Agent, Eskalations-Routing",
    skills: [
      { label: "RAG / Wissensbasis", icon: "🧠", area: "memory" },
      { label: "Konversationsgedächtnis", icon: "💬", area: "memory" },
      { label: "Eskalations-Routing", icon: "📢", area: "tools" },
      { label: "Datenschutz-Filter", icon: "🛡️", area: "guardrails" },
    ],
    useCases: ["First-Level-Support", "FAQ-Automation", "Onboarding", "Ticket-Triage"],
  },
  {
    id: "devops",
    icon: "⚙️",
    name: "DevOps-Agent",
    description: "Testet Code in Sandbox-Umgebungen, überwacht Deployments und reagiert auf Alerts.",
    pattern: "multi-agent",
    status: "roadmap",
    color: "text-red-300",
    bgColor: "bg-red-900/20",
    borderColor: "border-red-700/50",
    capability: "Deployments überwachen, Tests ausführen und Incidents beheben",
    implementation: "Benötigt: Docker-in-Docker Sandbox, Shell-Execution-Tool, Alert-Webhook-Integration",
    skills: [
      { label: "Bash / Shell", icon: "🖥️", area: "tools" },
      { label: "Docker-Kontrolle", icon: "🐳", area: "tools" },
      { label: "Test-Execution", icon: "🧪", area: "tools" },
      { label: "Rollback-Logik", icon: "↩️", area: "guardrails" },
    ],
    useCases: ["CI/CD-Pipelines", "Deployment-Überwachung", "Incident Response", "Auto-Rollback"],
  },
];

export function getAgent(id: string): Agent | undefined {
  return AGENTS.find(a => a.id === id);
}
