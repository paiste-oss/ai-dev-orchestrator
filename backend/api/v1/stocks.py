"""
Stocks API — direkte yfinance-Abfragen für das Chart-Dashboard-Fenster.
Kein AI-Tool-Aufruf nötig; Frontend fragt direkt an.
"""
from fastapi import APIRouter, Depends, Query

from core.dependencies import get_current_user
from models.customer import Customer

router = APIRouter(prefix="/stocks", tags=["stocks"])

VALID_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}


@router.get("/history")
async def stock_history(
    symbol: str = Query(..., description="Börsenkürzel, z.B. AAPL, NESN.SW"),
    period: str = Query("1y", description="1mo | 3mo | 6mo | 1y | 2y | 5y"),
    _customer: Customer = Depends(get_current_user),
):
    symbol = symbol.upper().strip()
    if period not in VALID_PERIODS:
        period = "1y"
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        interval = "1wk" if period in ("1mo", "3mo", "6mo") else "1mo"
        hist = ticker.history(period=period, interval=interval)

        if hist.empty:
            return {"error": f"Keine Daten für '{symbol}'"}

        closes = hist["Close"].dropna()
        rows = []
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

        first_close = float(closes.iloc[0])
        last_close = float(closes.iloc[-1])

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
            "total_change_pct": round((last_close - first_close) / first_close * 100, 2),
            "start_price": round(first_close, 2),
            "end_price": round(last_close, 2),
            "data_points": rows,
        }
    except Exception as e:
        return {"error": f"Fehler für '{symbol}': {e}"}


@router.get("/search")
async def stock_search(
    q: str = Query(..., description="Firmenname oder Symbol"),
    _customer: Customer = Depends(get_current_user),
):
    try:
        import yfinance as yf
        results = yf.Search(q, max_results=6)
        quotes = getattr(results, "quotes", []) or []
        return [
            {
                "symbol": r.get("symbol"),
                "name": r.get("longname") or r.get("shortname") or r.get("symbol"),
                "exchange": r.get("exchange"),
            }
            for r in quotes[:6] if isinstance(r, dict) and r.get("symbol")
        ]
    except Exception as e:
        return {"error": str(e)}
