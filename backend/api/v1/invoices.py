"""
Admin Invoice Processing — PDF-Rechnung hochladen, KI-Extraktion, Dolibarr-Buchung.

Endpunkte (nur Admin):
  POST /v1/admin/invoices/extract   — Text aus Dokument extrahieren + KI-Parse
  POST /v1/admin/invoices/book      — In Dolibarr buchen + in "Rechnungen"-Ordner ablegen
"""
import json
import logging
import uuid
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import require_admin
from models.customer import Customer
from models.document import CustomerDocument
from models.document_folder import DocumentFolder
from services.dolibarr_client import (
    find_supplier,
    create_supplier,
    create_supplier_invoice,
    get_invoice_url,
)
from services.llm_gateway import chat_with_claude

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/invoices", tags=["admin-invoices"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class InvoiceLine(BaseModel):
    desc: str
    qty: float = 1.0
    unit_price: float
    vat_rate: float = 7.7


class ExtractedInvoice(BaseModel):
    supplier_name: str
    supplier_address: str = ""
    supplier_zip: str = ""
    supplier_town: str = ""
    ref_supplier: str = ""
    invoice_date: str = ""       # ISO date string yyyy-mm-dd
    due_date: str | None = None  # ISO date string or null
    total_amount: float = 0.0
    vat_amount: float = 0.0
    currency: str = "CHF"
    iban: str = ""
    note: str = ""
    lines: list[InvoiceLine] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    doc_id: uuid.UUID


class ExtractResponse(BaseModel):
    doc_id: uuid.UUID
    extracted: ExtractedInvoice
    raw_text_preview: str


class BookRequest(BaseModel):
    doc_id: uuid.UUID
    invoice: ExtractedInvoice


class BookResponse(BaseModel):
    dolibarr_invoice_id: int
    dolibarr_url: str
    folder_id: uuid.UUID
    supplier_socid: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


async def _get_or_create_rechnungen_folder(
    customer_id: uuid.UUID, db: AsyncSession
) -> DocumentFolder:
    """Gibt den 'Rechnungen'-Ordner zurück oder erstellt ihn."""
    result = await db.execute(
        select(DocumentFolder).where(
            DocumentFolder.customer_id == customer_id,
            DocumentFolder.name == "Rechnungen",
            DocumentFolder.parent_id.is_(None),
        )
    )
    folder = result.scalar_one_or_none()
    if folder is None:
        folder = DocumentFolder(
            id=uuid.uuid4(),
            customer_id=customer_id,
            name="Rechnungen",
            color="amber",
        )
        db.add(folder)
        await db.flush()
    return folder


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/extract", response_model=ExtractResponse)
async def extract_invoice(
    body: ExtractRequest,
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Liest das Dokument aus der DB und lässt Claude die Rechnungsdaten extrahieren.
    Gibt strukturierte Rechnungsdaten zurück — noch keine Buchung.
    """
    doc = await db.get(CustomerDocument, body.doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden.")
    if not doc.extracted_text:
        raise HTTPException(status_code=422, detail="Kein extrahierter Text für dieses Dokument verfügbar.")

    text_preview = doc.extracted_text[:500]

    system_prompt = (
        "Du bist ein präziser Rechnungsparser. "
        "Extrahiere alle relevanten Felder aus dem Rechnungstext und antworte NUR mit einem validen JSON-Objekt. "
        "Kein Markdown, keine Erklärungen, nur JSON. "
        "Felder: supplier_name, supplier_address, supplier_zip, supplier_town, ref_supplier, "
        "invoice_date (YYYY-MM-DD), due_date (YYYY-MM-DD oder null), total_amount (float), "
        "vat_amount (float), currency (z.B. CHF), iban, note, "
        "lines: [{desc, qty, unit_price, vat_rate}]. "
        "Falls ein Feld fehlt, verwende einen leeren String oder 0."
    )

    user_msg = f"Rechnungstext:\n\n{doc.extracted_text[:8000]}"

    try:
        result = await chat_with_claude(
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=system_prompt,
            model="claude-haiku-4-5-20251001",
        )
        raw = result.text.strip()
        # Claude gibt manchmal ```json ... ``` zurück, entfernen
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data: dict[str, Any] = json.loads(raw)
    except Exception as e:
        _log.warning("Invoice-Extraktion fehlgeschlagen für doc=%s: %s", body.doc_id, e)
        raise HTTPException(status_code=502, detail=f"KI-Extraktion fehlgeschlagen: {e}")

    try:
        extracted = ExtractedInvoice(
            supplier_name=str(data.get("supplier_name", "")),
            supplier_address=str(data.get("supplier_address", "")),
            supplier_zip=str(data.get("supplier_zip", "")),
            supplier_town=str(data.get("supplier_town", "")),
            ref_supplier=str(data.get("ref_supplier", "")),
            invoice_date=str(data.get("invoice_date", "")),
            due_date=data.get("due_date") or None,
            total_amount=float(data.get("total_amount") or 0),
            vat_amount=float(data.get("vat_amount") or 0),
            currency=str(data.get("currency", "CHF")),
            iban=str(data.get("iban", "")),
            note=str(data.get("note", "")),
            lines=[
                InvoiceLine(
                    desc=str(ln.get("desc", "Position")),
                    qty=float(ln.get("qty") or 1),
                    unit_price=float(ln.get("unit_price") or 0),
                    vat_rate=float(ln.get("vat_rate") or 7.7),
                )
                for ln in (data.get("lines") or [])
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Extrahierte Daten ungültig: {e}")

    return ExtractResponse(
        doc_id=body.doc_id,
        extracted=extracted,
        raw_text_preview=text_preview,
    )


@router.post("/book", response_model=BookResponse)
async def book_invoice(
    body: BookRequest,
    admin: Customer = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Bucht die Rechnung in Dolibarr als Entwurf und verschiebt das Dokument in den 'Rechnungen'-Ordner.
    """
    doc = await db.get(CustomerDocument, body.doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden.")

    inv = body.invoice

    # 1. Lieferant in Dolibarr suchen oder anlegen
    try:
        socid = await find_supplier(inv.supplier_name)
        if socid is None:
            socid = await create_supplier(
                name=inv.supplier_name,
                address=inv.supplier_address,
                zip_code=inv.supplier_zip,
                town=inv.supplier_town,
            )
    except Exception as e:
        _log.error("Dolibarr Lieferant Fehler: %s", e)
        raise HTTPException(status_code=502, detail=f"Dolibarr Lieferant: {e}")

    # 2. Rechnungszeilen aufbauen — mindestens eine Zeile
    if inv.lines:
        dolibarr_lines = [
            {
                "desc": ln.desc,
                "qty": ln.qty,
                "subprice": ln.unit_price,
                "tva_tx": ln.vat_rate,
                "product_type": 1,  # 1 = Dienstleistung
            }
            for ln in inv.lines
        ]
    else:
        dolibarr_lines = [
            {
                "desc": f"Rechnung {inv.ref_supplier or 'ohne Ref.'}",
                "qty": 1,
                "subprice": inv.total_amount,
                "tva_tx": 7.7,
                "product_type": 1,
            }
        ]

    invoice_date_obj = _parse_date(inv.invoice_date) or date.today()
    due_date_obj = _parse_date(inv.due_date)

    # 3. Rechnung in Dolibarr erstellen (Entwurf)
    try:
        dolibarr_id = await create_supplier_invoice(
            socid=socid,
            ref_supplier=inv.ref_supplier or doc.original_filename,
            invoice_date=invoice_date_obj,
            due_date=due_date_obj,
            lines=dolibarr_lines,
            note=inv.note,
        )
    except Exception as e:
        _log.error("Dolibarr Rechnung Fehler: %s", e)
        raise HTTPException(status_code=502, detail=f"Dolibarr Buchung: {e}")

    dolibarr_url = await get_invoice_url(dolibarr_id)

    # 4. Dokument in "Rechnungen"-Ordner verschieben
    folder = await _get_or_create_rechnungen_folder(doc.customer_id, db)
    doc.folder_id = folder.id
    await db.commit()

    _log.info(
        "Rechnung gebucht: doc=%s → dolibarr_id=%d, socid=%d, folder=%s",
        body.doc_id, dolibarr_id, socid, folder.id,
    )

    return BookResponse(
        dolibarr_invoice_id=dolibarr_id,
        dolibarr_url=dolibarr_url,
        folder_id=folder.id,
        supplier_socid=socid,
    )
