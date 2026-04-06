"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL, N8N_URL } from "@/lib/config";

interface CredentialDetail {
  id: string;
  name: string;
  type: string;
  data: Record<string, string | number | boolean>;
}

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  tags?: { name: string }[];
  credentialDetails?: CredentialDetail[];
}

interface WorkflowMeta {
  icon: string;
  description: string;
  requires: { label: string; value: string }[];
  returns: string;
}

// Statische Metadaten pro Workflow-Name
const WORKFLOW_META: Record<string, WorkflowMeta> = {
  "service-export-pdf": {
    icon: "📄",
    description: "Konvertiert Inhalte (HTML, Text) in PDF-Dokumente via externem Konvertierungsdienst.",
    requires: [
      { label: "Basis-URL", value: "URL des PDF-Konvertierungsdienstes" },
      { label: "Auth", value: "API-Key des Dienstes (falls erforderlich)" },
    ],
    returns: "PDF-Datei als Binär-Download oder öffentliche Download-URL",
  },
  "Buddy — Email Überwachung": {
    icon: "📬",
    description: "Überwacht ein IMAP-Postfach im definierten Intervall und leitet neue E-Mails an den Buddy weiter.",
    requires: [
      { label: "IMAP-Server", value: "Hostname & Port (z. B. imap.gmail.com:993)" },
      { label: "E-Mail", value: "Kunden-E-Mail-Adresse" },
      { label: "Passwort", value: "App-Passwort oder IMAP-Passwort" },
    ],
    returns: "Neue E-Mails mit Absender, Betreff, Datum und Nachrichteninhalt",
  },
  "ai-dev-orchestrator-n8n": {
    icon: "🔧",
    description: "Interne Brücke zwischen Dev Orchestrator und n8n. Nimmt Webhook-Aufrufe entgegen und leitet sie ans Backend weiter.",
    requires: [
      { label: "Intern", value: "Keine externe Konfiguration nötig" },
      { label: "Backend-URL", value: "Automatisch via BACKEND_URL" },
    ],
    returns: "HTTP-Antwort vom Backend (Status + JSON-Body)",
  },
  "Buddy — Wetter": {
    icon: "🌤",
    description: "Ruft täglich aktuelle Wetterdaten ab und informiert den zugewiesenen Buddy mit Temperatur und Wetterlagebericht.",
    requires: [
      { label: "API-Key", value: "OpenWeather API-Key" },
      { label: "Standort", value: "Stadtname (z. B. Bern) via Umgebungsvariable WEATHER_CITY" },
    ],
    returns: "Temperatur, Wetterlage, Luftfeuchtigkeit, Windgeschwindigkeit",
  },
  "Buddy — Behördenmitteilungen": {
    icon: "🏛",
    description: "Liest RSS-Feeds von Schweizer Behörden (Gemeinde, Kanton, Bund) und filtert neue Mitteilungen für den Buddy.",
    requires: [
      { label: "RSS-URLs", value: "Feed-URLs der Behörden (im Workflow konfiguriert)" },
      { label: "Region", value: "Kundenregion via CUSTOMER_REGION" },
    ],
    returns: "Neue Behördenmitteilungen mit Titel, Datum und direktem Link",
  },
  "service-notify-slack": {
    icon: "💬",
    description: "Sendet formatierte Benachrichtigungen an einen Slack-Kanal, ausgelöst via Webhook vom Backend.",
    requires: [
      { label: "Slack Webhook-URL", value: "Incoming Webhook URL des Slack-Workspace" },
      { label: "Kanal", value: "Ziel-Kanal (z. B. #alerts)" },
    ],
    returns: "Versandbestätigung (ok/Fehler) an den aufrufenden Dienst",
  },
  "Buddy — Kalender Erinnerungen": {
    icon: "📅",
    description: "Prüft Google Calendar stündlich auf bevorstehende Termine und erinnert den Buddy rechtzeitig daran.",
    requires: [
      { label: "Google OAuth", value: "Google-Konto-Zugangsdaten (in n8n konfiguriert)" },
      { label: "Kalender-ID", value: "Ziel-Kalender des Kunden (primary oder spezifische ID)" },
      { label: "Vorlaufzeit", value: "Erinnerungszeitfenster in Minuten (im Workflow)" },
    ],
    returns: "Bevorstehende Termine mit Titel, Datum, Uhrzeit und Ort",
  },
  "service-send-sms": {
    icon: "📱",
    description: "Versendet SMS-Nachrichten an eine Ziel-Nummer via externem SMS-Gateway (z. B. Twilio, ASPSMS).",
    requires: [
      { label: "SMS-Provider", value: "API-Key und API-URL des SMS-Gateways" },
      { label: "Absender-Nummer", value: "Registrierte Absender-Telefonnummer" },
      { label: "Empfänger", value: "Telefonnummer des Kunden (im Request mitgeschickt)" },
    ],
    returns: "Versandstatus und Message-ID des SMS-Providers",
  },
  "service-send-email": {
    icon: "✉️",
    description: "Versendet E-Mails über den konfigurierten SMTP-Server, ausgelöst via Webhook vom Backend.",
    requires: [
      { label: "SMTP-Server", value: "Hostname, Port (z. B. smtp.gmail.com:587)" },
      { label: "Zugangsdaten", value: "Benutzername + App-Passwort (in n8n konfiguriert)" },
      { label: "Absender", value: "Absender-E-Mail-Adresse" },
    ],
    returns: "Versandbestätigung mit Zeitstempel an den aufrufenden Dienst",
  },
  "Buddy — Nachrichten": {
    icon: "📰",
    description: "Aggregiert aktuelle Nachrichten aus konfigurierten Quellen und liefert dem Buddy eine tägliche Zusammenfassung.",
    requires: [
      { label: "News-Quellen", value: "RSS-Feeds oder News-API-Key (im Workflow)" },
      { label: "Themen", value: "Interessen-Tags des Kunden (optional)" },
    ],
    returns: "Schlagzeilen mit Titel, Quelle und Link — gefiltert nach Relevanz",
  },
};

function getFallbackMeta(wf: N8nWorkflow): WorkflowMeta {
  const isService = wf.name.startsWith("service-");
  const isBuddy = wf.name.startsWith("Buddy");
  return {
    icon: isService ? "⚙️" : isBuddy ? "🤖" : "🔗",
    description: `n8n-Workflow: ${wf.name}`,
    requires: [{ label: "Konfiguration", value: "Im n8n-Editor einsehbar" }],
    returns: "Abhängig von der Workflow-Konfiguration",
  };
}

export default function N8nWorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    const u = getSession();
    if (!u || u.role !== "admin") router.replace("/login");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/workflows`);
      const data = await res.json();
      setWorkflows(data?.data ?? data ?? []);
    } catch {
      setError("n8n nicht erreichbar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (wf: N8nWorkflow) => {
    setToggling(wf.id);
    try {
      const action = wf.active ? "deactivate" : "activate";
      await apiFetch(`${BACKEND_URL}/v1/workflows/${wf.id}/${action}`, { method: "POST" });
      setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, active: !w.active } : w));
    } catch {
      alert("Fehler beim Umschalten");
    } finally {
      setToggling(null);
    }
  };


  const active = workflows.filter(w => w.active).length;

  return (
    <div className="p-4 md:p-8 space-y-6">

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold">🔗 n8n Workflows</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {loading ? "Wird geladen…" : `${workflows.length} Workflows · ${active} aktiv`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs bg-gray-800 border border-gray-700 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            ↻ Aktualisieren
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <span className="animate-spin text-2xl mr-3">⏳</span> Workflows werden geladen…
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <span className="text-3xl">⚠️</span>
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={load} className="text-xs bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors">
              Erneut versuchen
            </button>
          </div>
        )}

        {!loading && !error && workflows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-500">
            <span className="text-3xl">📭</span>
            <p className="text-sm">Keine n8n-Workflows gefunden.</p>
          </div>
        )}

        {!loading && !error && workflows.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {workflows.map(wf => {
              const meta = WORKFLOW_META[wf.name] ?? getFallbackMeta(wf);
              return (
                <div key={wf.id} className="bg-gray-900 border border-gray-700 rounded-2xl p-5 flex flex-col gap-4 hover:border-gray-500 transition-colors">

                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <span className="text-3xl shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={`${N8N_URL}/workflow/${wf.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-white hover:text-blue-400 transition-colors leading-tight block"
                      >
                        {wf.name} <span className="text-gray-600 text-xs">↗</span>
                      </a>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          wf.active
                            ? "bg-green-500/10 text-green-300 border-green-500/20"
                            : "bg-gray-600/30 text-gray-500 border-gray-600/20"
                        }`}>
                          {wf.active ? "● Aktiv" : "○ Inaktiv"}
                        </span>
                        {wf.tags?.map(t => (
                          <span key={t.name} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{t.name}</span>
                        ))}
                        {wf.updatedAt && (
                          <span className="text-xs text-gray-600">
                            Aktualisiert {new Date(wf.updatedAt).toLocaleDateString("de-CH")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggle(wf)}
                      disabled={toggling === wf.id}
                      className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                        wf.active
                          ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                          : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                      }`}
                    >
                      {toggling === wf.id ? "…" : wf.active ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </div>

                  {/* Beschreibung */}
                  <p className="text-sm text-gray-400 leading-relaxed">{meta.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Benötigt */}
                    <div className="bg-gray-800/60 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Benötigt</p>
                      {meta.requires.map((r, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                          <span className="text-xs text-blue-400 font-medium">{r.label}</span>
                          <span className="text-xs text-gray-500">{r.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Gibt zurück */}
                    <div className="bg-gray-800/60 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gibt zurück</p>
                      <span className="text-xs text-gray-400 leading-relaxed block">{meta.returns}</span>
                    </div>
                  </div>

                  {/* Konfigurierte Zugangsdaten aus n8n */}
                  {wf.credentialDetails && wf.credentialDetails.length > 0 && (
                    <div className="border-t border-gray-700/50 pt-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Konfiguration in n8n</p>
                      {wf.credentialDetails.map(cred => (
                        <div key={cred.id} className="bg-gray-800/40 rounded-xl p-3">
                          <p className="text-xs text-yellow-400 font-medium mb-2">
                            {cred.name} <span className="text-gray-600 font-normal">({cred.type})</span>
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(cred.data).map(([k, v]) => (
                              <div key={k} className="flex flex-col">
                                <span className="text-xs text-gray-500">{k}</span>
                                <span className="text-xs text-gray-300 font-mono">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

    </div>
  );
}
