"""Handler für Aktien-Tools: get_stock_price, search_stock_symbol, get_stock_history, stock_alerts."""
from __future__ import annotations
from typing import Any


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


async def _handle_stock_alerts(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    from core.database import AsyncSessionLocal
    from models.stock_alert import StockAlert
    from models.customer import Customer
    from sqlalchemy import select
    import uuid as uuid_mod

    if not customer_id:
        return {"error": "Kunden-ID fehlt — Alert kann nicht angelegt werden."}

    async with AsyncSessionLocal() as db:
        if tool_name == "create_stock_alert":
            # Kunden-E-Mail als Fallback
            email = tool_input.get("email")
            if not email:
                cust = await db.get(Customer, uuid_mod.UUID(customer_id))
                email = cust.email if cust else None
            if not email:
                return {"error": "Keine E-Mail-Adresse gefunden."}

            symbol = tool_input.get("symbol", "").upper()
            threshold = float(tool_input.get("threshold", 0))
            direction = tool_input.get("direction", "above")

            # Aktuellen Kurs für Currency ermitteln
            currency = "CHF"
            try:
                import yfinance as yf
                info = yf.Ticker(symbol).fast_info
                currency = getattr(info, "currency", "CHF") or "CHF"
            except Exception:
                pass

            alert = StockAlert(
                customer_id=uuid_mod.UUID(customer_id),
                email=email,
                symbol=symbol,
                company_name=tool_input.get("company_name"),
                threshold=threshold,
                direction=direction,
                currency=currency,
            )
            db.add(alert)
            await db.commit()
            await db.refresh(alert)

            direction_de = "über" if direction == "above" else "unter"
            return {
                "success": True,
                "alert_id": str(alert.id),
                "message": (
                    f"Alert angelegt: Du erhältst eine E-Mail an {email}, "
                    f"sobald {symbol} {direction_de} {threshold:.2f} {currency} liegt. "
                    f"Prüfung alle 15 Minuten (Mo–Fr 07:00–22:00 Zürich)."
                ),
            }

        elif tool_name == "list_stock_alerts":
            result = await db.execute(
                select(StockAlert)
                .where(StockAlert.customer_id == uuid_mod.UUID(customer_id), StockAlert.is_active.is_(True))
                .order_by(StockAlert.created_at.desc())
            )
            alerts = result.scalars().all()
            if not alerts:
                return {"alerts": [], "message": "Keine aktiven Kurs-Alerts."}
            return {
                "alerts": [
                    {
                        "id": str(a.id),
                        "symbol": a.symbol,
                        "company": a.company_name,
                        "threshold": a.threshold,
                        "direction": a.direction,
                        "currency": a.currency,
                        "email": a.email,
                        "created_at": a.created_at.strftime("%d.%m.%Y %H:%M"),
                    }
                    for a in alerts
                ]
            }

        elif tool_name == "delete_stock_alert":
            alert_id = tool_input.get("alert_id")
            alert = await db.get(StockAlert, uuid_mod.UUID(alert_id))
            if not alert or str(alert.customer_id) != customer_id:
                return {"error": "Alert nicht gefunden."}
            alert.is_active = False
            await db.commit()
            return {"success": True, "message": f"Alert für {alert.symbol} wurde gelöscht."}

    return {"error": f"Unbekanntes Tool: {tool_name}"}
