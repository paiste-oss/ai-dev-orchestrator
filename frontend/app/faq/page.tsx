"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: React.ReactNode;
  tag?: string;
}

interface FaqSection {
  title: string;
  icon: string;
  items: FaqItem[];
}

// ── FAQ Content ───────────────────────────────────────────────────────────────

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: "Erste Schritte",
    icon: "🚀",
    items: [
      {
        q: "Was ist Baddi und wie funktioniert er?",
        a: (
          <span>
            Baddi ist dein persönlicher KI-Assistent. Du chats mit ihm wie mit einer Person — er kennt deine Dokumente, deine Erinnerungen und deinen Alltag. Baddi antwortet in deiner Sprache, hilft beim Formulieren, Suchen, Planen und Organisieren. Alle Daten bleiben bei dir, gespeichert auf Servern in der Schweiz.
          </span>
        ),
        tag: "basics",
      },
      {
        q: "Wie ändere ich den Namen oder die Sprache von Baddi?",
        a: (
          <span>
            Schreib Baddi einfach: <em>„Nenn dich ab jetzt Max"</em> oder <em>„Antworte auf Englisch"</em>. Baddi setzt die Änderung sofort um. Dauerhaft speichern kannst du Name und Sprache auch in der <strong>Design-Kachel</strong> auf der Startseite.
          </span>
        ),
        tag: "basics",
      },
      {
        q: "Wie lade ich Dokumente hoch, damit Baddi sie kennt?",
        a: (
          <span>
            Öffne das <strong>Dokumente-Fenster</strong> (→ über den <code>+</code>-Button im Chat). Dateien per Drag & Drop oder Upload-Button hochladen. Klicke auf das 🤖-Symbol beim Dokument, um es für Baddi lesbar zu machen. Baddi findet danach relevante Stellen automatisch beim Chatten.
          </span>
        ),
        tag: "basics",
      },
    ],
  },
  {
    title: "Baddi E-Mail",
    icon: "✉️",
    items: [
      {
        q: "Was ist die Baddi-E-Mail-Adresse und wozu dient sie?",
        a: (
          <span>
            Jeder Baddi-Nutzer erhält eine persönliche Adresse der Form <strong>vorname.xxxx@mail.baddi.ch</strong>. Du kannst E-Mails direkt an diese Adresse senden — Baddi liest sie, antwortet automatisch und speichert relevante Infos als Erinnerung. Ideal um Baddi schnell eine Notiz oder Aufgabe zu schicken, auch unterwegs.
          </span>
        ),
      },
      {
        q: "Wie finde ich meine Baddi-E-Mail-Adresse?",
        a: (
          <span>
            Öffne das <strong>E-Mail-Fenster</strong> über den <code>+</code>-Button im Chat oder schreib Baddi: <em>„Was ist meine Baddi-E-Mail-Adresse?"</em>. Die Adresse steht auch in den Einstellungen unter <strong>Profil</strong>.
          </span>
        ),
      },
      {
        q: "Kann ich auch E-Mails von anderen Absendern erhalten?",
        a: (
          <span>
            Ja. Im E-Mail-Fenster siehst du alle eingehenden Nachrichten. Klicke auf <strong>Vertrauen</strong> bei einem Absender, damit Baddi dessen E-Mails lesen und beantworten darf. Unbekannte Absender landen zunächst als unvertrauenswürdig — du entscheidest, wer Zugang hat.
          </span>
        ),
      },
      {
        q: "Wie antwortet Baddi auf E-Mails?",
        a: (
          <span>
            Bei vertrauenswürdigen Absendern klicke im E-Mail-Fenster auf <strong>Baddi fragen</strong> — Baddi erstellt einen Antwort-Entwurf. Du kannst ihn verfeinern (<em>„Mach es kürzer"</em>) und dann mit <strong>Ausführen</strong> absenden. Alternativ kannst du selbst direkt antworten.
          </span>
        ),
      },
    ],
  },
  {
    title: "Kalender & Termine",
    icon: "📅",
    items: [
      {
        q: "Wie binde ich den Baddi-Kalender ins iPhone oder Android ein?",
        a: (
          <div className="space-y-2">
            <p>Baddi stellt einen <strong>CalDAV-Feed</strong> bereit. So richtest du ihn ein:</p>
            <p className="font-semibold text-white mt-2">iPhone / iPad (iOS):</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Einstellungen → Kalender → Accounts → Account hinzufügen</li>
              <li><strong>Andere</strong> → CalDAV-Account hinzufügen</li>
              <li>Server, Benutzername und Passwort eingibst du von Baddi — schreib ihm: <em>„Gib mir die CalDAV-Zugangsdaten"</em></li>
            </ol>
            <p className="font-semibold text-white mt-2">Android (Google Kalender):</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>App <strong>DAVx⁵</strong> (kostenlos, Play Store) installieren</li>
              <li>Account mit der CalDAV-URL von Baddi einrichten</li>
              <li>Synchronisation aktivieren — Termine erscheinen im Google Kalender</li>
            </ol>
            <p className="font-semibold text-white mt-2">Mac / Outlook:</p>
            <p>Kalender-App → Ablage → Neues CalDAV-Abonnement → URL einfügen.</p>
          </div>
        ),
      },
      {
        q: "Wie füge ich im Chat einen Termin hinzu?",
        a: (
          <span>
            Schreib Baddi einfach: <em>„Trag am Freitag um 14 Uhr einen Zahnarzt-Termin ein"</em>. Baddi legt den Termin direkt an — kein Formular nötig. Du siehst ihn sofort im Kalender-Fenster.
          </span>
        ),
      },
    ],
  },
  {
    title: "Literatur & Dokumente",
    icon: "📚",
    items: [
      {
        q: "Wie importiere ich meine EndNote-Bibliothek in Baddi?",
        a: (
          <div className="space-y-2">
            <p>In zwei Schritten — dauert wenige Minuten:</p>
            <p className="font-semibold text-white">Schritt 1 — Metadaten importieren:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>EndNote öffnen → <strong>Strg+A</strong> (alle Einträge auswählen)</li>
              <li><strong>File → Export…</strong> → Format: <em>EndNote XML (.xml)</em></li>
              <li>Im Baddi <strong>Literatur-Fenster</strong> auf <strong>XML/RIS</strong> klicken und die Datei hochladen</li>
            </ol>
            <p className="font-semibold text-white mt-2">Schritt 2 — PDFs importieren:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Den PDF-Ordner deiner EndNote-Bibliothek (<code>Bibliothek.Data/PDF/</code>) als ZIP komprimieren</li>
              <li>Im Literatur-Fenster auf <strong>PDFs (ZIP)</strong> klicken und das ZIP hochladen</li>
              <li>Baddi ordnet die PDFs automatisch den Einträgen zu — per DOI, Dateiname oder Titeltext</li>
            </ol>
            <p className="text-gray-500 text-xs mt-1">Nicht zugeordnete PDFs werden im Ergebnis-Panel aufgelistet und können manuell angehängt werden.</p>
          </div>
        ),
      },
      {
        q: "Was kann Baddi mit meiner Literatur tun?",
        a: (
          <span>
            Baddi durchsucht deine Einträge semantisch — frag ihn z.B.: <em>„Welche Paper habe ich zum Thema KI und Medizin?"</em> oder <em>„Fasse mir den Abstract von Müllers Studie zusammen"</em>. Abstracts, Notizen und PDF-Inhalte werden beim Chat automatisch berücksichtigt.
          </span>
        ),
      },
      {
        q: "Welche Dateiformate kann ich hochladen?",
        a: (
          <span>
            PDF, Word (.docx/.doc), Excel (.xlsx/.xls), PowerPoint (.pptx/.ppt), CSV, Text (.txt/.md), JSON, XML, HTML und Log-Dateien. Maximale Dateigrösse: <strong>50 MB</strong> pro Datei.
          </span>
        ),
      },
    ],
  },
  {
    title: "Abo & Bezahlung",
    icon: "💳",
    items: [
      {
        q: "Welche Abo-Pläne gibt es?",
        a: (
          <div className="space-y-1">
            <p>Baddi bietet drei Pläne:</p>
            <ul className="list-disc list-inside ml-1 space-y-0.5">
              <li><strong>Basis</strong> — CHF 19/Monat: Grundfunktionen, 500.000 Tokens/Monat</li>
              <li><strong>Komfort</strong> — CHF 49/Monat: mehr Tokens, Speicher, Priorität</li>
              <li><strong>Premium</strong> — CHF 99/Monat: maximale Kapazität, alle Funktionen</li>
            </ul>
            <p className="text-gray-500 text-xs mt-1">Jährliche Zahlung ist günstiger. Abo jederzeit kündbar.</p>
          </div>
        ),
      },
      {
        q: "Wie bezahle ich und wie kündige ich?",
        a: (
          <span>
            Zahlung erfolgt sicher über <strong>Stripe</strong> (Kreditkarte, SEPA, TWINT). Verwalten oder kündigen kannst du dein Abo unter <strong>Einstellungen → Abo & Rechnungen</strong>. Die Kündigung gilt zum Ende der laufenden Periode.
          </span>
        ),
      },
      {
        q: "Was passiert wenn mein Token-Kontingent aufgebraucht ist?",
        a: (
          <span>
            Baddi lädt dich auf einen kostenpflichtigen <strong>Wallet-Kredit</strong> hinzuweisen. Du kannst jederzeit Guthaben aufladen (unter Einstellungen → Wallet) oder auf einen höheren Plan wechseln. Ohne Guthaben pausiert die KI-Funktion bis zum nächsten Abrechnungszeitraum.
          </span>
        ),
      },
      {
        q: "Wo finde ich meine Rechnungen?",
        a: (
          <span>
            Unter <strong>Einstellungen → Abo & Rechnungen</strong> findest du alle bisherigen Rechnungen als PDF zum Download. Rechnungen werden automatisch per E-Mail zugesandt.
          </span>
        ),
      },
    ],
  },
  {
    title: "Datenschutz & Sicherheit",
    icon: "🔒",
    items: [
      {
        q: "Wo werden meine Daten gespeichert?",
        a: (
          <span>
            Alle Daten werden auf Servern bei <strong>Infomaniak in der Schweiz</strong> gespeichert — DSGVO-konform, kein Transfer in Drittländer. Deine Chats, Dokumente und Erinnerungen verlassen die Schweiz nicht.
          </span>
        ),
      },
      {
        q: "Liest jemand meine Chats mit Baddi?",
        a: (
          <span>
            Nein. Chats werden verschlüsselt gespeichert. Kein Mitarbeiter liest deine Konversationen. KI-Anfragen werden über <strong>AWS Bedrock (EU-Region)</strong> verarbeitet — Anthropic nutzt diese Daten nicht für Training.
          </span>
        ),
      },
      {
        q: "Kann ich meine Daten exportieren oder löschen?",
        a: (
          <span>
            Ja. Unter <strong>Einstellungen → Profil</strong> kannst du dein Konto und alle Daten dauerhaft löschen. Für einen vollständigen Datenexport wende dich an <strong>support@baddi.ch</strong> — wir liefern alle deine Daten innerhalb von 30 Tagen.
          </span>
        ),
      },
    ],
  },
  {
    title: "Technische Fragen",
    icon: "⚙️",
    items: [
      {
        q: "Funktioniert Baddi auch ohne Internet?",
        a: (
          <span>
            Nein — Baddi benötigt eine Internetverbindung für die KI-Verarbeitung. Die App lädt aber schnell auch auf mobilen Verbindungen. Eine Offline-Version ist nicht geplant.
          </span>
        ),
      },
      {
        q: "Gibt es eine mobile App?",
        a: (
          <span>
            Baddi ist als <strong>Progressive Web App (PWA)</strong> verfügbar. Öffne <strong>baddi.ch</strong> im Safari (iPhone) oder Chrome (Android) und tippe auf <em>„Zum Home-Bildschirm hinzufügen"</em>. So verhält sich Baddi wie eine native App — ohne App Store.
          </span>
        ),
      },
      {
        q: "Push-Benachrichtigungen funktionieren nicht — was tun?",
        a: (
          <span>
            Stelle sicher, dass du die PWA installiert hast (Startbildschirm-Icon). Gehe in den Browser-Einstellungen zu <strong>baddi.ch → Benachrichtigungen erlauben</strong>. iOS benötigt mindestens iOS 16.4 für Web-Push. Bei Problemen hilft ein Neustart der App.
          </span>
        ),
      },
      {
        q: "Ich habe mein Passwort vergessen — was nun?",
        a: (
          <span>
            Auf der <strong>Login-Seite</strong> auf <em>„Passwort vergessen"</em> klicken. Du erhältst eine E-Mail mit einem Reset-Link (gültig für 1 Stunde). Falls keine E-Mail ankommt, prüfe den Spam-Ordner oder schreib an <strong>support@baddi.ch</strong>.
          </span>
        ),
      },
    ],
  },
];

// ── Accordion Item ────────────────────────────────────────────────────────────

function AccordionItem({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b border-white/6 last:border-0 transition-colors ${open ? "bg-white/3" : "hover:bg-white/2"}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-sm text-white font-medium leading-snug">{item.q}</span>
        <span className={`text-gray-500 shrink-0 mt-0.5 transition-transform ${open ? "rotate-45" : ""}`}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-gray-300 leading-relaxed">
          {item.a}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function FaqContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/chat";
  const [search, setSearch] = useState("");

  const filtered = FAQ_SECTIONS.map(s => ({
    ...s,
    items: s.items.filter(
      i => !search || i.q.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(s => s.items.length > 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.replace(from)} className="text-gray-500 hover:text-white text-xl transition-colors">←</button>
          <div>
            <h1 className="text-xl font-bold text-white">Häufige Fragen</h1>
            <p className="text-xs text-gray-500">Hilfe & Anleitungen für Baddi</p>
          </div>
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Frage suchen…"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-white/20 transition-colors"
        />

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600 text-sm">
            Keine Treffer für „{search}"
          </div>
        )}

        {/* Sections */}
        {filtered.map(section => (
          <div key={section.title} className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/5">
              <span className="text-xl">{section.icon}</span>
              <h2 className="font-semibold text-white">{section.title}</h2>
              <span className="text-[10px] text-gray-600 ml-auto">{section.items.length} Fragen</span>
            </div>
            {section.items.map((item, i) => (
              <AccordionItem key={i} item={item} />
            ))}
          </div>
        ))}

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 pb-4">
          Weitere Fragen? Schreib Baddi direkt oder sende eine E-Mail an{" "}
          <a href="mailto:support@baddi.ch" className="text-gray-400 hover:text-white transition-colors">
            support@baddi.ch
          </a>
        </div>

      </div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <Suspense>
      <FaqContent />
    </Suspense>
  );
}
