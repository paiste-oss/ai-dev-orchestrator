"""Handler für die persönliche Bibliothek: library_search, library_read, library_recent."""
from __future__ import annotations

import logging
import uuid as uuid_mod
from datetime import datetime, timedelta
from typing import Any

_log = logging.getLogger(__name__)


def _format_lit_entry(e: Any, with_text: bool = False) -> dict:
    _LABELS = {"paper": "Paper", "book": "Buch", "patent": "Patent",
               "norm": "Norm", "law": "Gesetz", "regulatory": "Regulatorie", "manual": "Manual"}
    type_label = _LABELS.get(e.entry_type, e.entry_type.title())
    out: dict[str, Any] = {
        "id": str(e.id),
        "type": e.entry_type,
        "type_label": type_label,
        "title": e.title,
        "authors": e.authors or [],
        "year": e.year,
    }
    if e.journal: out["journal"] = e.journal
    if e.publisher: out["publisher"] = e.publisher
    if e.doi: out["doi"] = e.doi
    if e.abstract: out["abstract"] = e.abstract[:600]
    if e.notes: out["notes"] = e.notes[:400]
    if e.pdf_s3_key: out["has_pdf"] = True
    if with_text and e.extracted_text:
        out["full_text"] = e.extracted_text[:8000]
    return out


def _format_doc_entry(d: Any, with_text: bool = False) -> dict:
    out: dict[str, Any] = {
        "id": str(d.id),
        "type": "document",
        "filename": d.original_filename,
        "file_type": d.file_type,
        "size_bytes": d.file_size_bytes,
    }
    if d.page_count: out["pages"] = d.page_count
    if d.created_at: out["uploaded"] = d.created_at.strftime("%Y-%m-%d")
    if with_text and d.extracted_text:
        out["full_text"] = d.extracted_text[:8000]
    return out


async def _handle_library(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if not customer_id:
        return {"error": "Kunden-ID fehlt."}

    from core.database import AsyncSessionLocal
    from sqlalchemy import select, func as sa_func
    from models.literature_entry import LiteratureEntry
    from models.document import CustomerDocument
    from services.vector_store import search_customer_documents

    customer_uuid = uuid_mod.UUID(customer_id)

    # ── library_search ──────────────────────────────────────────────────────
    if tool_name == "library_search":
        query = (tool_input.get("query") or "").strip()
        if not query:
            return {"error": "Suchanfrage fehlt."}
        type_filter = (tool_input.get("type") or "all").lower()
        top_k = max(1, min(int(tool_input.get("top_k") or 8), 20))

        wants_lit = type_filter in ("all", "literature", "paper", "book", "patent", "norm", "law", "regulatory", "manual")
        wants_doc = type_filter in ("all", "document")

        results: list[dict] = []

        if wants_lit:
            try:
                hits = search_customer_documents(
                    customer_id=customer_id, query=query,
                    collection_name="literature", top_k=top_k * 2,
                )
                seen: set[str] = set()
                best_chunks: dict[str, str] = {}
                ordered_ids: list[str] = []
                for h in hits:
                    eid = h.get("document_id")
                    if not eid or eid in seen:
                        continue
                    seen.add(eid)
                    ordered_ids.append(eid)
                    best_chunks[eid] = (h.get("text") or "")[:300]
                if ordered_ids:
                    async with AsyncSessionLocal() as db:
                        rel = await db.execute(
                            select(LiteratureEntry).where(
                                LiteratureEntry.customer_id == customer_uuid,
                                LiteratureEntry.is_active.is_(True),
                                LiteratureEntry.baddi_readable.is_(True),
                                LiteratureEntry.id.in_([uuid_mod.UUID(i) for i in ordered_ids]),
                            )
                        )
                        entries = {str(e.id): e for e in rel.scalars().all()}
                    for eid in ordered_ids:
                        e = entries.get(eid)
                        if not e:
                            continue
                        if type_filter in ("paper", "book", "patent", "norm", "law", "regulatory", "manual") and e.entry_type != type_filter:
                            continue
                        formatted = _format_lit_entry(e, with_text=False)
                        formatted["snippet"] = best_chunks.get(eid, "")
                        results.append(formatted)
                        if len(results) >= top_k:
                            break
            except Exception as e:
                _log.warning("library_search literature fehlgeschlagen: %s", e)

        if wants_doc and len(results) < top_k:
            try:
                hits = search_customer_documents(
                    customer_id=customer_id, query=query,
                    collection_name="customer_documents", top_k=top_k,
                )
                seen: set[str] = set()
                best_chunks: dict[str, str] = {}
                ordered_ids: list[str] = []
                for h in hits:
                    did = h.get("document_id")
                    if not did or did in seen:
                        continue
                    seen.add(did)
                    ordered_ids.append(did)
                    best_chunks[did] = (h.get("text") or "")[:300]
                if ordered_ids:
                    async with AsyncSessionLocal() as db:
                        rel = await db.execute(
                            select(CustomerDocument).where(
                                CustomerDocument.customer_id == customer_uuid,
                                CustomerDocument.is_active.is_(True),
                                CustomerDocument.baddi_readable.is_(True),
                                CustomerDocument.id.in_([uuid_mod.UUID(i) for i in ordered_ids]),
                            )
                        )
                        docs = {str(d.id): d for d in rel.scalars().all()}
                    for did in ordered_ids:
                        d = docs.get(did)
                        if d:
                            formatted = _format_doc_entry(d, with_text=False)
                            formatted["snippet"] = best_chunks.get(did, "")
                            results.append(formatted)
                            if len(results) >= top_k:
                                break
            except Exception as e:
                _log.warning("library_search documents fehlgeschlagen: %s", e)

        return {"query": query, "type": type_filter, "results": results, "count": len(results)}

    # ── library_read ────────────────────────────────────────────────────────
    if tool_name == "library_read":
        entry_id = (tool_input.get("id") or "").strip()
        entry_type = (tool_input.get("type") or "").lower()
        if not entry_id or entry_type not in ("literature", "document"):
            return {"error": "id und type (literature|document) sind erforderlich."}

        try:
            entry_uuid = uuid_mod.UUID(entry_id)
        except ValueError:
            return {"error": "Ungültige id."}

        async with AsyncSessionLocal() as db:
            if entry_type == "literature":
                e = await db.get(LiteratureEntry, entry_uuid)
                if not e or e.customer_id != customer_uuid or not e.is_active or not e.baddi_readable:
                    return {"error": "Eintrag nicht gefunden oder nicht zugreifbar."}
                return _format_lit_entry(e, with_text=True)
            else:
                d = await db.get(CustomerDocument, entry_uuid)
                if not d or d.customer_id != customer_uuid or not d.is_active or not d.baddi_readable:
                    return {"error": "Dokument nicht gefunden oder nicht zugreifbar."}
                return _format_doc_entry(d, with_text=True)

    # ── literature_global_search ───────────────────────────────────────────
    if tool_name == "literature_global_search":
        query = (tool_input.get("query") or "").strip()
        if not query:
            return {"error": "Suchbegriff fehlt."}
        limit = max(1, min(int(tool_input.get("limit") or 10), 50))

        from models.literature_global_index import LiteratureGlobalIndex
        async with AsyncSessionLocal() as db:
            tsv = sa_func.to_tsvector("simple",
                sa_func.coalesce(LiteratureGlobalIndex.title, "") + " " +
                sa_func.coalesce(LiteratureGlobalIndex.abstract, ""))
            tsq = sa_func.plainto_tsquery("simple", query)
            rank = sa_func.ts_rank(tsv, tsq)
            stmt = (
                select(LiteratureGlobalIndex)
                .where(tsv.op("@@")(tsq))
                .where(LiteratureGlobalIndex.enrichment_status == "enriched")
                .order_by(rank.desc())
                .limit(limit)
            )
            rows = (await db.execute(stmt)).scalars().all()

            my_dois: set[str] = set()
            if rows:
                my_q = await db.execute(
                    select(LiteratureEntry.doi).where(
                        LiteratureEntry.customer_id == customer_uuid,
                        LiteratureEntry.is_active.is_(True),
                        LiteratureEntry.doi.in_([r.doi for r in rows]),
                    )
                )
                my_dois = {(d or "").strip().lower() for (d,) in my_q.all() if d}

        results = []
        for r in rows:
            results.append({
                "doi": r.doi,
                "title": r.title,
                "authors": r.authors or [],
                "year": r.year,
                "journal": r.journal,
                "abstract": (r.abstract or "")[:600],
                "oa_url": r.oa_url,
                "oa_status": r.oa_status,
                "in_my_library": r.doi in my_dois,
            })
        return {"query": query, "count": len(results), "results": results}

    # ── literature_get_by_doi ──────────────────────────────────────────────
    if tool_name == "literature_get_by_doi":
        raw_doi = (tool_input.get("doi") or "").strip()
        if not raw_doi:
            return {"error": "DOI fehlt."}

        from models.literature_global_index import LiteratureGlobalIndex
        from services.literature_enrichment import enrich_doi, normalize_doi

        norm = normalize_doi(raw_doi)
        if not norm:
            return {"error": f"Ungültige DOI: {raw_doi}"}

        async with AsyncSessionLocal() as db:
            rec = await db.get(LiteratureGlobalIndex, norm)
            if not rec or rec.enrichment_status == "pending":
                rec = await enrich_doi(db, norm)
                await db.commit()
            if not rec or rec.enrichment_status == "failed_404":
                return {"error": f"DOI {norm} nicht in Crossref/Unpaywall gefunden."}

            # In-Library-Check
            my_q = await db.execute(
                select(LiteratureEntry.id).where(
                    LiteratureEntry.customer_id == customer_uuid,
                    LiteratureEntry.is_active.is_(True),
                    LiteratureEntry.doi == norm,
                ).limit(1)
            )
            in_my = my_q.scalar_one_or_none() is not None

        return {
            "doi": rec.doi,
            "title": rec.title,
            "authors": rec.authors or [],
            "year": rec.year,
            "journal": rec.journal,
            "volume": rec.volume,
            "issue": rec.issue,
            "pages": rec.pages,
            "publisher": rec.publisher,
            "abstract": rec.abstract,
            "oa_url": rec.oa_url,
            "oa_status": rec.oa_status,
            "oa_license": rec.oa_license,
            "in_my_library": in_my,
        }

    # ── library_recent ──────────────────────────────────────────────────────
    if tool_name == "library_recent":
        days = max(1, min(int(tool_input.get("days") or 7), 90))
        type_filter = (tool_input.get("type") or "all").lower()
        limit = max(1, min(int(tool_input.get("limit") or 15), 30))
        cutoff = datetime.utcnow() - timedelta(days=days)

        wants_lit = type_filter in ("all", "literature", "paper", "book", "patent", "norm", "law", "regulatory", "manual")
        wants_doc = type_filter in ("all", "document")

        items: list[dict] = []

        async with AsyncSessionLocal() as db:
            if wants_lit:
                stmt = (
                    select(LiteratureEntry)
                    .where(
                        LiteratureEntry.customer_id == customer_uuid,
                        LiteratureEntry.is_active.is_(True),
                        LiteratureEntry.baddi_readable.is_(True),
                        LiteratureEntry.created_at >= cutoff,
                    )
                    .order_by(LiteratureEntry.created_at.desc())
                    .limit(limit)
                )
                if type_filter in ("paper", "book", "patent", "norm", "law", "regulatory", "manual"):
                    stmt = stmt.where(LiteratureEntry.entry_type == type_filter)
                lit_result = await db.execute(stmt)
                for e in lit_result.scalars().all():
                    items.append(_format_lit_entry(e, with_text=False))

            if wants_doc and len(items) < limit:
                stmt_d = (
                    select(CustomerDocument)
                    .where(
                        CustomerDocument.customer_id == customer_uuid,
                        CustomerDocument.is_active.is_(True),
                        CustomerDocument.baddi_readable.is_(True),
                        CustomerDocument.created_at >= cutoff,
                    )
                    .order_by(CustomerDocument.created_at.desc())
                    .limit(limit - len(items))
                )
                doc_result = await db.execute(stmt_d)
                for d in doc_result.scalars().all():
                    items.append(_format_doc_entry(d, with_text=False))

        items.sort(key=lambda i: i.get("uploaded") or "", reverse=True)
        return {"days": days, "type": type_filter, "count": len(items), "items": items[:limit]}

    return {"error": f"Unbekanntes Library-Tool: {tool_name}"}
