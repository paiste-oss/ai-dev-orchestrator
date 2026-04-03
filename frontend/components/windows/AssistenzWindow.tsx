"use client";

import { useState, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";

// Koordinaten in % des iframe-Viewports (left, top)
interface Highlight { x: number; y: number; label?: string }
interface AutoAction {
  type: "navigate" | "click" | "type" | "scroll";
  url?: string;
  x?: number; y?: number;        // Pixel auf 1280×720 Viewport
  text?: string; submit?: boolean;
  direction?: "down" | "up";
}

interface Step {
  label: string;
  detail?: string;
  highlight?: Highlight;         // visuelles Overlay auf iframe (%)
  autoAction?: AutoAction;       // was Baddi automatisch tut
  isLanguageStep?: boolean;      // Sprachauswahl-Schritt — wird bei DE/gsw-Nutzern übersprungen
}

interface Guide {
  title: string;
  steps: Step[];
}

const KNOWN_GUIDES: { match: string; guide: Guide }[] = [
  {
    match: "arbeit.swiss",
    guide: {
      title: "RAV / Arbeitslosigkeit",
      steps: [
        { label: "Kanton wählen", detail: "Wähle deinen Wohnkanton aus der Liste.", highlight: { x: 50, y: 30, label: "Kanton" } },
        { label: "«Anmelden» klicken", detail: "Klicke auf «Zur Anmeldung» oder «Jetzt anmelden».", highlight: { x: 50, y: 50, label: "Anmelden" }, autoAction: { type: "click", x: 640, y: 360 } },
        { label: "Persönliche Daten", detail: "Name, Adresse, AHV-Nummer eingeben.", highlight: { x: 50, y: 45, label: "Daten" } },
        { label: "Angaben zur Stelle", detail: "Letzter Arbeitgeber, Datum der Kündigung.", highlight: { x: 50, y: 58, label: "Stelle" } },
        { label: "Absenden", detail: "Prüfe alle Angaben und sende das Formular ab.", highlight: { x: 55, y: 82, label: "Absenden" } },
      ],
    },
  },
  {
    match: "ahv-iv.ch",
    guide: {
      title: "AHV / IV Anmeldung",
      steps: [
        {
          label: "Sprache wählen",
          detail: "Wähle «Deutsch» oben rechts auf der Seite.",
          highlight: { x: 88, y: 4, label: "Sprache" },
          autoAction: { type: "click", x: 1200, y: 28 },
          isLanguageStep: true,
        },
        {
          label: "«Anmelden» klicken",
          detail: "Klicke auf den blauen Button «Anmelden».",
          highlight: { x: 80, y: 12, label: "Anmelden" },
          autoAction: { type: "click", x: 1050, y: 85 },
        },
        {
          label: "Name eingeben",
          detail: "Gib Vor- und Nachnamen ein — genau so wie im Ausweis.",
          highlight: { x: 35, y: 35, label: "Name" },
        },
        {
          label: "AHV-Nummer eingeben",
          detail: "Die 13-stellige Nummer steht auf deiner Versichertenkarte.",
          highlight: { x: 35, y: 50, label: "AHV-Nr." },
        },
        {
          label: "Geburtsdatum eingeben",
          detail: "Format: TT.MM.JJJJ — z.B. 15.03.1952",
          highlight: { x: 35, y: 65, label: "Datum" },
        },
        {
          label: "Formular absenden",
          detail: "Prüfe alle Angaben und klicke auf «Weiter» oder «Absenden».",
          highlight: { x: 55, y: 85, label: "Absenden" },
          autoAction: { type: "click", x: 720, y: 615 },
        },
      ],
    },
  },
  {
    match: "sbb.ch",
    guide: {
      title: "SBB Konto erstellen",
      steps: [
        {
          label: "«Registrieren» klicken",
          detail: "Oben rechts, neben «Anmelden».",
          highlight: { x: 88, y: 5, label: "Registrieren" },
          autoAction: { type: "click", x: 1180, y: 36 },
        },
        {
          label: "E-Mail-Adresse eingeben",
          detail: "Diese wird dein Benutzername.",
          highlight: { x: 50, y: 35, label: "E-Mail" },
        },
        {
          label: "Passwort wählen",
          detail: "Mindestens 8 Zeichen, ein Grossbuchstabe und eine Zahl.",
          highlight: { x: 50, y: 48, label: "Passwort" },
        },
        {
          label: "Vor- und Nachname eingeben",
          detail: "Genau so wie auf deinem Ausweis.",
          highlight: { x: 50, y: 60, label: "Name" },
        },
        {
          label: "Bestätigungs-E-Mail öffnen",
          detail: "SBB schickt dir eine E-Mail — klicke darin auf «Bestätigen».",
          highlight: { x: 50, y: 40, label: "E-Mail prüfen" },
        },
      ],
    },
  },
  {
    match: "post.ch",
    guide: {
      title: "Post-Konto erstellen",
      steps: [
        {
          label: "«Registrieren» klicken",
          detail: "Oben rechts auf post.ch.",
          highlight: { x: 85, y: 4, label: "Registrieren" },
          autoAction: { type: "click", x: 1100, y: 28 },
        },
        {
          label: "E-Mail-Adresse eingeben",
          detail: "Deine persönliche E-Mail-Adresse.",
          highlight: { x: 50, y: 35, label: "E-Mail" },
        },
        {
          label: "Persönliche Daten ausfüllen",
          detail: "Name, Adresse und Geburtsdatum.",
          highlight: { x: 50, y: 50, label: "Daten" },
        },
        {
          label: "Passwort festlegen",
          detail: "Mindestens 8 Zeichen.",
          highlight: { x: 50, y: 63, label: "Passwort" },
        },
        {
          label: "E-Mail bestätigen",
          detail: "Öffne die E-Mail von der Post und klicke auf den Link.",
          highlight: { x: 50, y: 40, label: "E-Mail" },
        },
      ],
    },
  },
  {
    match: "ch.ch",
    guide: {
      title: "ch.ch Behörden-Portal",
      steps: [
        { label: "Thema suchen", detail: "Gib oben in die Suchleiste ein, worum es geht — z.B. «Umzug melden».", highlight: { x: 50, y: 18, label: "Suche" }, autoAction: { type: "click", x: 640, y: 130 } },
        { label: "Kanton wählen", detail: "Wähle deinen Wohnkanton aus der Liste.", highlight: { x: 50, y: 45, label: "Kanton" } },
        { label: "Formular öffnen", detail: "Klicke auf den Link zum Formular.", highlight: { x: 50, y: 60, label: "Formular" } },
        { label: "Angaben ausfüllen", detail: "Fülle alle markierten Pflichtfelder aus.", highlight: { x: 50, y: 55, label: "Felder" } },
        { label: "Absenden", detail: "Prüfe die Angaben und klicke auf «Einreichen».", highlight: { x: 55, y: 82, label: "Absenden" } },
      ],
    },
  },

  // ── Ergänzungsleistungen ──────────────────────────────────────────────────
  {
    match: "el-anmeldung.ch",
    guide: {
      title: "Ergänzungsleistungen (EL)",
      steps: [
        { label: "Kanton wählen", detail: "EL wird durch kantonale Ausgleichskassen bearbeitet — wähle deinen Kanton.", highlight: { x: 50, y: 35, label: "Kanton" } },
        { label: "Formular herunterladen", detail: "Klicke auf «EL-Anmeldeformular» und öffne das PDF.", highlight: { x: 50, y: 50, label: "Formular" } },
        { label: "Angaben ausfüllen", detail: "AHV-Nummer, Einkommen, Vermögen, Mietkosten.", highlight: { x: 50, y: 60, label: "Daten" } },
        { label: "Einreichen", detail: "Per Post an die kantonale Ausgleichskasse oder online absenden.", highlight: { x: 55, y: 80, label: "Einreichen" } },
      ],
    },
  },

  // ── Krankenkassen ─────────────────────────────────────────────────────────
  {
    match: "css.ch",
    guide: {
      title: "CSS Krankenkasse",
      steps: [
        { label: "«Mein CSS» öffnen", detail: "Klicke oben rechts auf «Mein CSS» oder «Anmelden».", highlight: { x: 85, y: 5, label: "Anmelden" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "Registrieren", detail: "Klicke auf «Noch kein Konto? Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Versichertennummer eingeben", detail: "Die Nummer steht auf deiner Versicherungskarte.", highlight: { x: 50, y: 40, label: "Nr." } },
        { label: "E-Mail & Passwort", detail: "Gib deine E-Mail-Adresse und ein sicheres Passwort ein.", highlight: { x: 50, y: 55, label: "E-Mail" } },
        { label: "E-Mail bestätigen", detail: "Öffne die Bestätigungs-E-Mail von CSS und klicke auf den Link.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "helsana.ch",
    guide: {
      title: "Helsana Krankenkasse",
      steps: [
        { label: "«Mein Helsana» klicken", detail: "Oben rechts auf der Helsana-Seite.", highlight: { x: 85, y: 5, label: "Login" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "Klicke auf den Registrierungs-Link.", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Versicherungsnummer", detail: "Die Nummer steht auf deiner Krankenkassenkarte.", highlight: { x: 50, y: 40, label: "Nr." } },
        { label: "Persönliche Daten", detail: "Name, Geburtsdatum, E-Mail-Adresse eingeben.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "E-Mail bestätigen", detail: "Bestätigungslink in der E-Mail von Helsana anklicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "swica.ch",
    guide: {
      title: "Swica Krankenkasse",
      steps: [
        { label: "«mySwica» öffnen", detail: "Klicke oben rechts auf «mySwica».", highlight: { x: 85, y: 5, label: "mySwica" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "Konto erstellen", detail: "Klicke auf «Noch kein Konto».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Versicherungsnummer", detail: "Steht auf deiner Krankenkassenkarte.", highlight: { x: 50, y: 40, label: "Nr." } },
        { label: "E-Mail & Passwort", detail: "E-Mail-Adresse und Passwort festlegen.", highlight: { x: 50, y: 55, label: "E-Mail" } },
        { label: "Bestätigen", detail: "E-Mail von Swica öffnen und Link anklicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "visana.ch",
    guide: {
      title: "Visana Krankenkasse",
      steps: [
        { label: "«myVisana» klicken", detail: "Oben rechts auf der Seite.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Noch kein Konto? Jetzt registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Versicherungsnummer", detail: "Auf der Krankenversicherungskarte.", highlight: { x: 50, y: 40, label: "Nr." } },
        { label: "Zugangsdaten festlegen", detail: "E-Mail und Passwort eingeben.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "E-Mail bestätigen", detail: "Bestätigungs-E-Mail öffnen.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "sanitas.com",
    guide: {
      title: "Sanitas Krankenkasse",
      steps: [
        { label: "«MySanitas» öffnen", detail: "Oben rechts auf sanitas.com.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Konto erstellen", detail: "Klicke auf «Registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Versicherungsnummer", detail: "Auf der Sanitas-Krankenkassenkarte.", highlight: { x: 50, y: 40, label: "Nr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "E-Mail bestätigen", detail: "Link in der Bestätigungs-E-Mail klicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },

  // ── Spitex / Pflege ───────────────────────────────────────────────────────
  {
    match: "spitex.ch",
    guide: {
      title: "Spitex — Pflegedienst anmelden",
      steps: [
        { label: "Region suchen", detail: "Gib deine Gemeinde oder Postleitzahl ein.", highlight: { x: 50, y: 30, label: "PLZ/Ort" } },
        { label: "Lokale Spitex wählen", detail: "Klicke auf die Spitex-Organisation in deiner Nähe.", highlight: { x: 50, y: 50, label: "Auswählen" } },
        { label: "Kontakt aufnehmen", detail: "Telefonnummer notieren oder Anmeldeformular ausfüllen.", highlight: { x: 50, y: 65, label: "Kontakt" } },
        { label: "Bedarf angeben", detail: "Welche Hilfe brauchst du? Pflege, Haushalt, Mahlzeiten.", highlight: { x: 50, y: 55, label: "Bedarf" } },
        { label: "Absenden", detail: "Formular abschicken — die Spitex meldet sich innert 1–2 Tagen.", highlight: { x: 55, y: 80, label: "Absenden" } },
      ],
    },
  },

  // ── Pro Senectute / Pro Infirmis ──────────────────────────────────────────
  {
    match: "prosenectute.ch",
    guide: {
      title: "Pro Senectute — Beratung",
      steps: [
        { label: "Kanton wählen", detail: "Pro Senectute ist kantonal organisiert — wähle deinen Kanton.", highlight: { x: 50, y: 35, label: "Kanton" } },
        { label: "Dienstleistung suchen", detail: "Sozialberatung, Steuerberatung, Mahlzeitendienst, Kurse.", highlight: { x: 50, y: 50, label: "Dienste" } },
        { label: "Kontakt aufnehmen", detail: "Telefonnummer oder Online-Formular nutzen.", highlight: { x: 50, y: 65, label: "Kontakt" } },
        { label: "Termin vereinbaren", detail: "Beschreibe kurz dein Anliegen.", highlight: { x: 50, y: 55, label: "Termin" } },
      ],
    },
  },
  {
    match: "proinfirmis.ch",
    guide: {
      title: "Pro Infirmis — Beratung",
      steps: [
        { label: "Beratungsstelle suchen", detail: "Gib deine PLZ oder Gemeinde ein.", highlight: { x: 50, y: 30, label: "Suche" } },
        { label: "Dienstleistung wählen", detail: "Sozialberatung, Rechtsberatung, finanzielle Hilfe.", highlight: { x: 50, y: 50, label: "Dienste" } },
        { label: "Kontaktformular", detail: "Klicke auf «Kontakt» und fülle das Formular aus.", highlight: { x: 50, y: 65, label: "Kontakt" } },
        { label: "Absenden", detail: "Dein Anliegen schildern und Formular absenden.", highlight: { x: 55, y: 80, label: "Absenden" } },
      ],
    },
  },

  // ── Steuern ───────────────────────────────────────────────────────────────
  {
    match: "estv.admin.ch",
    guide: {
      title: "Bundessteuer (ESTV)",
      steps: [
        { label: "«ePortal» öffnen", detail: "Klicke auf «ePortal» oder «Online-Dienste».", highlight: { x: 85, y: 5, label: "ePortal" } },
        { label: "Kanton und Jahr wählen", detail: "Wähle das Steuerjahr und deinen Kanton.", highlight: { x: 50, y: 35, label: "Jahr/Kanton" } },
        { label: "Anmelden / Registrieren", detail: "Mit E-Mail-Adresse und Passwort oder CH-Login.", highlight: { x: 50, y: 50, label: "Anmelden" } },
        { label: "Steuererklärung ausfüllen", detail: "Einkommen, Abzüge, Vermögen eintragen.", highlight: { x: 50, y: 55, label: "Formular" } },
        { label: "Einreichen", detail: "Prüfe alle Angaben und klicke auf «Einreichen».", highlight: { x: 55, y: 82, label: "Einreichen" } },
      ],
    },
  },

  // ── Swisscom ──────────────────────────────────────────────────────────────
  {
    match: "swisscom.ch",
    guide: {
      title: "Swisscom — Kundenkonto",
      steps: [
        { label: "«Mein Swisscom» klicken", detail: "Oben rechts auf swisscom.ch.", highlight: { x: 85, y: 5, label: "Login" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "Klicke auf «Noch kein Konto? Jetzt registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Steht auf deiner Swisscom-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "E-Mail-Adresse und sicheres Passwort festlegen.", highlight: { x: 50, y: 55, label: "Zugangsdaten" } },
        { label: "E-Mail bestätigen", detail: "Bestätigungslink in der E-Mail von Swisscom klicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },

  // ── PostFinance ───────────────────────────────────────────────────────────
  {
    match: "postfinance.ch",
    guide: {
      title: "PostFinance — E-Finance",
      steps: [
        { label: "«E-Finance» öffnen", detail: "Klicke oben rechts auf «Anmelden» oder «E-Finance».", highlight: { x: 85, y: 5, label: "E-Finance" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "Klicke auf «Noch nicht registriert?».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Kontonummer eingeben", detail: "Die Nummer steht auf deinem PostFinance-Kontoauszug.", highlight: { x: 50, y: 40, label: "Kontonr." } },
        { label: "Persönliche Daten", detail: "Name, Adresse, Geburtsdatum, AHV-Nummer.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "PIN per Post", detail: "PostFinance schickt dir per Post einen Aktivierungscode.", highlight: { x: 50, y: 50, label: "PIN" } },
      ],
    },
  },

  // ── Krebsliga / Gesundheit ────────────────────────────────────────────────
  {
    match: "krebsliga.ch",
    guide: {
      title: "Krebsliga — Beratung & Hilfe",
      steps: [
        { label: "Beratung suchen", detail: "Klicke auf «Beratung & Unterstützung».", highlight: { x: 50, y: 35, label: "Beratung" } },
        { label: "Kanton wählen", detail: "Wähle die kantonale Krebsliga.", highlight: { x: 50, y: 50, label: "Kanton" } },
        { label: "Kontakt aufnehmen", detail: "Telefon, E-Mail oder Anmeldeformular.", highlight: { x: 50, y: 65, label: "Kontakt" } },
        { label: "Anliegen beschreiben", detail: "Was brauchst du? Psychosoziale Beratung, finanzielle Hilfe, Transport.", highlight: { x: 50, y: 55, label: "Anliegen" } },
      ],
    },
  },

  // ── EWZ / Energie ─────────────────────────────────────────────────────────
  {
    match: "ewz.ch",
    guide: {
      title: "EWZ — Strom Zürich",
      steps: [
        { label: "«myEWZ» öffnen", detail: "Klicke oben rechts auf «myEWZ» oder «Anmelden».", highlight: { x: 85, y: 5, label: "myEWZ" } },
        { label: "Registrieren", detail: "Klicke auf «Noch kein Konto? Jetzt registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Zählernummer eingeben", detail: "Steht auf deiner Stromrechnung.", highlight: { x: 50, y: 40, label: "Zähler" } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },

  // ── Hausarzt-Suche ────────────────────────────────────────────────────────
  {
    match: "hausarzt.ch",
    guide: {
      title: "Hausarzt finden",
      steps: [
        { label: "PLZ oder Ort eingeben", detail: "Gib deine Postleitzahl oder deinen Wohnort ein.", highlight: { x: 50, y: 30, label: "PLZ/Ort" } },
        { label: "Spezialisierung wählen", detail: "Z.B. Allgemeinmedizin, Innere Medizin.", highlight: { x: 50, y: 45, label: "Fachgebiet" } },
        { label: "Arzt auswählen", detail: "Klicke auf einen Arzt in der Nähe.", highlight: { x: 50, y: 60, label: "Arzt" } },
        { label: "Termin anfragen", detail: "Telefonnummer notieren oder Online-Termin buchen.", highlight: { x: 50, y: 75, label: "Termin" } },
      ],
    },
  },

  // ── Behindertenausweis ────────────────────────────────────────────────────
  {
    match: "hindernisfrei.ch",
    guide: {
      title: "Behindertenausweis / Parkkarte",
      steps: [
        { label: "Formular suchen", detail: "Klicke auf «Parkausweis für Behinderte».", highlight: { x: 50, y: 35, label: "Parkausweis" } },
        { label: "Wohnkanton wählen", detail: "Der Ausweis wird durch den Kanton ausgestellt.", highlight: { x: 50, y: 50, label: "Kanton" } },
        { label: "Antrag ausfüllen", detail: "Personalien, Behinderungsart, ärztliches Attest nötig.", highlight: { x: 50, y: 60, label: "Antrag" } },
        { label: "Einreichen", detail: "Per Post oder online an die kantonale Stelle.", highlight: { x: 55, y: 80, label: "Einreichen" } },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TELEKOMMUNIKATION
  // ════════════════════════════════════════════════════════════════════════════
  {
    match: "sunrise.ch",
    guide: {
      title: "Sunrise — Kundenkonto",
      steps: [
        { label: "«Mein Sunrise» klicken", detail: "Oben rechts auf sunrise.ch.", highlight: { x: 85, y: 5, label: "Login" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "Klicke auf «Noch kein Konto? Jetzt registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Steht auf deiner Sunrise-Rechnung oben rechts.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "E-Mail-Adresse und sicheres Passwort festlegen.", highlight: { x: 50, y: 55, label: "Zugangsdaten" } },
        { label: "E-Mail bestätigen", detail: "Bestätigungslink in der E-Mail von Sunrise klicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "salt.ch",
    guide: {
      title: "Salt — Kundenkonto",
      steps: [
        { label: "«Mein Salt» öffnen", detail: "Oben rechts auf salt.ch.", highlight: { x: 85, y: 5, label: "Login" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "Klicke auf «Konto erstellen» oder «Registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Rufnummer eingeben", detail: "Deine Salt-Telefonnummer.", highlight: { x: 50, y: 40, label: "Nummer" } },
        { label: "E-Mail & Passwort", detail: "E-Mail-Adresse und Passwort festlegen.", highlight: { x: 50, y: 55, label: "Zugangsdaten" } },
        { label: "SMS-Code eingeben", detail: "Salt schickt dir einen Code per SMS zur Bestätigung.", highlight: { x: 50, y: 50, label: "SMS-Code" } },
      ],
    },
  },
  {
    match: "upc.ch",
    guide: {
      title: "UPC / Quickline — Kundenkonto",
      steps: [
        { label: "«Mein UPC» klicken", detail: "Oben rechts auf upc.ch.", highlight: { x: 85, y: 5, label: "Login" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "Klicke auf «Konto erstellen».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Steht auf deiner UPC-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Zugangsdaten" } },
        { label: "E-Mail bestätigen", detail: "Bestätigungslink per E-Mail klicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "quickline.ch",
    guide: {
      title: "Quickline — Kundenkonto",
      steps: [
        { label: "«Mein Quickline» klicken", detail: "Oben rechts auf quickline.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "Klicke auf «Noch kein Konto? Registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Steht auf deiner Quickline-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "Zugangsdaten", detail: "E-Mail und Passwort eingeben.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail öffnen und Link klicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "wingo.ch",
    guide: {
      title: "Wingo (Swisscom) — Kundenkonto",
      steps: [
        { label: "«Anmelden» klicken", detail: "Oben rechts auf wingo.ch.", highlight: { x: 85, y: 5, label: "Anmelden" } },
        { label: "«Konto erstellen»", detail: "Klicke auf «Noch kein Konto?».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "Telefonnummer eingeben", detail: "Deine Wingo-Rufnummer.", highlight: { x: 50, y: 40, label: "Nummer" } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Code per SMS oder E-Mail eingeben.", highlight: { x: 50, y: 50, label: "Code" } },
      ],
    },
  },
  {
    match: "peoplefone.ch",
    guide: {
      title: "Peoplefone — Kundenkonto",
      steps: [
        { label: "«Login» klicken", detail: "Oben rechts auf peoplefone.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "«Registrieren»", detail: "Klicke auf «Neues Konto erstellen».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer", detail: "Aus deiner Peoplefone-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "Zugangsdaten", detail: "E-Mail und Passwort festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail öffnen.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ENERGIE / STROM
  // ════════════════════════════════════════════════════════════════════════════
  {
    match: "bkw.ch",
    guide: {
      title: "BKW (Bern) — Stromkonto",
      steps: [
        { label: "«Mein BKW» öffnen", detail: "Oben rechts auf bkw.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "Klicke auf «Konto erstellen».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Zählernummer eingeben", detail: "Steht auf deiner BKW-Rechnung.", highlight: { x: 50, y: 40, label: "Zähler" } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail öffnen und Link klicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "ekz.ch",
    guide: {
      title: "EKZ (Zürich) — Stromkonto",
      steps: [
        { label: "«Mein EKZ» öffnen", detail: "Oben rechts auf ekz.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "Klicke auf «Konto erstellen» oder «Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Aus deiner EKZ-Stromrechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "iwb.ch",
    guide: {
      title: "IWB (Basel) — Stromkonto",
      steps: [
        { label: "«Mein IWB» öffnen", detail: "Oben rechts auf iwb.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Noch kein Konto? Jetzt registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Aus deiner IWB-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail öffnen.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "ckw.ch",
    guide: {
      title: "CKW (Zentralschweiz) — Stromkonto",
      steps: [
        { label: "«MyCKW» öffnen", detail: "Oben rechts auf ckw.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "Klicke auf «Registrieren» oder «Konto erstellen».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Zählernummer eingeben", detail: "Aus deiner CKW-Stromrechnung.", highlight: { x: 50, y: 40, label: "Zähler" } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "aew.ch",
    guide: {
      title: "AEW (Aargau) — Stromkonto",
      steps: [
        { label: "«Mein AEW» öffnen", detail: "Oben rechts auf aew.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Noch kein Konto? Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Aus deiner AEW-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "repower.com",
    guide: {
      title: "Repower (Graubünden/Tessin) — Konto",
      steps: [
        { label: "«MyRepower» öffnen", detail: "Oben rechts auf repower.com.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "Klicke auf «Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Aus deiner Repower-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "romande-energie.ch",
    guide: {
      title: "Romande Energie (Waadt/Wallis)",
      steps: [
        { label: "«Mon espace» öffnen", detail: "Oben rechts auf romande-energie.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Créer un compte» oder «Konto erstellen».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Auf deiner Stromrechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "groupe-e.ch",
    guide: {
      title: "Groupe E (Freiburg) — Konto",
      steps: [
        { label: "«Mon Compte» öffnen", detail: "Oben rechts auf groupe-e.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Créer un compte» klicken.", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Aus deiner Groupe-E-Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ÖFFENTLICHER VERKEHR
  // ════════════════════════════════════════════════════════════════════════════
  {
    match: "zvv.ch",
    guide: {
      title: "ZVV (Zürich) — Abo & Konto",
      steps: [
        { label: "«Mein ZVV» öffnen", detail: "Oben rechts auf zvv.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Noch kein Konto? Jetzt registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Von deiner ZVV-Karte oder Rechnung.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "bls.ch",
    guide: {
      title: "BLS (Bern) — Abo & Konto",
      steps: [
        { label: "«Mein BLS» öffnen", detail: "Oben rechts auf bls.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Konto erstellen» oder «Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Kundennummer eingeben", detail: "Aus deinem BLS-Abo.", highlight: { x: 50, y: 40, label: "Kundennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "postauto.ch",
    guide: {
      title: "PostAuto — Fahrplan & Tickets",
      steps: [
        { label: "Verbindung suchen", detail: "Von-/Nach-Feld eingeben und Datum wählen.", highlight: { x: 50, y: 30, label: "Suche" } },
        { label: "Verbindung wählen", detail: "Klicke auf die passende Verbindung.", highlight: { x: 50, y: 50, label: "Wählen" } },
        { label: "Ticket kaufen", detail: "«Ticket kaufen» klicken.", highlight: { x: 50, y: 65, label: "Ticket" } },
        { label: "Anmelden / Gast", detail: "Mit SBB-Konto anmelden oder als Gast kaufen.", highlight: { x: 50, y: 50, label: "Anmelden" } },
        { label: "Bezahlen", detail: "Kreditkarte, PostFinance oder TWINT eingeben.", highlight: { x: 50, y: 65, label: "Bezahlen" } },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // BANKEN
  // ════════════════════════════════════════════════════════════════════════════
  {
    match: "ubs.com",
    guide: {
      title: "UBS — E-Banking",
      steps: [
        { label: "«E-Banking» öffnen", detail: "Oben rechts auf ubs.com, dann «E-Banking Login».", highlight: { x: 85, y: 5, label: "E-Banking" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "Access Card / App", detail: "Du brauchst deine UBS Access Card oder die UBS Mobile Banking App.", highlight: { x: 50, y: 45, label: "Access Card" } },
        { label: "Vertragsnummer eingeben", detail: "Die 6–8-stellige Nummer auf deiner Access Card.", highlight: { x: 50, y: 50, label: "Vertragsnr." } },
        { label: "Passwort eingeben", detail: "Dein persönliches E-Banking-Passwort.", highlight: { x: 50, y: 62, label: "Passwort" } },
        { label: "Code bestätigen", detail: "Code von der Access Card oder SMS eingeben.", highlight: { x: 50, y: 72, label: "Code" } },
      ],
    },
  },
  {
    match: "raiffeisen.ch",
    guide: {
      title: "Raiffeisen — E-Banking",
      steps: [
        { label: "«E-Banking» öffnen", detail: "Oben rechts auf raiffeisen.ch.", highlight: { x: 85, y: 5, label: "E-Banking" } },
        { label: "Mitgliedernummer eingeben", detail: "Die Nummer auf deiner Raiffeisen-Karte.", highlight: { x: 50, y: 45, label: "Mitgliedernr." } },
        { label: "Passwort eingeben", detail: "Dein E-Banking-Passwort.", highlight: { x: 50, y: 58, label: "Passwort" } },
        { label: "RaiffeisenSecure", detail: "Code aus der RaiffeisenSecure-App oder per SMS eingeben.", highlight: { x: 50, y: 70, label: "Code" } },
      ],
    },
  },
  {
    match: "zkb.ch",
    guide: {
      title: "ZKB (Zürcher Kantonalbank) — E-Banking",
      steps: [
        { label: "«E-Banking» öffnen", detail: "Oben rechts auf zkb.ch.", highlight: { x: 85, y: 5, label: "E-Banking" } },
        { label: "Vertragsnummer eingeben", detail: "Auf deiner ZKB-Karte oder im Brief der Bank.", highlight: { x: 50, y: 45, label: "Vertragsnr." } },
        { label: "Passwort eingeben", detail: "Dein persönliches E-Banking-Passwort.", highlight: { x: 50, y: 58, label: "Passwort" } },
        { label: "SecureSign bestätigen", detail: "Code aus der ZKB-App oder per SMS.", highlight: { x: 50, y: 70, label: "Code" } },
      ],
    },
  },
  {
    match: "lukb.ch",
    guide: {
      title: "LUKB (Luzerner Kantonalbank) — E-Banking",
      steps: [
        { label: "«E-Banking» öffnen", detail: "Oben rechts auf lukb.ch.", highlight: { x: 85, y: 5, label: "E-Banking" } },
        { label: "Vertragsnummer eingeben", detail: "Aus deinem LUKB-Brief.", highlight: { x: 50, y: 45, label: "Vertragsnr." } },
        { label: "Passwort eingeben", detail: "Dein E-Banking-Passwort.", highlight: { x: 50, y: 58, label: "Passwort" } },
        { label: "SecureSign / SMS-Code", detail: "Code aus der App oder per SMS.", highlight: { x: 50, y: 70, label: "Code" } },
      ],
    },
  },
  {
    match: "bcge.ch",
    guide: {
      title: "BCGE (Genfer Kantonalbank) — E-Banking",
      steps: [
        { label: "«E-Banking» öffnen", detail: "Oben auf bcge.ch.", highlight: { x: 85, y: 5, label: "E-Banking" } },
        { label: "Kundennummer eingeben", detail: "Aus deinem BCGE-Brief.", highlight: { x: 50, y: 45, label: "Kundennr." } },
        { label: "Passwort eingeben", detail: "Dein Passwort.", highlight: { x: 50, y: 58, label: "Passwort" } },
        { label: "Code bestätigen", detail: "Code aus App oder SMS.", highlight: { x: 50, y: 70, label: "Code" } },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // VERSICHERUNGEN (Nicht-Kranken)
  // ════════════════════════════════════════════════════════════════════════════
  {
    match: "zurich.ch",
    guide: {
      title: "Zurich Versicherung — Kundenportal",
      steps: [
        { label: "«Mein Zurich» öffnen", detail: "Oben rechts auf zurich.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Noch kein Konto? Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Policennummer eingeben", detail: "Aus deinen Versicherungsunterlagen.", highlight: { x: 50, y: 40, label: "Policennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "helvetia.ch",
    guide: {
      title: "Helvetia Versicherung — Kundenportal",
      steps: [
        { label: "«myHelvetia» öffnen", detail: "Oben rechts auf helvetia.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Konto erstellen» klicken.", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Policennummer eingeben", detail: "Aus deinem Helvetia-Versicherungsausweis.", highlight: { x: 50, y: 40, label: "Policennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "mobiliar.ch",
    guide: {
      title: "Mobiliar — Kundenportal",
      steps: [
        { label: "«Meine Mobiliar» öffnen", detail: "Oben rechts auf mobiliar.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Noch kein Konto? Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Policennummer eingeben", detail: "Auf deinem Mobiliar-Versicherungsausweis.", highlight: { x: 50, y: 40, label: "Policennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "axa.ch",
    guide: {
      title: "AXA — Kundenportal",
      steps: [
        { label: "«myAXA» öffnen", detail: "Oben rechts auf axa.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Konto erstellen» klicken.", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Policennummer eingeben", detail: "Aus deinen AXA-Unterlagen.", highlight: { x: 50, y: 40, label: "Policennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "allianz.ch",
    guide: {
      title: "Allianz — Kundenportal",
      steps: [
        { label: "«Mein Allianz» öffnen", detail: "Oben rechts auf allianz.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Noch kein Konto? Registrieren».", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Policennummer eingeben", detail: "Aus deinen Allianz-Unterlagen.", highlight: { x: 50, y: 40, label: "Policennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "baloise.ch",
    guide: {
      title: "Baloise — Kundenportal",
      steps: [
        { label: "«myBaloise» öffnen", detail: "Oben rechts auf baloise.ch.", highlight: { x: 85, y: 5, label: "Login" } },
        { label: "Registrieren", detail: "«Konto erstellen» klicken.", highlight: { x: 50, y: 55, label: "Registrieren" } },
        { label: "Policennummer eingeben", detail: "Aus deinen Baloise-Unterlagen.", highlight: { x: 50, y: 40, label: "Policennr." } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 55, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ONLINE-EINKAUF & LIEFERUNG
  // ════════════════════════════════════════════════════════════════════════════
  {
    match: "migros.ch",
    guide: {
      title: "Migros — Cumulus & Online-Shop",
      steps: [
        { label: "«Anmelden» klicken", detail: "Oben rechts auf migros.ch.", highlight: { x: 85, y: 5, label: "Anmelden" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "«Noch kein Konto? Jetzt registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "E-Mail & Passwort", detail: "E-Mail-Adresse und Passwort eingeben.", highlight: { x: 50, y: 45, label: "E-Mail" } },
        { label: "Cumulus-Karte verknüpfen", detail: "Optional: Cumulus-Nummer eingeben um Punkte zu sammeln.", highlight: { x: 50, y: 60, label: "Cumulus" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail von Migros öffnen.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "coop.ch",
    guide: {
      title: "Coop — Supercard & Online-Shop",
      steps: [
        { label: "«Anmelden» klicken", detail: "Oben rechts auf coop.ch.", highlight: { x: 85, y: 5, label: "Anmelden" }, autoAction: { type: "click", x: 1150, y: 36 } },
        { label: "«Registrieren» wählen", detail: "«Noch kein Konto? Registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "E-Mail & Passwort", detail: "E-Mail-Adresse und Passwort eingeben.", highlight: { x: 50, y: 45, label: "E-Mail" } },
        { label: "Supercard verknüpfen", detail: "Optional: Supercard-Nummer eingeben.", highlight: { x: 50, y: 60, label: "Supercard" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail von Coop öffnen.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "galaxus.ch",
    guide: {
      title: "Galaxus / Digitec — Konto erstellen",
      steps: [
        { label: "«Anmelden» klicken", detail: "Oben rechts auf galaxus.ch.", highlight: { x: 85, y: 5, label: "Anmelden" } },
        { label: "«Registrieren» wählen", detail: "«Noch kein Konto? Registrieren».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "E-Mail & Passwort", detail: "E-Mail-Adresse und sicheres Passwort eingeben.", highlight: { x: 50, y: 45, label: "E-Mail" } },
        { label: "Name & Adresse", detail: "Vor-/Nachname und Lieferadresse eingeben.", highlight: { x: 50, y: 58, label: "Adresse" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail öffnen und Link klicken.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "digitec.ch",
    guide: {
      title: "Digitec — Konto erstellen",
      steps: [
        { label: "«Anmelden» klicken", detail: "Oben rechts auf digitec.ch.", highlight: { x: 85, y: 5, label: "Anmelden" } },
        { label: "«Registrieren» wählen", detail: "«Noch kein Konto?».", highlight: { x: 50, y: 60, label: "Registrieren" } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten eingeben.", highlight: { x: 50, y: 45, label: "E-Mail" } },
        { label: "Name & Adresse", detail: "Persönliche Daten eingeben.", highlight: { x: 50, y: 58, label: "Daten" } },
        { label: "Bestätigen", detail: "Bestätigungs-E-Mail öffnen.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // GESUNDHEIT ONLINE
  // ════════════════════════════════════════════════════════════════════════════
  {
    match: "myvaccines.ch",
    guide: {
      title: "MyVaccines — Impfausweis",
      steps: [
        { label: "«Registrieren» klicken", detail: "Auf der Startseite von myvaccines.ch.", highlight: { x: 50, y: 40, label: "Registrieren" } },
        { label: "E-Mail & Passwort", detail: "Zugangsdaten festlegen.", highlight: { x: 50, y: 50, label: "E-Mail" } },
        { label: "Persönliche Daten", detail: "Name, Geburtsdatum, Geschlecht.", highlight: { x: 50, y: 60, label: "Daten" } },
        { label: "AHV-Nummer (optional)", detail: "Für eine eindeutige Zuordnung.", highlight: { x: 50, y: 68, label: "AHV" } },
        { label: "Bestätigen", detail: "Bestätigungslink per E-Mail.", highlight: { x: 50, y: 50, label: "Bestätigen" } },
      ],
    },
  },
  {
    match: "ad-schweiz.ch",
    guide: {
      title: "Alzheimer Schweiz — Beratung",
      steps: [
        { label: "Beratung suchen", detail: "Klicke auf «Beratung & Hilfe».", highlight: { x: 50, y: 35, label: "Beratung" } },
        { label: "Kanton wählen", detail: "Wähle deine kantonale Sektion.", highlight: { x: 50, y: 50, label: "Kanton" } },
        { label: "Kontakt aufnehmen", detail: "Telefon oder Kontaktformular.", highlight: { x: 50, y: 65, label: "Kontakt" } },
        { label: "Anliegen beschreiben", detail: "Schildere kurz deine Situation.", highlight: { x: 50, y: 55, label: "Anliegen" } },
      ],
    },
  },
  {
    match: "parkinson.ch",
    guide: {
      title: "Parkinson Schweiz — Beratung",
      steps: [
        { label: "«Beratung» öffnen", detail: "Klicke auf «Für Betroffene» oder «Beratung».", highlight: { x: 50, y: 35, label: "Beratung" } },
        { label: "Kontakt aufnehmen", detail: "Telefon: 043 443 14 14 oder Kontaktformular.", highlight: { x: 50, y: 55, label: "Kontakt" } },
        { label: "Formular ausfüllen", detail: "Name, Telefon, Anliegen eingeben.", highlight: { x: 50, y: 65, label: "Formular" } },
        { label: "Absenden", detail: "Klicke auf «Absenden».", highlight: { x: 55, y: 80, label: "Absenden" } },
      ],
    },
  },
];

const GENERIC_GUIDE: Guide = {
  title: "Schritt-für-Schritt",
  steps: [
    { label: "Seite lädt", detail: "Warte bis die Seite vollständig geladen ist.", highlight: { x: 50, y: 50, label: "Laden…" } },
    { label: "Anmelden suchen", detail: "Schau oben rechts — dort ist meistens ein «Anmelden»-Button.", highlight: { x: 85, y: 5, label: "Anmelden" } },
    { label: "Formular ausfüllen", detail: "Alle Felder mit * sind Pflichtfelder.", highlight: { x: 50, y: 45, label: "Formular" } },
    { label: "Passwort notieren", detail: "Schreib dein Passwort auf — an einem sicheren Ort.", highlight: { x: 50, y: 58, label: "Passwort" } },
    { label: "Absenden", detail: "Klicke auf «Weiter», «Bestätigen» oder «Absenden».", highlight: { x: 55, y: 80, label: "Absenden" } },
    { label: "E-Mail bestätigen", detail: "Schau in dein E-Mail-Postfach — auch im Spam-Ordner.", highlight: { x: 50, y: 50, label: "E-Mail" } },
  ],
};

function getGuide(url: string): Guide {
  const lower = url.toLowerCase();
  return KNOWN_GUIDES.find(g => lower.includes(g.match))?.guide ?? GENERIC_GUIDE;
}

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

export default function AssistenzWindow({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [frameError, setFrameError] = useState(false);

  // Browserless-Modus
  const [baddibetrieb, setBaddibetrieb] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const didAutoLoad = useRef(false);

  // Auto-laden wenn initialUrl gesetzt
  if (initialUrl && !didAutoLoad.current && !loadedUrl) {
    didAutoLoad.current = true;
    const normalized = initialUrl.startsWith("http") ? initialUrl : `https://${initialUrl}`;
    setTimeout(() => { setLoadedUrl(normalized); setActiveStep(0); setFrameError(false); }, 0);
  }

  const rawGuide = loadedUrl ? getGuide(loadedUrl) : null;

  // Sprachauswahl-Schritt überspringen wenn Browser-Sprache Deutsch/Schweizerdeutsch ist
  const userLang = typeof navigator !== "undefined" ? navigator.language : "";
  const isGermanUser = /^(de|gsw)/i.test(userLang);
  const guide = rawGuide
    ? { ...rawGuide, steps: rawGuide.steps.filter(s => !s.isLanguageStep || !isGermanUser) }
    : null;

  const currentStep = guide?.steps[activeStep];

  function handleLoad() {
    const raw = url.trim();
    if (!raw) return;
    const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
    setLoadedUrl(normalized);
    setActiveStep(0);
    setFrameError(false);
    setScreenshot(null);
    setBaddibetrieb(false);
  }

  // ── Browserless ───────────────────────────────────────────────────────────────
  const doAction = useCallback(async (action: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/chat/browser`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.screenshot_b64) setScreenshot(data.screenshot_b64);
      if (data.url) setBrowserUrl(data.url);
    } finally {
      setLoading(false);
    }
  }, []);

  async function activateBaddibetrieb() {
    if (!loadedUrl) return;
    setBaddibetrieb(true);
    setLoading(true);
    await doAction({ type: "navigate", url: loadedUrl });
  }

  async function autoRunStep() {
    if (!currentStep?.autoAction || autoRunning) return;
    setAutoRunning(true);
    const a = currentStep.autoAction;
    await doAction(a as unknown as Record<string, unknown>);
    setAutoRunning(false);
    // Weiter zum nächsten Schritt
    if (guide && activeStep < guide.steps.length - 1) {
      setActiveStep(s => s + 1);
    }
  }

  // Klick auf Screenshot → koordinatengenaues Klicken im Browser
  function handleImgClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = VIEWPORT_W / rect.width;
    const scaleY = VIEWPORT_H / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    doAction({ type: "click", x, y });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-white">

      {/* URL-Leiste */}
      <div className="shrink-0 px-3 py-2 border-b border-white/5 flex gap-2 items-center">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLoad()}
          placeholder="z.B. ahv-iv.ch oder sbb.ch"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/25"
        />
        <button
          onClick={handleLoad}
          className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30 transition-all shrink-0"
        >
          Öffnen
        </button>
      </div>

      {/* Startseite */}
      {!loadedUrl && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="text-4xl">🧭</span>
          <p className="text-sm text-gray-400 font-medium">Assistenz-Modus</p>
          <p className="text-xs text-gray-600 leading-relaxed">Gib die Webseite ein, auf der du Hilfe brauchst.<br />Baddi führt dich Schritt für Schritt — oder übernimmt selbst.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {KNOWN_GUIDES.map(g => (
              <button
                key={g.match}
                onClick={() => { setUrl(`https://www.${g.match}`); setTimeout(handleLoad, 50); }}
                className="px-3 py-1.5 rounded-full text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 hover:text-white transition-all"
              >
                {g.guide.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hauptbereich */}
      {loadedUrl && (
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Linke Seite — iframe oder Browserless-Screenshot */}
          <div className="flex-1 relative overflow-hidden bg-black/20">

            {/* ── iframe-Modus ── */}
            {!baddibetrieb && (
              <>
                {frameError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 px-6 text-center z-10">
                    <span className="text-3xl">🚫</span>
                    <p className="text-sm text-gray-300 font-medium">Diese Seite lässt sich nicht einbetten.</p>
                    <p className="text-xs text-gray-500 leading-relaxed">Nutze «Baddi übernimmt» — dann steuert Baddi<br />die Seite direkt und du siehst alles live.</p>
                  </div>
                ) : null}

                <iframe
                  key={loadedUrl}
                  src={loadedUrl}
                  className="w-full h-full border-0"
                  onError={() => setFrameError(true)}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                  title="Assistenz Browser"
                />

                {/* Visuelles Overlay — Pfeil zeigt auf Ziel, verdeckt es nicht */}
                {currentStep?.highlight && !frameError && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ zIndex: 20 }}
                  >
                    {/* Pfeil-Spitze liegt genau am Ziel, Körper zeigt von oben-links */}
                    <div
                      className="absolute"
                      style={{
                        left: `${currentStep.highlight.x}%`,
                        top: `${currentStep.highlight.y}%`,
                        transform: "translate(0, 0)",
                      }}
                    >
                      {/* SVG-Cursor-Pfeil: Spitze bei 0,0 → zeigt genau auf den Button */}
                      <svg
                        width="44" height="52"
                        viewBox="0 0 44 52"
                        style={{
                          position: "absolute",
                          left: -2,
                          top: -2,
                          filter: "drop-shadow(0 2px 6px rgba(99,102,241,0.7))",
                        }}
                      >
                        {/* Pfeil-Umriss (weiss) */}
                        <path
                          d="M2 2 L2 38 L10 30 L17 46 L22 44 L15 28 L26 28 Z"
                          fill="white"
                          stroke="#6366f1"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                        {/* Pfeil-Füllung (indigo) */}
                        <path
                          d="M4 5 L4 34 L11 27 L18 43 L21 42 L14 26 L24 26 Z"
                          fill="#6366f1"
                          opacity="0.9"
                        />
                      </svg>
                      {/* Pulsring direkt am Zielpunkt (klein, nicht verdeckend) */}
                      <div
                        className="absolute rounded-full border-2 border-indigo-400/70 animate-ping"
                        style={{ width: 10, height: 10, left: -5, top: -5 }}
                      />
                      {/* Label-Badge neben dem Pfeil */}
                      {currentStep.highlight.label && (
                        <span
                          className="absolute whitespace-nowrap px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-semibold shadow-lg"
                          style={{ left: 44, top: 28 }}
                        >
                          {currentStep.highlight.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Browserless-Modus ── */}
            {baddibetrieb && (
              <div className="absolute inset-0 flex flex-col">
                {loading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-indigo-300">{autoRunning ? "Baddi klickt…" : "Lädt…"}</p>
                    </div>
                  </div>
                )}
                {screenshot ? (
                  <div className="relative w-full h-full">
                    <img
                      ref={imgRef}
                      src={`data:image/jpeg;base64,${screenshot}`}
                      alt="Browser"
                      className="w-full h-full object-contain cursor-crosshair select-none"
                      onClick={handleImgClick}
                      draggable={false}
                    />
                    {/* Pfeil-Overlay für autoAction-Ziel */}
                    {currentStep?.autoAction?.x != null && currentStep.autoAction.y != null && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: `${(currentStep.autoAction.x! / 1280) * 100}%`,
                          top: `${(currentStep.autoAction.y! / 720) * 100}%`,
                          zIndex: 10,
                        }}
                      >
                        <svg
                          width="44" height="52"
                          viewBox="0 0 44 52"
                          style={{
                            position: "absolute",
                            left: -2,
                            top: -2,
                            filter: "drop-shadow(0 2px 8px rgba(99,102,241,0.9))",
                          }}
                        >
                          <path
                            d="M2 2 L2 38 L10 30 L17 46 L22 44 L15 28 L26 28 Z"
                            fill="white"
                            stroke="#6366f1"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M4 5 L4 34 L11 27 L18 43 L21 42 L14 26 L24 26 Z"
                            fill="#6366f1"
                            opacity="0.9"
                          />
                        </svg>
                        <div
                          className="absolute rounded-full border-2 border-indigo-400/80 animate-ping"
                          style={{ width: 10, height: 10, left: -5, top: -5 }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                    Verbinde mit Browser…
                  </div>
                )}
                {browserUrl && (
                  <div className="shrink-0 px-3 py-1.5 bg-black/60 border-t border-white/5 text-[10px] text-gray-500 truncate">
                    {browserUrl}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rechte Seite — Anleitung */}
          {guide && (
            <div className="w-52 shrink-0 border-l border-white/5 flex flex-col overflow-hidden">

              {/* Modus-Umschalter */}
              <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-white/5 space-y-1.5">
                <p className="text-[10px] text-gray-500 font-medium px-1">{guide.title}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setBaddibetrieb(false); setFrameError(false); }}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                      !baddibetrieb
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-transparent border-white/8 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Ich mache es
                  </button>
                  <button
                    onClick={activateBaddibetrieb}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                      baddibetrieb
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-transparent border-white/8 text-gray-500 hover:text-indigo-400 hover:border-indigo-500/40"
                    }`}
                  >
                    🤖 Baddi
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 px-1 leading-relaxed">
                  {baddibetrieb
                    ? "Baddi steuert den Browser. Klicke selbst oder lass Baddi den nächsten Schritt ausführen."
                    : "Folge der Anleitung. Der Pfeil zeigt wo du klicken musst."}
                </p>
              </div>

              {/* Schritt-Liste */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {guide.steps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveStep(i)}
                    className={`w-full text-left rounded-lg p-2 transition-all ${
                      i === activeStep
                        ? "bg-indigo-500/20 border border-indigo-500/25"
                        : i < activeStep
                        ? "opacity-40"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 ${
                        i < activeStep ? "bg-green-500/30 text-green-400" :
                        i === activeStep ? "bg-indigo-500/50 text-indigo-300" :
                        "bg-white/8 text-gray-500"
                      }`}>
                        {i < activeStep ? "✓" : i + 1}
                      </span>
                      <span className={`text-xs font-medium leading-snug ${i === activeStep ? "text-white" : "text-gray-400"}`}>
                        {step.label}
                      </span>
                    </div>
                    {i === activeStep && step.detail && (
                      <p className="text-[11px] text-indigo-300/80 mt-1.5 ml-6 leading-relaxed">{step.detail}</p>
                    )}
                  </button>
                ))}
              </div>

              {/* Navigation */}
              <div className="shrink-0 px-2 py-2 border-t border-white/5 space-y-1.5">
                {/* Baddi-Auto-Schritt */}
                {baddibetrieb && currentStep?.autoAction && (
                  <button
                    onClick={autoRunStep}
                    disabled={autoRunning || loading}
                    className="w-full py-1.5 rounded-lg text-xs text-white bg-indigo-600/80 border border-indigo-500/50 hover:bg-indigo-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                  >
                    {autoRunning ? (
                      <>
                        <span className="w-3 h-3 border border-white/50 border-t-transparent rounded-full animate-spin" />
                        Baddi klickt…
                      </>
                    ) : (
                      <>🤖 Schritt ausführen</>
                    )}
                  </button>
                )}
                {/* Vor/Zurück */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setActiveStep(s => Math.max(0, s - 1))}
                    disabled={activeStep === 0}
                    className="flex-1 py-1.5 rounded-lg text-xs text-gray-400 bg-white/5 border border-white/8 hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    ← Zurück
                  </button>
                  <button
                    onClick={() => setActiveStep(s => Math.min((guide?.steps.length ?? 1) - 1, s + 1))}
                    disabled={activeStep === (guide?.steps.length ?? 1) - 1}
                    className="flex-1 py-1.5 rounded-lg text-xs text-indigo-400 bg-indigo-500/15 border border-indigo-500/25 hover:bg-indigo-500/25 disabled:opacity-30 transition-all"
                  >
                    Weiter →
                  </button>
                </div>
                {/* Fallback wenn iframe geblockt */}
                {frameError && !baddibetrieb && (
                  <a
                    href={loadedUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center py-1.5 rounded-lg text-[11px] text-gray-400 bg-white/5 border border-white/8 hover:text-white transition-all"
                  >
                    ↗ Seite in Browser öffnen
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
