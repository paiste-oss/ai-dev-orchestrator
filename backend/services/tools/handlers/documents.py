"""Handler für Dokumentensuche: search_documents, list_documents."""
from __future__ import annotations
import math
from typing import Any


def _format_size(bytes_: int) -> str:
    if bytes_ < 1024:
        return f"{bytes_} B"
    if bytes_ < 1024 ** 2:
        return f"{bytes_ / 1024:.1f} KB"
    return f"{bytes_ / 1024 ** 2:.1f} MB"


async def _handle_documents(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    from core.database import AsyncSessionLocal
    from models.document import CustomerDocument
    from sqlalchemy import select, or_, func
    import uuid as uuid_mod

    if not customer_id:
        return {"error": "Kunden-ID fehlt."}

    async with AsyncSessionLocal() as db:
        if tool_name == "search_documents":
            query = tool_input.get("search_query", "").strip()
            if not query:
                return {"error": "Suchbegriff fehlt."}

            doc_type = tool_input.get("document_type", "").strip().lower()
            max_results = min(int(tool_input.get("max_results", 5)), 10)

            # Basis-Filter: aktive Dokumente des Kunden
            stmt = (
                select(CustomerDocument)
                .where(
                    CustomerDocument.customer_id == uuid_mod.UUID(customer_id),
                    CustomerDocument.is_active.is_(True),
                )
            )
            if doc_type:
                stmt = stmt.where(CustomerDocument.file_type == doc_type)

            # Volltextsuche: Treffer in Dateiname oder Inhalt (ILIKE, case-insensitive)
            pattern = f"%{query}%"
            stmt = stmt.where(
                or_(
                    CustomerDocument.original_filename.ilike(pattern),
                    CustomerDocument.extracted_text.ilike(pattern),
                )
            ).limit(max_results)

            result = await db.execute(stmt)
            docs = result.scalars().all()

            if not docs:
                return {
                    "results": [],
                    "message": f"Keine Dokumente gefunden die '{query}' enthalten.",
                }

            hits = []
            for doc in docs:
                # Relevanten Textausschnitt extrahieren
                snippet = None
                if doc.extracted_text:
                    idx = doc.extracted_text.lower().find(query.lower())
                    if idx >= 0:
                        start = max(0, idx - 100)
                        end = min(len(doc.extracted_text), idx + 200)
                        snippet = ("..." if start > 0 else "") + doc.extracted_text[start:end].strip() + ("..." if end < len(doc.extracted_text) else "")

                hits.append({
                    "document_id": str(doc.id),
                    "filename": doc.original_filename,
                    "file_type": doc.file_type,
                    "size": _format_size(doc.file_size_bytes),
                    "pages": doc.page_count,
                    "uploaded": doc.created_at.strftime("%d.%m.%Y"),
                    "snippet": snippet,
                })

            return {
                "results": hits,
                "count": len(hits),
                "query": query,
            }

        elif tool_name == "list_documents":
            doc_type = tool_input.get("document_type", "").strip().lower()

            stmt = (
                select(CustomerDocument)
                .where(
                    CustomerDocument.customer_id == uuid_mod.UUID(customer_id),
                    CustomerDocument.is_active.is_(True),
                )
                .order_by(CustomerDocument.created_at.desc())
                .limit(50)
            )
            if doc_type:
                stmt = stmt.where(CustomerDocument.file_type == doc_type)

            result = await db.execute(stmt)
            docs = result.scalars().all()

            if not docs:
                return {"documents": [], "message": "Keine Dokumente vorhanden."}

            return {
                "documents": [
                    {
                        "document_id": str(doc.id),
                        "filename": doc.original_filename,
                        "file_type": doc.file_type,
                        "size": _format_size(doc.file_size_bytes),
                        "pages": doc.page_count,
                        "chars": doc.char_count,
                        "uploaded": doc.created_at.strftime("%d.%m.%Y"),
                    }
                    for doc in docs
                ],
                "total": len(docs),
            }

    return {"error": f"Unbekanntes Tool: {tool_name}"}
