export type WorkflowPattern = "react" | "plan-execute" | "multi-agent";
export type AgentStatus = "active" | "beta" | "planned";

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
  /** Kurzbeschreibung der Fähigkeit die im System-Prompt erscheint */
  capability: string;
}

export const AGENTS: Agent[] = [
  {
    id: "research",
    icon: "🔍",
    name: "Forschungs-Agent",
    description: "Durchsucht das Web, extrahiert Informationen und erstellt fundierte Berichte aus Echtzeit-Quellen.",
    pattern: "react",
    status: "active",
    color: "text-blue-300",
    bgColor: "bg-blue-900/20",
    borderColor: "border-blue-700/50",
    capability: "Web-Recherche und Faktenprüfung in Echtzeit",
    skills: [
      { label: "Web Browsing", icon: "🌐", area: "tools" },
      { label: "RAG / Vektorsuche", icon: "🧠", area: "memory" },
      { label: "Quellen-Validierung", icon: "✅", area: "reasoning" },
      { label: "Zusammenfassung", icon: "📝", area: "reasoning" },
    ],
    useCases: ["Marktanalysen", "Fact-Checking", "Wettbewerbsbeobachtung", "Nachrichten-Monitoring"],
  },
  {
    id: "ki-chat",
    icon: "💬",
    name: "KI-Chat-Agent",
    description: "Vielseitiger Gesprächs- und Beratungsagent für Fragen, Texterstellung, Brainstorming und Entscheidungshilfe.",
    pattern: "react",
    status: "active",
    color: "text-purple-300",
    bgColor: "bg-purple-900/20",
    borderColor: "border-purple-700/50",
    capability: "Intelligente Konversation, Texterstellung und Beratung",
    skills: [
      { label: "Konversationsgedächtnis", icon: "💬", area: "memory" },
      { label: "Kontextverständnis", icon: "🧩", area: "reasoning" },
      { label: "Texterstellung", icon: "✍️", area: "tools" },
      { label: "Ton-Anpassung", icon: "🎭", area: "guardrails" },
    ],
    useCases: ["Beratungsgespräche", "Textentwürfe", "Brainstorming", "Entscheidungshilfe", "Q&A"],
  },
  {
    id: "document",
    icon: "📄",
    name: "Dokument-Analyse-Agent",
    description: "Analysiert, fasst zusammen und extrahiert strukturierte Daten aus PDFs, Word-Dateien und Texten.",
    pattern: "react",
    status: "active",
    color: "text-orange-300",
    bgColor: "bg-orange-900/20",
    borderColor: "border-orange-700/50",
    capability: "Analyse und Zusammenfassung von PDFs, Word- und Textdokumenten",
    skills: [
      { label: "PDF / Word Parsing", icon: "📑", area: "tools" },
      { label: "RAG / Vektorsuche", icon: "🧠", area: "memory" },
      { label: "Daten-Extraktion", icon: "🔎", area: "reasoning" },
      { label: "Zusammenfassung", icon: "📝", area: "reasoning" },
      { label: "Datenschutz-Filter", icon: "🛡️", area: "guardrails" },
    ],
    useCases: ["Vertrags-Analyse", "Rechnungs-Verarbeitung", "Protokoll-Auswertung", "Due Diligence"],
  },
  {
    id: "speech",
    icon: "🎙️",
    name: "Sprach-Agent",
    description: "Verarbeitet Spracheingaben, transkribiert Gespräche und unterstützt beim Diktieren.",
    pattern: "react",
    status: "beta",
    color: "text-pink-300",
    bgColor: "bg-pink-900/20",
    borderColor: "border-pink-700/50",
    capability: "Voice-to-Text, Transkription und Sprachsteuerung",
    skills: [
      { label: "Voice-to-Text", icon: "🎤", area: "tools" },
      { label: "Sprach-Erkennung", icon: "👂", area: "tools" },
      { label: "Text-Strukturierung", icon: "📋", area: "reasoning" },
      { label: "Sprach-Filter", icon: "🛡️", area: "guardrails" },
    ],
    useCases: ["Diktat & Transkription", "Meeting-Protokolle", "Sprachbefehle", "Barrierefreiheit"],
  },
  {
    id: "automation",
    icon: "♾️",
    name: "Automatisierungs-Agent",
    description: "Plant, dokumentiert und optimiert n8n-Workflows und Prozessautomatisierungen.",
    pattern: "plan-execute",
    status: "active",
    color: "text-lime-300",
    bgColor: "bg-lime-900/20",
    borderColor: "border-lime-700/50",
    capability: "n8n-Workflows planen, optimieren und auslösen",
    skills: [
      { label: "n8n Workflow-Steuerung", icon: "⚡", area: "tools" },
      { label: "API-Interaktion", icon: "🔌", area: "tools" },
      { label: "Prozess-Analyse", icon: "🗂️", area: "reasoning" },
      { label: "Task Decomposition", icon: "🧩", area: "reasoning" },
    ],
    useCases: ["Workflow-Erstellung", "Prozessoptimierung", "API-Integrationen", "Daten-Pipelines"],
  },
  {
    id: "translation",
    icon: "🌐",
    name: "Übersetzungs-Agent",
    description: "Übersetzt Texte in alle grossen Sprachen mit Fokus auf Natürlichkeit und kulturelle Angemessenheit.",
    pattern: "react",
    status: "active",
    color: "text-cyan-300",
    bgColor: "bg-cyan-900/20",
    borderColor: "border-cyan-700/50",
    capability: "Mehrsprachige Übersetzung mit kulturellem Kontext",
    skills: [
      { label: "Mehrsprachige LLMs", icon: "🗣️", area: "tools" },
      { label: "Kontextverständnis", icon: "🧩", area: "reasoning" },
      { label: "Stil-Anpassung", icon: "🎭", area: "reasoning" },
      { label: "Qualitäts-Check", icon: "✅", area: "guardrails" },
    ],
    useCases: ["Dokument-Übersetzung", "Website-Lokalisierung", "Kundenkommunikation"],
  },
  {
    id: "knowledge-base",
    icon: "🧠",
    name: "Wissensdatenbank-Agent",
    description: "Durchsucht und beantwortet Fragen aus einer persönlichen oder organisationalen Wissensdatenbank.",
    pattern: "react",
    status: "active",
    color: "text-indigo-300",
    bgColor: "bg-indigo-900/20",
    borderColor: "border-indigo-700/50",
    capability: "Suche und Beantwortung aus eigener Wissensdatenbank (RAG)",
    skills: [
      { label: "RAG / Vektorsuche", icon: "🔍", area: "memory" },
      { label: "Langzeitgedächtnis", icon: "💾", area: "memory" },
      { label: "Quellen-Belegung", icon: "📌", area: "reasoning" },
      { label: "Lücken-Erkennung", icon: "🔎", area: "reasoning" },
    ],
    useCases: ["Interne Wissensbasis", "FAQ-Systeme", "Onboarding-Wissen", "Compliance-Wissen"],
  },
  {
    id: "code",
    icon: "💻",
    name: "Code-Agent",
    description: "Schreibt, reviewed und führt Code aus. Integriert sich in Git und kann CI-Pipelines steuern.",
    pattern: "plan-execute",
    status: "active",
    color: "text-green-300",
    bgColor: "bg-green-900/20",
    borderColor: "border-green-700/50",
    capability: "Code schreiben, reviewen und ausführen",
    skills: [
      { label: "Code Execution", icon: "⚡", area: "tools" },
      { label: "Git Integration", icon: "🔀", area: "tools" },
      { label: "Self-Reflection", icon: "🪞", area: "reasoning" },
      { label: "Task Decomposition", icon: "🗂️", area: "reasoning" },
    ],
    useCases: ["Feature-Entwicklung", "Bug-Fixing", "Code-Review", "Refactoring"],
  },
  {
    id: "planning",
    icon: "🗺️",
    name: "Planungs-Agent",
    description: "Zerlegt komplexe Ziele in Teilaufgaben, priorisiert und koordiniert andere Agenten.",
    pattern: "plan-execute",
    status: "active",
    color: "text-yellow-300",
    bgColor: "bg-yellow-900/20",
    borderColor: "border-yellow-700/50",
    capability: "Komplexe Ziele planen, priorisieren und koordinieren",
    skills: [
      { label: "Task Decomposition", icon: "🗂️", area: "reasoning" },
      { label: "Self-Reflection", icon: "🪞", area: "reasoning" },
      { label: "Langzeitgedächtnis", icon: "💾", area: "memory" },
      { label: "Agenten-Koordination", icon: "🤝", area: "tools" },
    ],
    useCases: ["Projektplanung", "Sprint-Planung", "Roadmap-Erstellung"],
  },
  {
    id: "communication",
    icon: "📧",
    name: "Kommunikations-Agent",
    description: "Verwaltet E-Mails, Kalender und CRM-Einträge. Antwortet kontextuell und plant Termine autonom.",
    pattern: "react",
    status: "beta",
    color: "text-purple-300",
    bgColor: "bg-purple-900/20",
    borderColor: "border-purple-700/50",
    capability: "E-Mails verfassen, Termine planen und CRM-Einträge verwalten",
    skills: [
      { label: "E-Mail API", icon: "📬", area: "tools" },
      { label: "Kalender-Integration", icon: "📅", area: "tools" },
      { label: "CRM-Zugriff", icon: "👥", area: "tools" },
      { label: "Ton-Anpassung", icon: "🎭", area: "guardrails" },
    ],
    useCases: ["E-Mail-Triage", "Meeting-Planung", "Follow-up-Automatisierung"],
  },
  {
    id: "data-analysis",
    icon: "📊",
    name: "Daten-Analyse-Agent",
    description: "Führt statistische Analysen durch, erstellt Visualisierungen und leitet Handlungsempfehlungen ab.",
    pattern: "react",
    status: "beta",
    color: "text-cyan-300",
    bgColor: "bg-cyan-900/20",
    borderColor: "border-cyan-700/50",
    capability: "Statistische Analysen, Visualisierungen und Handlungsempfehlungen",
    skills: [
      { label: "Python Execution", icon: "🐍", area: "tools" },
      { label: "Datenbank-Abfragen", icon: "🗄️", area: "tools" },
      { label: "Statistik-Reasoning", icon: "📐", area: "reasoning" },
      { label: "Budget-Limits", icon: "💰", area: "guardrails" },
    ],
    useCases: ["KPI-Berichte", "Umsatzprognosen", "Nutzungsanalysen"],
  },
  {
    id: "devops",
    icon: "⚙️",
    name: "DevOps-Agent",
    description: "Testet Code in Sandbox-Umgebungen, überwacht Deployments und reagiert auf Alerts.",
    pattern: "multi-agent",
    status: "planned",
    color: "text-red-300",
    bgColor: "bg-red-900/20",
    borderColor: "border-red-700/50",
    capability: "Deployments überwachen, Tests ausführen und Incidents beheben",
    skills: [
      { label: "Bash / Shell", icon: "🖥️", area: "tools" },
      { label: "Docker-Kontrolle", icon: "🐳", area: "tools" },
      { label: "Test-Execution", icon: "🧪", area: "tools" },
      { label: "Rollback-Logik", icon: "↩️", area: "guardrails" },
    ],
    useCases: ["CI/CD-Pipelines", "Deployment-Überwachung", "Incident Response"],
  },
  {
    id: "support",
    icon: "🎧",
    name: "Support-Agent",
    description: "Beantwortet Kundenfragen kontextuell, eskaliert bei Bedarf und lernt aus jeder Interaktion.",
    pattern: "react",
    status: "planned",
    color: "text-pink-300",
    bgColor: "bg-pink-900/20",
    borderColor: "border-pink-700/50",
    capability: "Kundenanfragen beantworten und bei Bedarf eskalieren",
    skills: [
      { label: "RAG / Wissensbasis", icon: "🧠", area: "memory" },
      { label: "Konversationsgedächtnis", icon: "💬", area: "memory" },
      { label: "Eskalations-Routing", icon: "📢", area: "tools" },
      { label: "Datenschutz-Filter", icon: "🛡️", area: "guardrails" },
    ],
    useCases: ["First-Level-Support", "FAQ-Automation", "Onboarding"],
  },
];

export function getAgent(id: string): Agent | undefined {
  return AGENTS.find(a => a.id === id);
}
