"""
Stocks API — direkte yfinance-Abfragen für das Chart-Dashboard-Fenster.
Kein AI-Tool-Aufruf nötig; Frontend fragt direkt an.
"""
import logging
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.customer import Customer
from models.stock_portfolio import StockPortfolio
from services.yfinance_utils import fetch_history, fetch_price, search_symbols

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/stocks", tags=["stocks"])

VALID_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}


# ── History ────────────────────────────────────────────────────────────────────

@router.get("/history")
async def stock_history(
    symbol: str = Query(...),
    period: str = Query("1y"),
    _customer: Customer = Depends(get_current_user),
):
    symbol = symbol.upper().strip()[:20]  # Länge begrenzen
    if period not in VALID_PERIODS:
        period = "1y"
    try:
        return fetch_history(symbol, period)
    except Exception as e:
        _log.warning("Kurshistorie für '%s' nicht verfügbar: %s", symbol, e)
        raise HTTPException(status_code=503, detail=f"Kursdaten für '{symbol}' nicht verfügbar")


# ── Search ─────────────────────────────────────────────────────────────────────

@router.get("/search")
async def stock_search(
    q: str = Query(...),
    _customer: Customer = Depends(get_current_user),
):
    try:
        results = search_symbols(q)
        return [{"symbol": r["symbol"], "name": r["name"]} for r in results]
    except Exception as e:
        _log.warning("Symbol-Suche fehlgeschlagen für '%s': %s", q, e)
        return []


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
    buy_currency: str = "CHF"


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
        try:
            price, currency = fetch_price(pos.symbol)
        except Exception as e:
            _log.warning("Kurs für '%s' nicht verfügbar: %s", pos.symbol, e)
            price, currency = None, "CHF"
        current_value = round(price * pos.quantity, 2) if price else None
        cost_basis = round(pos.buy_price * pos.quantity, 2)
        gain = round(current_value - cost_basis, 2) if current_value is not None else None
        gain_pct = round((gain / cost_basis) * 100, 2) if gain is not None and cost_basis > 0 else None
        out.append({
            "id": pos.id,
            "symbol": pos.symbol,
            "quantity": pos.quantity,
            "buy_price": pos.buy_price,
            "buy_currency": pos.buy_currency or "CHF",
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
        pos.buy_currency = body.buy_currency.upper()
    else:
        db.add(StockPortfolio(
            id=uuid.uuid4().hex,
            customer_id=str(customer.id),
            symbol=symbol,
            quantity=body.quantity,
            buy_price=body.buy_price,
            buy_currency=body.buy_currency.upper(),
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
