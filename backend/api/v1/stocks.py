"""
Stocks API — direkte yfinance-Abfragen für das Chart-Dashboard-Fenster.
Kein AI-Tool-Aufruf nötig; Frontend fragt direkt an.
"""
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.stock_portfolio import StockPortfolio

router = APIRouter(prefix="/stocks", tags=["stocks"])

VALID_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}


# ── Hilfsfunktion: aktueller Kurs ─────────────────────────────────────────────

def _current_price(symbol: str) -> tuple[float | None, str]:
    """Gibt (letzter Kurs, Währung) zurück."""
    try:
        import yfinance as yf
        fi = yf.Ticker(symbol).fast_info
        return getattr(fi, "last_price", None), getattr(fi, "currency", "?")
    except Exception:
        return None, "?"


# ── History ────────────────────────────────────────────────────────────────────

@router.get("/history")
async def stock_history(
    symbol: str = Query(...),
    period: str = Query("1y"),
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
            rows.append({"date": date.strftime("%Y-%m-%d"), "close": round(float(close), 2), "change_pct": change_pct})

        first_close = float(closes.iloc[0])
        last_close = float(closes.iloc[-1])
        try:
            info = ticker.info
            name = info.get("longName") or info.get("shortName") or symbol
        except Exception:
            name = symbol

        return {
            "symbol": symbol, "name": name, "period": period,
            "currency": getattr(ticker.fast_info, "currency", "?"),
            "total_change_pct": round((last_close - first_close) / first_close * 100, 2),
            "start_price": round(first_close, 2), "end_price": round(last_close, 2),
            "data_points": rows,
        }
    except Exception as e:
        return {"error": f"Fehler für '{symbol}': {e}"}


# ── Search ─────────────────────────────────────────────────────────────────────

@router.get("/search")
async def stock_search(
    q: str = Query(...),
    _customer: Customer = Depends(get_current_user),
):
    try:
        import yfinance as yf
        results = yf.Search(q, max_results=6)
        quotes = getattr(results, "quotes", []) or []
        return [
            {"symbol": r.get("symbol"), "name": r.get("longname") or r.get("shortname") or r.get("symbol")}
            for r in quotes[:6] if isinstance(r, dict) and r.get("symbol")
        ]
    except Exception as e:
        return {"error": str(e)}


# ── News ───────────────────────────────────────────────────────────────────────

@router.get("/news")
async def stock_news(
    symbols: str = Query(..., description="Kommagetrennte Symbole, z.B. AAPL,NESN.SW"),
    _customer: Customer = Depends(get_current_user),
):
    """Gibt die neuesten News-Artikel für die angegebenen Symbole zurück."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:6]
    seen_ids: set[str] = set()
    articles = []
    try:
        import yfinance as yf
        for sym in sym_list:
            try:
                raw = yf.Ticker(sym).news or []
                for item in raw[:5]:
                    content = item.get("content", {})
                    art_id = content.get("id") or item.get("id", "")
                    if art_id in seen_ids:
                        continue
                    seen_ids.add(art_id)
                    url = (content.get("canonicalUrl") or {}).get("url") or \
                          (content.get("clickThroughUrl") or {}).get("url") or ""
                    thumb = None
                    resolutions = (content.get("thumbnail") or {}).get("resolutions", [])
                    for r in resolutions:
                        if r.get("tag") == "170x128":
                            thumb = r.get("url")
                            break
                    articles.append({
                        "id": art_id,
                        "symbol": sym,
                        "title": content.get("title", ""),
                        "summary": content.get("summary", ""),
                        "url": url,
                        "pub_date": content.get("pubDate", ""),
                        "provider": (content.get("provider") or {}).get("displayName", ""),
                        "thumbnail": thumb,
                    })
            except Exception:
                continue
        # Nach Datum sortieren (neueste zuerst)
        articles.sort(key=lambda a: a["pub_date"], reverse=True)
        return articles[:20]
    except Exception as e:
        return {"error": str(e)}


# ── Portfolio ──────────────────────────────────────────────────────────────────

class PortfolioEntry(BaseModel):
    symbol: str
    quantity: float
    buy_price: float


@router.get("/portfolio")
async def get_portfolio(
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Gibt alle Portfolio-Positionen mit aktuellem Kurs und Gewinn/Verlust zurück."""
    result = await db.execute(
        select(StockPortfolio)
        .where(StockPortfolio.customer_id == str(customer.id))
        .order_by(StockPortfolio.added_at)
    )
    positions = result.scalars().all()

    out = []
    for pos in positions:
        price, currency = _current_price(pos.symbol)
        current_value = round(price * pos.quantity, 2) if price else None
        cost_basis = round(pos.buy_price * pos.quantity, 2)
        gain = round(current_value - cost_basis, 2) if current_value is not None else None
        gain_pct = round((gain / cost_basis) * 100, 2) if gain is not None and cost_basis > 0 else None
        out.append({
            "id": pos.id,
            "symbol": pos.symbol,
            "quantity": pos.quantity,
            "buy_price": pos.buy_price,
            "current_price": round(price, 2) if price else None,
            "currency": currency,
            "current_value": current_value,
            "cost_basis": cost_basis,
            "gain": gain,
            "gain_pct": gain_pct,
        })
    return out


@router.post("/portfolio")
async def upsert_portfolio(
    body: PortfolioEntry,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fügt eine Position hinzu oder aktualisiert sie (Upsert per Symbol)."""
    symbol = body.symbol.upper().strip()
    result = await db.execute(
        select(StockPortfolio).where(
            StockPortfolio.customer_id == str(customer.id),
            StockPortfolio.symbol == symbol,
        )
    )
    pos = result.scalar_one_or_none()
    if pos:
        pos.quantity = body.quantity
        pos.buy_price = body.buy_price
    else:
        db.add(StockPortfolio(
            id=uuid.uuid4().hex,
            customer_id=str(customer.id),
            symbol=symbol,
            quantity=body.quantity,
            buy_price=body.buy_price,
        ))
    await db.commit()
    return {"ok": True, "symbol": symbol}


@router.delete("/portfolio/{symbol}")
async def delete_portfolio(
    symbol: str,
    customer: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(StockPortfolio).where(
            StockPortfolio.customer_id == str(customer.id),
            StockPortfolio.symbol == symbol.upper(),
        )
    )
    await db.commit()
    return {"ok": True}
