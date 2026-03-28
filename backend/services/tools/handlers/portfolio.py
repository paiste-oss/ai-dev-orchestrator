"""Handler für Portfolio-Tools: portfolio_add_position, portfolio_remove_position."""
from __future__ import annotations
import uuid
from typing import Any


async def _handle_portfolio(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if not customer_id:
        return {"error": "Kunden-ID fehlt — Portfolio kann nicht verwaltet werden."}

    if tool_name == "portfolio_add_position":
        symbol = tool_input.get("symbol", "").strip().upper()
        quantity = tool_input.get("quantity")
        buy_price = tool_input.get("buy_price")
        buy_currency = tool_input.get("buy_currency", "CHF").strip().upper()

        if not symbol or quantity is None or buy_price is None:
            return {"error": "symbol, quantity und buy_price sind erforderlich."}

        try:
            from core.database import AsyncSessionLocal
            from models.stock_portfolio import StockPortfolio
            from sqlalchemy import select

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(StockPortfolio).where(
                        StockPortfolio.customer_id == customer_id,
                        StockPortfolio.symbol == symbol,
                    )
                )
                pos = result.scalar_one_or_none()
                if pos:
                    pos.quantity = float(quantity)
                    pos.buy_price = float(buy_price)
                    pos.buy_currency = buy_currency
                    action = "aktualisiert"
                else:
                    db.add(StockPortfolio(
                        id=uuid.uuid4().hex,
                        customer_id=customer_id,
                        symbol=symbol,
                        quantity=float(quantity),
                        buy_price=float(buy_price),
                        buy_currency=buy_currency,
                    ))
                    action = "hinzugefügt"
                await db.commit()

            return {
                "success": True,
                "action": action,
                "symbol": symbol,
                "quantity": quantity,
                "buy_price": buy_price,
                "buy_currency": buy_currency,
                "message": (
                    f"{quantity} × {symbol} zu {buy_price:.2f} {buy_currency} wurde "
                    f"erfolgreich zum Portfolio {action}."
                ),
            }
        except Exception as e:
            return {"error": f"Portfolio konnte nicht gespeichert werden: {e}"}

    if tool_name == "portfolio_remove_position":
        symbol = tool_input.get("symbol", "").strip().upper()
        if not symbol:
            return {"error": "symbol ist erforderlich."}

        try:
            from core.database import AsyncSessionLocal
            from sqlalchemy import delete
            from models.stock_portfolio import StockPortfolio

            async with AsyncSessionLocal() as db:
                await db.execute(
                    delete(StockPortfolio).where(
                        StockPortfolio.customer_id == customer_id,
                        StockPortfolio.symbol == symbol,
                    )
                )
                await db.commit()

            return {
                "success": True,
                "symbol": symbol,
                "message": f"{symbol} wurde aus dem Portfolio entfernt.",
            }
        except Exception as e:
            return {"error": f"Position konnte nicht entfernt werden: {e}"}

    return {"error": f"Unbekanntes Portfolio-Tool: {tool_name}"}
