"""Aktien-Tools: Kurse, Alerts, Portfolio, Dashboard."""
from __future__ import annotations

STOCK_TOOL_DEFS = [
    {
        "name": "get_stock_price",
        "description": (
            "Gibt den aktuellen Aktienkurs, Tages-Performance und wichtige Kennzahlen "
            "für ein börsennotiertes Unternehmen zurück. "
            "Gibt Kurs, Währung, Tagesveränderung, Marktkapitalisierung und mehr zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Börsenkürzel, z.B. 'AAPL', 'NESN.SW', 'NOVN.SW'"},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "search_stock_symbol",
        "description": "Sucht das Börsenkürzel (Ticker) eines Unternehmens anhand seines Namens.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_name": {"type": "string", "description": "Firmenname, z.B. 'Nestlé', 'Apple', 'UBS'"},
            },
            "required": ["company_name"],
        },
    },
    {
        "name": "get_stock_history",
        "description": (
            "Gibt den historischen Kursverlauf einer Aktie zurück. "
            "Gibt monatliche/wöchentliche Schlusskurse als Tabelle zurück."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Börsenkürzel, z.B. 'HOLN.SW', 'AAPL'"},
                "period": {"type": "string", "enum": ["1mo", "3mo", "6mo", "1y", "2y", "5y"], "description": "Zeitraum. Standard: 1y"},
            },
            "required": ["symbol"],
        },
    },
]

STOCK_ALERT_TOOL_DEFS = [
    {
        "name": "create_stock_alert",
        "description": (
            "Richtet eine automatische Kurs-Benachrichtigung per E-Mail ein. "
            "Der Alert wird automatisch alle 15 Minuten (Mo-Fr, 07:00-22:00 Zürich) geprüft."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Börsenkürzel, z.B. 'HOLN.SW'. Falls unbekannt zuerst search_stock_symbol verwenden."},
                "threshold": {"type": "number", "description": "Kurs-Schwellwert, z.B. 70.0"},
                "direction": {"type": "string", "enum": ["above", "below"], "description": "'above' = wenn Kurs ÜBER Schwellwert, 'below' = wenn DARUNTER"},
                "email": {"type": "string", "description": "E-Mail für Benachrichtigung. Leer = Kunden-E-Mail."},
                "company_name": {"type": "string", "description": "Optionaler Firmenname für die E-Mail"},
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
                "alert_id": {"type": "string", "description": "Die ID des Alerts (aus list_stock_alerts)"},
            },
            "required": ["alert_id"],
        },
    },
]

PORTFOLIO_TOOL_DEFS = [
    {
        "name": "portfolio_add_position",
        "description": (
            "Fügt eine Aktienposition zum Portfolio des Nutzers hinzu oder aktualisiert sie. "
            "NICHT verwenden um Kurse anzuzeigen — dafür get_stock_price verwenden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Börsenkürzel, z.B. 'NESN.SW', 'AAPL'"},
                "quantity": {"type": "number", "description": "Anzahl Aktien (Stück)"},
                "buy_price": {"type": "number", "description": "Kaufpreis pro Aktie (Durchschnittlicher Einstandskurs)"},
                "buy_currency": {"type": "string", "description": "Währung des Kaufpreises, z.B. 'CHF', 'USD'. Standard: CHF"},
            },
            "required": ["symbol", "quantity", "buy_price"],
        },
    },
    {
        "name": "portfolio_remove_position",
        "description": "Entfernt eine Aktienposition aus dem Portfolio des Nutzers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Börsenkürzel der zu entfernenden Position"},
            },
            "required": ["symbol"],
        },
    },
]

DASHBOARD_TOOL_DEFS = [
    {
        "name": "populate_dashboard",
        "description": (
            "Füllt das Aktien-Dashboard mit einer Liste von Symbolen und einem Zeitraum. "
            "Das Dashboard wird automatisch geöffnet und zeigt alle Symbole als Diagramm."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Liste der Börsenkürzel, z.B. ['NESN.SW', 'NOVN.SW']. Schweizer Aktien enden auf .SW.",
                },
                "period": {"type": "string", "enum": ["1mo", "3mo", "6mo", "1y", "2y", "5y"], "description": "Zeitraum. Standard: 1y"},
            },
            "required": ["symbols"],
        },
    },
]
