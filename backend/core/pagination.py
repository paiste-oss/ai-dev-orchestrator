"""
Paging-Helper — verhindert dupliziertes count/offset/limit Pattern in allen Endpoints.

Verwendung:
    from core.pagination import paginate, PageParams

    @router.get("/")
    async def list_items(
        p: PageParams = Depends(),
        db: AsyncSession = Depends(get_db),
    ):
        query = select(MyModel).order_by(MyModel.created_at.desc())
        items, total = await paginate(db, query, p)
        return {"items": items, "total": total, "page": p.page, "page_size": p.page_size}
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from fastapi import Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.sql import Select


@dataclass
class PageParams:
    page:      int = Query(1,  ge=1,        description="Seitennummer (ab 1)")
    page_size: int = Query(20, ge=1, le=100, description="Einträge pro Seite")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


async def paginate(
    db: AsyncSession,
    query: Select,
    p: PageParams,
) -> tuple[list[Any], int]:
    """
    Führt count + paginated select aus.
    Gibt (items, total) zurück.
    """
    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar_one()

    items = (await db.execute(
        query.offset(p.offset).limit(p.page_size)
    )).scalars().all()

    return list(items), total
