"""
Tool Registry — Alle verfügbaren Buddy-Tools zentral registriert.

Jedes Tool hat:
  - key:         Eindeutiger Bezeichner (z.B. "sbb_transport")
  - name:        Anzeigename
  - description: Was das Tool macht (für Admin-UI)
  - category:    transport | communication | productivity | data | system
  - tier:        free | starter | pro | enterprise
  - tool_def:    Anthropic Tool-Definition(en) für Tool Use
  - handler:     Async-Funktion, die den Tool-Call ausführt
"""
from __future__ import annotations
import asyncio
import httpx
from typing import Any
from services import sbb_client
from services import jina_client
from services import exa_client
from core.config import settings


# ---------------------------------------------------------------------------
# Tool-Definitionen (Anthropic Tool Use Format)
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


async def _handle_web_fetch(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "web_fetch":
        try:
            return await jina_client.fetch_url(tool_input["url"])
        except Exception as e:
            return {"error": f"Seite konnte nicht abgerufen werden: {e}"}
    return {"error": f"Unbekanntes Web-Tool: {tool_name}"}


# ---------------------------------------------------------------------------
# Tool-Handler (Async)
# ---------------------------------------------------------------------------

async def _handle_sbb(tool_name: str, tool_input: dict) -> Any:
    """Führt SBB-Tool-Calls aus und formatiert das Ergebnis kompakt."""
    if tool_name == "sbb_locations":
        result = await sbb_client.search_locations(
            tool_input["query"],
            location_type=tool_input.get("type", "station"),
        )
        stations = result.get("stations", [])[:5]
        return [
            {"id": s.get("id"), "name": s.get("name"), "type": s.get("type")}
            for s in stations if s
        ]

    if tool_name == "sbb_stationboard":
        result = await sbb_client.get_stationboard(
            station=tool_input["station"],
            limit=tool_input.get("limit", 10),
            board_type=tool_input.get("type", "departure"),
            transport_type=tool_input.get("transportation"),
        )
        board = result.get("stationboard", [])
        return [
            {
                "line": j.get("name"),
                "destination": j.get("to"),
                "departure": j.get("stop", {}).get("departure"),
                "platform": j.get("stop", {}).get("platform"),
                "delay": j.get("stop", {}).get("delay", 0),
                "category": j.get("category"),
            }
            for j in board
        ]

    if tool_name == "sbb_connections":
        result = await sbb_client.get_connections(
            from_station=tool_input["from_station"],
            to_station=tool_input["to_station"],
            date=tool_input.get("date"),
            time=tool_input.get("time"),
            is_arrival_time=tool_input.get("is_arrival_time", False),
            limit=tool_input.get("limit", 4),
        )
        connections = result.get("connections", [])
        out = []
        for c in connections:
            from_stop = c.get("from", {})
            to_stop = c.get("to", {})
            out.append({
                "from": from_stop.get("station", {}).get("name"),
                "to": to_stop.get("station", {}).get("name"),
                "departure": from_stop.get("departure"),
                "arrival": to_stop.get("arrival"),
                "duration": c.get("duration"),
                "transfers": c.get("transfers", 0),
                "platform": from_stop.get("platform"),
            })
        return out

    return {"error": f"Unbekanntes SBB-Tool: {tool_name}"}


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


async def _handle_web_search(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "web_search":
        try:
            return await exa_client.search(
                query=tool_input["query"],
                num_results=tool_input.get("num_results", 3),
            )
        except Exception as e:
            return {"error": f"Websuche fehlgeschlagen: {e}"}
    return {"error": f"Unbekanntes Search-Tool: {tool_name}"}


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


async def _handle_dalle(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "generate_image":
        if not settings.openai_api_key:
            return {"error": "OpenAI API Key nicht konfiguriert."}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={
                        "Authorization": f"Bearer {settings.openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "dall-e-3",
                        "prompt": tool_input["prompt"],
                        "size": tool_input.get("size", "1024x1024"),
                        "quality": tool_input.get("quality", "standard"),
                        "n": 1,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            image_url = data["data"][0]["url"]
            return {
                "image_url": image_url,
                "prompt": tool_input["prompt"],
            }
        except Exception as e:
            return {"error": f"Bild konnte nicht erstellt werden: {e}"}
    return {"error": f"Unbekanntes DALL-E Tool: {tool_name}"}


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


async def _handle_stock(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "get_stock_price":
        symbol = tool_input.get("symbol", "").upper()
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            info = ticker.fast_info
            hist = ticker.history(period="2d")

            price = getattr(info, "last_price", None)
            prev_close = getattr(info, "previous_close", None)
            currency = getattr(info, "currency", "USD")
            market_cap = getattr(info, "market_cap", None)
            volume = getattr(info, "last_volume", None)

            change = None
            change_pct = None
            if price and prev_close and prev_close > 0:
                change = round(price - prev_close, 4)
                change_pct = round((change / prev_close) * 100, 2)

            result: dict[str, Any] = {
                "symbol": symbol,
                "price": round(price, 2) if price else None,
                "currency": currency,
                "change": change,
                "change_pct": change_pct,
            }
            if market_cap:
                result["market_cap"] = market_cap
            if volume:
                result["volume"] = volume

            # Full info for company name
            try:
                slow_info = ticker.info
                result["name"] = slow_info.get("longName") or slow_info.get("shortName") or symbol
                result["exchange"] = slow_info.get("exchange")
            except Exception:
                result["name"] = symbol

            return result
        except Exception as e:
            return {"error": f"Aktienkurs für '{symbol}' konnte nicht abgerufen werden: {e}"}

    if tool_name == "search_stock_symbol":
        company = tool_input.get("company_name", "")
        try:
            import yfinance as yf
            results = yf.Search(company, max_results=5)
            quotes = getattr(results, "quotes", []) or []
            out = []
            for q in quotes[:5]:
                if isinstance(q, dict):
                    out.append({
                        "symbol": q.get("symbol"),
                        "name": q.get("longname") or q.get("shortname"),
                        "exchange": q.get("exchange"),
                        "type": q.get("quoteType"),
                    })
            return out if out else {"message": f"Keine Ergebnisse für '{company}'"}
        except Exception as e:
            return {"error": f"Suche fehlgeschlagen: {e}"}

    if tool_name == "get_stock_history":
        symbol = tool_input.get("symbol", "").upper()
        period = tool_input.get("period", "1y")
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)

            # Intervall: bei kurzem Zeitraum wöchentlich, sonst monatlich
            interval = "1wk" if period in ("1mo", "3mo", "6mo") else "1mo"
            hist = ticker.history(period=period, interval=interval)

            if hist.empty:
                return {"error": f"Keine historischen Daten für '{symbol}'"}

            # Kompakte Tabelle: Datum + Schlusskurs + Veränderung %
            rows = []
            closes = hist["Close"].dropna()
            for i, (date, close) in enumerate(closes.items()):
                change_pct = None
                if i > 0:
                    prev = closes.iloc[i - 1]
                    if prev > 0:
                        change_pct = round((close - prev) / prev * 100, 2)
                rows.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "close": round(float(close), 2),
                    "change_pct": change_pct,
                })

            # Zusammenfassung
            first_close = float(closes.iloc[0])
            last_close = float(closes.iloc[-1])
            total_change_pct = round((last_close - first_close) / first_close * 100, 2)

            return {
                "symbol": symbol,
                "period": period,
                "currency": getattr(ticker.fast_info, "currency", "?"),
                "total_change_pct": total_change_pct,
                "start_price": round(first_close, 2),
                "end_price": round(last_close, 2),
                "data_points": rows,
            }
        except Exception as e:
            return {"error": f"Kursverlauf für '{symbol}' konnte nicht abgerufen werden: {e}"}

    return {"error": f"Unbekanntes Stock-Tool: {tool_name}"}


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


async def _handle_unsplash(tool_name: str, tool_input: dict) -> Any:
    if tool_name == "search_image":
        from core.config import settings
        if not settings.unsplash_access_key:
            return {"error": "Unsplash API Key nicht konfiguriert."}
        query = tool_input.get("query", "")
        count = min(tool_input.get("count", 1), 3)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://api.unsplash.com/search/photos",
                    headers={"Authorization": f"Client-ID {settings.unsplash_access_key}"},
                    params={"query": query, "per_page": count, "orientation": "landscape"},
                )
                resp.raise_for_status()
                data = resp.json()
            results = data.get("results", [])
            if not results:
                return {"error": f"Keine Bilder gefunden für '{query}'"}
            images = []
            for r in results:
                images.append({
                    "image_url": r["urls"]["regular"],
                    "description": r.get("alt_description") or r.get("description") or query,
                    "photographer": r["user"]["name"],
                    "source": "Unsplash",
                })
            return images if len(images) > 1 else images[0]
        except Exception as e:
            return {"error": f"Bildsuche fehlgeschlagen: {e}"}
    return {"error": f"Unbekanntes Unsplash-Tool: {tool_name}"}


# ---------------------------------------------------------------------------
# Tool-Katalog
# ---------------------------------------------------------------------------

TOOL_CATALOG: dict[str, dict] = {
    "sbb_transport": {
        "key": "sbb_transport",
        "name": "SBB / Schweizer ÖV",
        "description": "Echtzeit-Fahrpläne, Abfahrtstafeln und Verbindungssuche im Schweizer öffentlichen Verkehr.",
        "prompt_hint": "Echtzeit-Fahrpläne, Abfahrtstafeln und Verbindungssuche im Schweizer ÖV (SBB/Bus/Tram)",
        "category": "transport",
        "tier": "free",
        "tool_defs": SBB_TOOL_DEFS,
        "tool_names": {"sbb_locations", "sbb_stationboard", "sbb_connections"},
        "handler": _handle_sbb,
    },
    "web_fetch": {
        "key": "web_fetch",
        "name": "Web-Zugriff (Jina Reader)",
        "description": "Ruft beliebige Webseiten ab und gibt den Inhalt als lesbaren Text zurück. Kein API-Key nötig.",
        "prompt_hint": "Webseiten abrufen und vollständig lesen — einfach eine URL nennen",
        "category": "data",
        "tier": "free",
        "tool_defs": WEB_FETCH_TOOL_DEFS,
        "tool_names": {"web_fetch"},
        "handler": _handle_web_fetch,
    },
    "web_search": {
        "key": "web_search",
        "name": "Web-Suche (Exa)",
        "description": "Neuronale Websuche für aktuelle Informationen, Nachrichten, Preise und Fakten.",
        "prompt_hint": "Im Internet nach aktuellen Informationen, Nachrichten und Preisen suchen (Exa)",
        "category": "data",
        "tier": "free",
        "tool_defs": WEB_SEARCH_TOOL_DEFS,
        "tool_names": {"web_search"},
        "handler": _handle_web_search,
    },
    "image_generation": {
        "key": "image_generation",
        "name": "Bild-Generierung (DALL-E 3)",
        "description": "Erstellt Bilder per KI anhand einer Textbeschreibung. Nutzt OpenAI DALL-E 3.",
        "prompt_hint": "Echte Bilder generieren und zeichnen mit DALL-E 3 — du kannst wirklich Bilder erstellen!",
        "category": "productivity",
        "tier": "pro",
        "tool_defs": DALLE_TOOL_DEFS,
        "tool_names": {"generate_image"},
        "handler": _handle_dalle,
    },
    "stock_prices": {
        "key": "stock_prices",
        "name": "Aktienkurse (Yahoo Finance)",
        "description": "Live-Aktienkurse, Tagesperformance und Kennzahlen via Yahoo Finance. Kein API-Key nötig.",
        "prompt_hint": "Aktuelle Aktienkurse, Börsendaten und Unternehmenskennzahlen abfragen (Yahoo Finance)",
        "category": "data",
        "tier": "free",
        "tool_defs": STOCK_TOOL_DEFS,
        "tool_names": {"get_stock_price", "search_stock_symbol", "get_stock_history"},
        "handler": _handle_stock,
    },
    "image_search": {
        "key": "image_search",
        "name": "Bildsuche (Unsplash)",
        "description": "Sucht echte Fotos aus dem Internet via Unsplash. Zeigt Bilder direkt im Chat an.",
        "prompt_hint": "Echte Fotos und Bilder aus dem Internet suchen und anzeigen (Unsplash)",
        "category": "data",
        "tier": "free",
        "tool_defs": UNSPLASH_TOOL_DEFS,
        "tool_names": {"search_image"},
        "handler": _handle_unsplash,
    },
    # Weitere Tools können hier ergänzt werden:
    # "google_calendar": { ... }
    # "send_email": { ... }
}


def get_tool_defs(tool_keys: list[str]) -> list[dict]:
    """Gibt die Anthropic Tool-Definitionen für die angegebenen Tool-Keys zurück."""
    defs = []
    for key in tool_keys:
        entry = TOOL_CATALOG.get(key)
        if entry:
            defs.extend(entry["tool_defs"])
    return defs


async def call_tool(tool_name: str, tool_input: dict) -> Any:
    """Führt einen Tool-Call aus — findet automatisch den richtigen Handler."""
    for entry in TOOL_CATALOG.values():
        if tool_name in entry["tool_names"]:
            return await entry["handler"](tool_name, tool_input)
    return {"error": f"Tool '{tool_name}' nicht gefunden"}


def list_tools() -> list[dict]:
    """Gibt alle verfügbaren Tools für die Admin-UI zurück."""
    return [
        {
            "key": v["key"],
            "name": v["name"],
            "description": v["description"],
            "category": v["category"],
            "tier": v["tier"],
        }
        for v in TOOL_CATALOG.values()
    ]
