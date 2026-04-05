"""
Agent API
POST /agent/run           → Standard-Prompt ohne Datei
POST /agent/run-with-file → Prompt + hochgeladene Datei (Multipart)
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from core.dependencies import get_current_user
from models.customer import Customer
from services.llm_gateway import chat_with_claude
from services.file_parser import parse_file, is_supported, get_file_extension, SUPPORTED_EXTENSIONS
from services.vector_store import search_customer_documents

router = APIRouter()


class AIRequest(BaseModel):
    prompt: str
    model: str = "auto"
    system_prompt: str | None = None


# ─── Standard Chat ────────────────────────────────────────────────────────────

@router.post("/agent/run")
async def run_agent(
    request: AIRequest,
    current_user: Customer = Depends(get_current_user),
):
    """
    Standard-Prompt. Kundendokumente des eingeloggten Nutzers werden als Kontext einbezogen.
    """
    try:
        customer_id = str(current_user.id)
        prompt_with_context = request.prompt

        doc_context = _build_document_context(customer_id, request.prompt)
        if doc_context:
            prompt_with_context = (
                f"{doc_context}\n\n"
                f"---\n"
                f"Nutzer-Frage: {request.prompt}"
            )

        model = "claude-haiku-4-5-20251001" if request.model == "auto" else request.model
        result = await chat_with_claude(
            messages=[{"role": "user", "content": prompt_with_context}],
            system_prompt=request.system_prompt or "Du bist ein hilfreicher Assistent.",
            model=model,
        )
        return {"status": "success", "output": result.text, "model_used": model}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Interner Serverfehler")


# ─── Chat mit direktem File-Upload ───────────────────────────────────────────

@router.post("/agent/run-with-file")
async def run_agent_with_file(
    file: UploadFile = File(...),
    prompt: str = Form("Analysiere dieses Dokument und fasse es zusammen."),
    model: str = Form("auto"),
    system_prompt: str = Form(""),
    store_postgres: bool = Form(True),
    store_qdrant: bool = Form(True),
    current_user: Customer = Depends(get_current_user),
):
    """
    Nimmt eine Datei + einen Prompt entgegen.
    1. Extrahiert den Text aus der Datei
    2. Optional: Speichert in PostgreSQL und/oder Qdrant (wenn customer_id angegeben)
    3. Schickt Datei-Inhalt + Prompt an den Agenten
    """
    customer_id = str(current_user.id)

    # Datei lesen
    content = await file.read()
    filename = file.filename or "unknown"
    mime_type = file.content_type or ""

    # Dateityp prüfen
    if not is_supported(filename, mime_type):
        ext = get_file_extension(filename)
        raise HTTPException(
            status_code=415,
            detail=f"Dateityp '{ext}' nicht unterstützt. Erlaubt: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # Text extrahieren
    parse_result = parse_file(content, filename, mime_type)

    # Optional: Persistent speichern
    saved_doc_id = None
    if store_postgres or store_qdrant:
        saved_doc_id = await _save_document_async(
            content=content,
            filename=filename,
            mime_type=mime_type,
            customer_id=customer_id,
            parse_result=parse_result,
            store_postgres=store_postgres,
            store_qdrant=store_qdrant,
        )

    # Prompt mit Datei-Inhalt anreichern
    # Kürze bei sehr langen Dokumenten (>12.000 Zeichen) auf relevante Teile
    doc_text = parse_result.text
    if len(doc_text) > 12000:
        doc_text = doc_text[:12000] + f"\n\n[... Dokument zu lang. {len(parse_result.text) - 12000} Zeichen abgeschnitten ...]"

    enriched_prompt = (
        f"[Dokument: {filename}]\n"
        f"[Typ: {get_file_extension(filename).upper()} | "
        f"Seiten: {parse_result.page_count} | "
        f"Zeichen: {len(parse_result.text)}]\n\n"
        f"{doc_text}\n\n"
        f"---\n"
        f"Aufgabe: {prompt}"
    )

    # Modell wählen — Dokument-Analyse → Claude oder Code-Modell bevorzugt
    forced = None if model == "auto" else model
    if model == "auto":
        # Komplexe Dokumente → Claude, einfache → Mistral
        if len(parse_result.text) > 3000:
            forced = "claude-sonnet-4-6"
        else:
            forced = None

    try:
        result = await chat_with_claude(
            messages=[{"role": "user", "content": enriched_prompt}],
            system_prompt=system_prompt or "Du bist ein hilfreicher Assistent. Analysiere das Dokument.",
            model=forced or "claude-sonnet-4-6",
        )
        return {
            "status": "success",
            "output": result.text,
            "model_used": forced or "claude-sonnet-4-6",
            "file": {
                "name": filename,
                "type": get_file_extension(filename),
                "pages": parse_result.page_count,
                "chars": len(parse_result.text),
                "saved_doc_id": saved_doc_id,
            }
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Interner Serverfehler")


# ─── Helper ───────────────────────────────────────────────────────────────────

def _build_document_context(customer_id: str, query: str, top_k: int = 3) -> str:
    """
    Sucht semantisch in Kundendokumenten und baut einen Kontext-String auf.
    Gibt leeren String zurück wenn keine relevanten Dokumente gefunden.
    """
    try:
        results = search_customer_documents(customer_id, query, top_k=top_k)
        if not results:
            return ""

        context_parts = ["[Relevante Informationen aus deinen Dokumenten:]"]
        for i, r in enumerate(results, 1):
            context_parts.append(
                f"\n[Quelle {i}: {r['filename']} | Relevanz: {r['score']:.2f}]\n{r['text']}"
            )
        return "\n".join(context_parts)
    except Exception:
        return ""  # Fehler dürfen den Chat nie blockieren


async def _save_document_async(
    content: bytes,
    filename: str,
    mime_type: str,
    customer_id: str,
    parse_result,
    store_postgres: bool,
    store_qdrant: bool,
) -> str | None:
    """Speichert das Dokument persistent (PostgreSQL + Qdrant)."""
    try:
        from core.database import AsyncSessionLocal
        from models.document import CustomerDocument
        from services.vector_store import store_document_vectors

        async with AsyncSessionLocal() as db:
            cid = uuid.UUID(customer_id)
            unique_filename = f"{customer_id}_{uuid.uuid4().hex[:8]}_{filename}"

            doc = CustomerDocument(
                customer_id=cid,
                filename=unique_filename,
                original_filename=filename,
                file_type=get_file_extension(filename),
                file_size_bytes=len(content),
                mime_type=mime_type,
                extracted_text=parse_result.text if store_postgres else None,
                page_count=parse_result.page_count,
                char_count=len(parse_result.text),
                stored_in_postgres=store_postgres,
                stored_in_qdrant=False,
                doc_metadata=parse_result.metadata,
            )
            db.add(doc)
            await db.commit()
            await db.refresh(doc)

            if store_qdrant and parse_result.text.strip():
                try:
                    point_ids = store_document_vectors(
                        customer_id=customer_id,
                        document_id=str(doc.id),
                        filename=filename,
                        text=parse_result.text,
                    )
                    doc.stored_in_qdrant = True
                    doc.qdrant_point_ids = point_ids
                    doc.qdrant_collection = "customer_documents"
                    await db.commit()
                except Exception as e:
                    print(f"[Agent] Qdrant-Speicherung fehlgeschlagen: {e}")

            return str(doc.id)
    except Exception as e:
        print(f"[Agent] Dokument-Speicherung fehlgeschlagen: {e}")
        return None
