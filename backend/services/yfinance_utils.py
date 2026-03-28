"""
Gemeinsame yfinance-Hilfsfunktionen — verhindert Duplikation in
api/v1/stocks.py, services/tools/handlers/stocks.py und tasks/stock_alerts.py.
"""
from __future__ import annotations
from typing import Any


def get_interval(period: str) -> str:
    """Wöchentliches Intervall für kurze Perioden, monatlich für lange."""
    return "1wk" if period in ("1mo", "3mo", "6mo") else "1mo"


def pct_change(new: float, old: float) -> float | None:
    """Prozentuale Veränderung, None wenn old == 0."""
    if not old:
        return None
    return round((new - old) / old * 100, 2)


def fetch_history(symbol: str, period: str) -> dict[str, Any]:
    """
    Holt historische Kursdaten via yfinance.

    Returns dict mit data_points, start_price, end_price, total_change_pct,
    currency, name — oder {"error": "..."} bei Fehler.
    """
    import yfinance as yf
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval=get_interval(period))
    if hist.empty:
        return {"error": f"Keine Daten für '{symbol}'"}

    closes = hist["Close"].dropna()
    rows: list[dict] = []
    for i, (date, close) in enumerate(closes.items()):
        rows.append({
            "date": date.strftime("%Y-%m-%d"),
            "close": round(float(close), 2),
            "change_pct": pct_change(float(close), float(closes.iloc[i - 1])) if i > 0 else None,
        })

    first = float(closes.iloc[0])
    last = float(closes.iloc[-1])
    try:
        info = ticker.info
        name = info.get("longName") or info.get("shortName") or symbol
    except Exception:
        name = symbol

    return {
        "symbol": symbol,
        "name": name,
        "period": period,
        "currency": getattr(ticker.fast_info, "currency", "?"),
        "total_change_pct": pct_change(last, first),
        "start_price": round(first, 2),
        "end_price": round(last, 2),
        "data_points": rows,
    }


def fetch_price(symbol: str) -> tuple[float | None, str]:
    """Gibt (letzter Kurs, Währung) zurück."""
    try:
        import yfinance as yf
        fi = yf.Ticker(symbol).fast_info
        return getattr(fi, "last_price", None), getattr(fi, "currency", "?")
    except Exception:
        return None, "?"


def search_symbols(query: str, max_results: int = 6) -> list[dict]:
    """Sucht Börsensymbole anhand eines Firmennamens oder Kürzels."""
    try:
        import yfinance as yf
        results = yf.Search(query, max_results=max_results)
        quotes = getattr(results, "quotes", []) or []
        return [
            {
                "symbol": r.get("symbol"),
                "name": r.get("longname") or r.get("shortname") or r.get("symbol"),
                "exchange": r.get("exchange"),
            }
            for r in quotes if isinstance(r, dict) and r.get("symbol")
        ]
    except Exception:
        return []
