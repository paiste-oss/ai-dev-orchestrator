"""
Literatur Admin API — User-OA-Overrides anschauen und global bestätigen.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer
from models.literature_global_index import LiteratureGlobalIndex
from models.literature_oa import LiteratureOaBlocklist, LiteratureOaOverride

router = APIRouter(prefix="/system/literature", tags=["system-literature"])
_log = logging.getLogger(__name__)


class OaOverrideAggregate(BaseModel):
    doi: str
    user_count: int
    titles: list[str]
    first_at: datetime
    pool_oa_url: str | None
    pool_oa_status: str | None
    in_blocklist: bool


class BlocklistEntry(BaseModel):
    doi: str
    removed_at: datetime
    reason: str | None
    pool_title: str | None


@router.get("/oa-overrides", response_model=list[OaOverrideAggregate])
async def list_oa_overrides(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Aggregierte Liste aller User-OA-Overrides — pro DOI Anzahl betroffener
    User + Beispiel-Titles. Zeigt auch ob die DOI bereits in der Blocklist ist."""
    # Aggregiert per DOI: Anzahl User + erstes Datum
    agg_q = await db.execute(
        select(
            LiteratureOaOverride.doi,
            func.count(LiteratureOaOverride.customer_id).label("user_count"),
            func.min(LiteratureOaOverride.created_at).label("first_at"),
        ).group_by(LiteratureOaOverride.doi).order_by(func.min(LiteratureOaOverride.created_at).desc())
    )
    aggs = agg_q.all()
    if not aggs:
        return []

    dois = [a.doi for a in aggs]

    # Title-Beispiele (max 3 pro DOI)
    titles_q = await db.execute(
        select(LiteratureOaOverride.doi, LiteratureOaOverride.title_at_override)
        .where(LiteratureOaOverride.doi.in_(dois))
        .where(LiteratureOaOverride.title_at_override.isnot(None))
    )
    titles_by_doi: dict[str, list[str]] = {}
    for d, t in titles_q.all():
        titles_by_doi.setdefault(d, [])
        if t and len(titles_by_doi[d]) < 3 and t not in titles_by_doi[d]:
            titles_by_doi[d].append(t)

    # Pool-Info (oa_url, oa_status)
    pool_q = await db.execute(
        select(LiteratureGlobalIndex.doi, LiteratureGlobalIndex.oa_url, LiteratureGlobalIndex.oa_status, LiteratureGlobalIndex.title)
        .where(LiteratureGlobalIndex.doi.in_(dois))
    )
    pool_by_doi: dict[str, tuple[str | None, str | None, str | None]] = {
        d: (oa_url, oa_status, title) for d, oa_url, oa_status, title in pool_q.all()
    }

    # Blocklist
    bl_q = await db.execute(
        select(LiteratureOaBlocklist.doi).where(LiteratureOaBlocklist.doi.in_(dois))
    )
    blocked = {d for (d,) in bl_q.all()}

    out = []
    for a in aggs:
        pool = pool_by_doi.get(a.doi, (None, None, None))
        out.append(OaOverrideAggregate(
            doi=a.doi,
            user_count=a.user_count,
            titles=titles_by_doi.get(a.doi, [pool[2]] if pool[2] else []),
            first_at=a.first_at,
            pool_oa_url=pool[0],
            pool_oa_status=pool[1],
            in_blocklist=a.doi in blocked,
        ))
    return out


@router.post("/oa-overrides/{doi:path}/confirm")
async def confirm_oa_removal(
    doi: str,
    reason: str | None = None,
    user: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin bestätigt: diese DOI ist endgültig nicht (mehr) Open Access.
    Setzt einen Blocklist-Eintrag UND nullt oa_url im globalen Pool, damit
    neue User keine OA-Anzeige mehr bekommen. Bestehende User-Overrides bleiben.
    """
    from services.literature_enrichment import normalize_doi
    norm = normalize_doi(doi) or doi.lower()

    # 1) Blocklist-Eintrag (idempotent)
    bl = await db.get(LiteratureOaBlocklist, norm)
    if not bl:
        bl = LiteratureOaBlocklist(doi=norm, removed_by=user.id, reason=(reason or "Admin-Confirmation")[:512])
        db.add(bl)

    # 2) Pool-Eintrag entschärfen
    pool = await db.get(LiteratureGlobalIndex, norm)
    if pool:
        pool.oa_url = None
        pool.oa_status = None
        pool.oa_license = None

    await db.commit()
    _log.info("[LiteraturAdmin] OA-Removal bestätigt: %s", norm)
    return {"ok": True, "doi": norm}


@router.delete("/oa-overrides/{doi:path}/blocklist", status_code=204)
async def remove_from_blocklist(
    doi: str,
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin nimmt eine DOI von der Blocklist — Re-Enrichment kann oa_url
    wieder setzen. User-Overrides bleiben unverändert."""
    from services.literature_enrichment import normalize_doi
    norm = normalize_doi(doi) or doi.lower()
    bl = await db.get(LiteratureOaBlocklist, norm)
    if bl:
        await db.delete(bl)
        await db.commit()


@router.get("/oa-blocklist", response_model=list[BlocklistEntry])
async def list_blocklist(
    _: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Vollständige Blocklist."""
    rows_q = await db.execute(
        select(LiteratureOaBlocklist).order_by(LiteratureOaBlocklist.removed_at.desc())
    )
    rows = list(rows_q.scalars().all())
    if not rows:
        return []
    pool_q = await db.execute(
        select(LiteratureGlobalIndex.doi, LiteratureGlobalIndex.title)
        .where(LiteratureGlobalIndex.doi.in_([r.doi for r in rows]))
    )
    titles = {d: t for d, t in pool_q.all()}
    return [
        BlocklistEntry(
            doi=r.doi, removed_at=r.removed_at, reason=r.reason,
            pool_title=titles.get(r.doi),
        )
        for r in rows
    ]
