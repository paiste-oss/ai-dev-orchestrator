"""Tool-Definitionen im Anthropic Tool Use Format (statische JSON-Schemas)."""
from __future__ import annotations

# ---------------------------------------------------------------------------
# SBB / Schweizer ÖV
# ---------------------------------------------------------------------------

SBB_TOOL_DEFS = [
    {
        "name": "sbb_locations",
        "description": (
            "Sucht Schweizer ÖV-Haltestellen, Orte oder Adressen nach Name. "
            "Gibt ID, Name und Koordinaten zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Haltestellenname oder Ort, z.B. 'Zürich HB', 'Bern Bahnhof'",
                },
                "type": {
                    "type": "string",
                    "enum": ["station", "poi", "address", "all"],
                    "description": "Typ des Orts. Standard: station",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "sbb_stationboard",
        "description": (
            "Zeigt die Echtzeit-Abfahrtstafel einer Haltestelle. "
            "Enthält Linie, Ziel, Abfahrtszeit, Gleis und Verspätung."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "station": {
                    "type": "string",
                    "description": "Haltestellenname oder ID, z.B. '8503000' oder 'Zürich HB'",
                },
                "limit": {
                    "type": "integer",
                    "description": "Anzahl Abfahrten, Standard 10",
                    "default": 10,
                },
                "type": {
                    "type": "string",
                    "enum": ["departure", "arrival"],
                    "description": "Abfahrten oder Ankünfte. Standard: departure",
                },
                "transportation": {
                    "type": "string",
                    "enum": ["train", "tram", "bus", "ship", "cableway"],
                    "description": "Optional: nur dieses Verkehrsmittel",
                },
            },
            "required": ["station"],
        },
    },
    {
        "name": "sbb_connections",
        "description": (
            "Sucht Verbindungen zwischen zwei Haltestellen im Schweizer ÖV. "
            "Gibt Abfahrt, Ankunft, Dauer, Umstiege und Gleis zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from_station": {
                    "type": "string",
                    "description": "Abgangsort, z.B. 'Bern'",
                },
                "to_station": {
                    "type": "string",
                    "description": "Zielort, z.B. 'Zürich HB'",
                },
                "date": {
                    "type": "string",
                    "description": "Datum YYYY-MM-DD. Leer = heute",
                },
                "time": {
                    "type": "string",
                    "description": "Uhrzeit HH:MM. Leer = jetzt",
                },
                "is_arrival_time": {
                    "type": "boolean",
                    "description": "True wenn 'time' die gewünschte Ankunftszeit ist",
                    "default": False,
                },
                "limit": {
                    "type": "integer",
                    "description": "Anzahl Verbindungen (1-16). Standard: 4",
                    "default": 4,
                },
            },
            "required": ["from_station", "to_station"],
        },
    },
]


# ---------------------------------------------------------------------------
# Web Fetch (Jina Reader)
# ---------------------------------------------------------------------------

WEB_FETCH_TOOL_DEFS = [
    {
        "name": "web_fetch",
        "description": (
            "Ruft eine Webseite ab und gibt den Inhalt als lesbaren Text zurück. "
            "Nutze dieses Tool wenn du aktuelle Informationen von einer Website brauchst, "
            "eine URL nachschlagen sollst, oder der Nutzer dich bittet eine Seite zu lesen. "
            "Gibt sauberes Markdown zurück — keine Werbung, kein HTML."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Die vollständige URL der Webseite, z.B. 'https://example.com/artikel'",
                },
            },
            "required": ["url"],
        },
    },
]


# ---------------------------------------------------------------------------
# Web Search (Exa)
# ---------------------------------------------------------------------------

WEB_SEARCH_TOOL_DEFS = [
    {
        "name": "web_search",
        "description": (
            "Sucht im Internet nach aktuellen Informationen, Nachrichten, Preisen, "
            "Personen oder Ereignissen. Nutze dieses Tool wenn du aktuelle oder "
            "externe Informationen brauchst die nicht in deinem Wissen vorhanden sind. "
            "Gibt Titel, URL und Textauszug der relevantesten Ergebnisse zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Suchanfrage, z.B. 'iPhone 16 Preis Schweiz' oder 'Nachrichten Schweiz heute'",
                },
                "num_results": {
                    "type": "integer",
                    "description": "Anzahl Ergebnisse (1-5). Standard: 3",
                    "default": 3,
                },
            },
            "required": ["query"],
        },
    },
]


# ---------------------------------------------------------------------------
# Bild-Generierung (DALL-E 3)
# ---------------------------------------------------------------------------

DALLE_TOOL_DEFS = [
    {
        "name": "generate_image",
        "description": (
            "Erstellt ein Bild basierend auf einer Textbeschreibung mit DALL-E 3. "
            "Nutze dieses Tool wenn der Nutzer ein Bild erstellt, gezeichnet oder generiert haben möchte. "
            "Gibt die URL des generierten Bildes zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Detaillierte Bildbeschreibung auf Englisch für beste Ergebnisse",
                },
                "size": {
                    "type": "string",
                    "enum": ["1024x1024", "1792x1024", "1024x1792"],
                    "description": "Bildgrösse. Standard: 1024x1024 (quadratisch)",
                },
                "quality": {
                    "type": "string",
                    "enum": ["standard", "hd"],
                    "description": "standard = schnell, hd = mehr Detail",
                },
            },
            "required": ["prompt"],
        },
    },
]


# ---------------------------------------------------------------------------
# Aktien / Yahoo Finance
# ---------------------------------------------------------------------------

STOCK_TOOL_DEFS = [
    {
        "name": "get_stock_price",
        "description": (
            "Gibt den aktuellen Aktienkurs, Tages-Performance und wichtige Kennzahlen "
            "für ein börsennotiertes Unternehmen zurück. Nutze dieses Tool wenn der Nutzer "
            "nach dem Kurs, Preis oder der Entwicklung einer Aktie fragt. "
            "Gibt Kurs, Währung, Tagesveränderung, Marktkapitalisierung und mehr zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": (
                        "Börsenkürzel (Ticker) der Aktie, z.B. 'AAPL' für Apple, "
                        "'NESN.SW' für Nestlé, 'NOVN.SW' für Novartis, 'ROG.SW' für Roche, "
                        "'ABBN.SW' für ABB, 'GOOGL' für Alphabet, 'MSFT' für Microsoft"
                    ),
                },
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "search_stock_symbol",
        "description": (
            "Sucht das Börsenkürzel (Ticker) eines Unternehmens anhand seines Namens. "
            "Nutze dieses Tool zuerst wenn du den Ticker nicht kennst."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "company_name": {
                    "type": "string",
                    "description": "Firmenname, z.B. 'Nestlé', 'Apple', 'Tesla', 'UBS'",
                },
            },
            "required": ["company_name"],
        },
    },
    {
        "name": "get_stock_history",
        "description": (
            "Gibt den historischen Kursverlauf einer Aktie zurück. "
            "Nutze dieses Tool wenn der Nutzer nach dem Verlauf, der Entwicklung über Zeit, "
            "dem Chart oder historischen Kursen einer Aktie fragt. "
            "Gibt monatliche/wöchentliche Schlusskurse als Tabelle zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Börsenkürzel, z.B. 'HOLN.SW', 'AAPL', 'NESN.SW'",
                },
                "period": {
                    "type": "string",
                    "enum": ["1mo", "3mo", "6mo", "1y", "2y", "5y"],
                    "description": "Zeitraum: 1mo=1 Monat, 3mo=3 Monate, 6mo=6 Monate, 1y=1 Jahr, 2y=2 Jahre, 5y=5 Jahre. Standard: 1y",
                },
            },
            "required": ["symbol"],
        },
    },
]


# ---------------------------------------------------------------------------
# Kurs-Alerts (E-Mail)
# ---------------------------------------------------------------------------

STOCK_ALERT_TOOL_DEFS = [
    {
        "name": "create_stock_alert",
        "description": (
            "Richtet eine automatische Kurs-Benachrichtigung per E-Mail ein. "
            "Nutze dieses Tool wenn der Nutzer informiert werden möchte wenn ein Aktienkurs "
            "einen bestimmten Wert über- oder unterschreitet. "
            "Der Alert wird automatisch alle 15 Minuten (Mo-Fr, 07:00-22:00 Zürich) geprüft "
            "und eine E-Mail gesendet wenn die Bedingung erfüllt ist."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Börsenkürzel, z.B. 'HOLN.SW', 'AAPL', 'NESN.SW'. Falls unbekannt zuerst search_stock_symbol verwenden.",
                },
                "threshold": {
                    "type": "number",
                    "description": "Kurs-Schwellwert, z.B. 70.0",
                },
                "direction": {
                    "type": "string",
                    "enum": ["above", "below"],
                    "description": "'above' = benachrichtigen wenn Kurs ÜBER dem Schwellwert, 'below' = wenn DARUNTER",
                },
                "email": {
                    "type": "string",
                    "description": "E-Mail-Adresse für die Benachrichtigung. Falls nicht angegeben wird die Kunden-E-Mail verwendet.",
                },
                "company_name": {
                    "type": "string",
                    "description": "Optionaler Firmenname für die E-Mail, z.B. 'Holcim AG'",
                },
            },
            "required": ["symbol", "threshold", "direction"],
        },
    },
    {
        "name": "list_stock_alerts",
        "description": "Zeigt alle aktiven Kurs-Alerts des Nutzers.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "delete_stock_alert",
        "description": "Löscht einen bestehenden Kurs-Alert anhand seiner ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "alert_id": {
                    "type": "string",
                    "description": "Die ID des Alerts (aus list_stock_alerts)",
                },
            },
            "required": ["alert_id"],
        },
    },
]


# ---------------------------------------------------------------------------
# Bildsuche (Unsplash)
# ---------------------------------------------------------------------------

UNSPLASH_TOOL_DEFS = [
    {
        "name": "search_image",
        "description": (
            "Sucht echte Fotos und Bilder aus dem Internet via Unsplash. "
            "Nutze dieses Tool wenn der Nutzer ein Bild, Foto oder eine Aufnahme "
            "aus dem Internet sehen möchte — z.B. 'zeige mir ein Bild von einem Schaf', "
            "'suche ein Foto von Zürich', 'zeig mir wie ein Kolibri aussieht'. "
            "Gibt direkte Bild-URLs zurück die im Chat angezeigt werden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Suchanfrage auf Englisch für beste Ergebnisse, z.B. 'sheep', 'Zurich city', 'hummingbird'",
                },
                "count": {
                    "type": "integer",
                    "description": "Anzahl Bilder (1-3). Standard: 1",
                    "default": 1,
                },
            },
            "required": ["query"],
        },
    },
]


# ---------------------------------------------------------------------------
# Trainings-Erinnerungen
# ---------------------------------------------------------------------------

TRAINING_REMINDER_TOOL_DEFS = [
    {
        "name": "create_training_reminder",
        "description": (
            "Erstellt einen personalisierten Wochentrainingsplan und richtet automatische "
            "E-Mail-Erinnerungen ein. Nutze dieses Tool wenn der Nutzer einen Trainingsplan "
            "erstellen, einen Workout-Kalender aufstellen oder an Training erinnert werden möchte. "
            "Der Nutzer wird per E-Mail erinnert, bevor das Training beginnt."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "training_type": {
                    "type": "string",
                    "description": "Art des Trainings, z.B. 'Kraft', 'Cardio', 'Yoga', 'Laufen', 'Schwimmen'",
                },
                "weekly_schedule": {
                    "type": "object",
                    "description": (
                        "Wochenplan als Objekt. Schlüssel = Wochentag auf Englisch (monday, tuesday, "
                        "wednesday, thursday, friday, saturday, sunday). "
                        "Wert = Objekt mit 'time' (HH:MM) und optionalem 'duration_minutes'. "
                        "Beispiel: {\"monday\": {\"time\": \"07:00\", \"duration_minutes\": 60}, "
                        "\"wednesday\": {\"time\": \"18:30\", \"duration_minutes\": 45}}"
                    ),
                },
                "reminder_minutes_before": {
                    "type": "integer",
                    "description": "Wie viele Minuten vor dem Training die Erinnerungs-E-Mail gesendet wird. Standard: 30",
                    "default": 30,
                },
                "email": {
                    "type": "string",
                    "description": "E-Mail-Adresse für Erinnerungen. Leer = Kunden-E-Mail verwenden.",
                },
                "timezone": {
                    "type": "string",
                    "description": "Zeitzone, z.B. 'Europe/Zurich' (Standard), 'Europe/Berlin', 'UTC'",
                    "default": "Europe/Zurich",
                },
            },
            "required": ["training_type", "weekly_schedule"],
        },
    },
    {
        "name": "list_training_reminders",
        "description": "Zeigt alle aktiven Trainingspläne und Erinnerungen des Nutzers.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "delete_training_reminder",
        "description": "Löscht einen bestehenden Trainingsplan anhand seiner ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reminder_id": {
                    "type": "string",
                    "description": "Die ID des Trainingsplans (aus list_training_reminders)",
                },
            },
            "required": ["reminder_id"],
        },
    },
]


# ---------------------------------------------------------------------------
# Browser (Browserless.io)
# ---------------------------------------------------------------------------

BROWSER_TOOL_DEFS = [
    {
        "name": "browser",
        "description": (
            "Öffnet Webseiten im Browser und steuert diese interaktiv. "
            "Nutze dieses Tool wenn der Nutzer eine Website besuchen, etwas suchen, "
            "auf Buttons klicken, Formulare ausfüllen oder eine Seite bedienen möchte. "
            "Gibt einen Screenshot der aktuellen Seite zurück. "
            "Die Session bleibt zwischen Nachrichten erhalten — du kannst mehrere Schritte machen. "
            "Für Klicks: schätze die x/y-Koordinaten anhand des letzten Screenshots (Viewport: 1280×720)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["navigate", "click", "type", "scroll", "screenshot"],
                    "description": "Aktion: navigate=URL öffnen, click=klicken, type=Text eingeben, scroll=scrollen, screenshot=aktuellen Stand zeigen",
                },
                "url": {
                    "type": "string",
                    "description": "URL für 'navigate' (z.B. 'https://ricardo.ch')",
                },
                "x": {
                    "type": "integer",
                    "description": "X-Koordinate für 'click' (Pixel von links, 0–1280)",
                },
                "y": {
                    "type": "integer",
                    "description": "Y-Koordinate für 'click' (Pixel von oben, 0–720)",
                },
                "text": {
                    "type": "string",
                    "description": "Text für 'type' — wird an der aktuellen Cursorposition eingegeben",
                },
                "submit": {
                    "type": "boolean",
                    "description": "Bei 'type': Enter drücken nach der Eingabe (z.B. für Suche). Standard: false",
                },
                "direction": {
                    "type": "string",
                    "enum": ["down", "up"],
                    "description": "Richtung für 'scroll'. Standard: down",
                },
            },
            "required": ["action"],
        },
    },
]
