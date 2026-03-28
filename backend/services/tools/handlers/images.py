"""Handler für Bild-Tools: generate_image (DALL-E 3) und search_image (Unsplash)."""
from __future__ import annotations
import uuid
import httpx
from typing import Any
from core.config import settings


async def _save_image_document(
    image_url: str,
    filename: str,
    reference: str,
    prompt_or_desc: str,
    customer_id: str,
) -> None:
    """Lädt ein Bild herunter und speichert es als CustomerDocument."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            content = resp.content
            content_type = resp.headers.get("content-type", "image/jpeg")

        ext = "jpg"
        if "png" in content_type:
            ext = "png"
        elif "webp" in content_type:
            ext = "webp"
        elif "gif" in content_type:
            ext = "gif"

        orig_filename = f"{filename}.{ext}"
        unique_filename = f"{customer_id}_{uuid.uuid4().hex[:8]}_{orig_filename}"

        from core.database import AsyncSessionLocal
        from models.document import CustomerDocument
        from models.customer import Customer

        async with AsyncSessionLocal() as db:
            customer = await db.get(Customer, customer_id)
            if customer:
                used = customer.storage_used_bytes or 0
                customer.storage_used_bytes = used + len(content)

            doc = CustomerDocument(
                customer_id=customer_id,
                filename=unique_filename,
                original_filename=orig_filename,
                file_type=ext,
                file_size_bytes=len(content),
                mime_type=content_type.split(";")[0].strip(),
                file_content=content,
                extracted_text=prompt_or_desc,
                page_count=1,
                char_count=len(prompt_or_desc),
                stored_in_postgres=True,
                stored_in_qdrant=False,
                doc_metadata={
                    "category": "Bild",
                    "reference": reference,
                    "source_url": image_url,
                    "description": prompt_or_desc,
                },
            )
            db.add(doc)
            await db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Bild konnte nicht gespeichert werden: {e}")


async def _handle_dalle(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if tool_name == "generate_image":
        if not settings.openai_api_key:
            return {"error": "OpenAI API Key nicht konfiguriert."}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={
                        "Authorization": f"Bearer {settings.openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "dall-e-3",
                        "prompt": tool_input["prompt"],
                        "size": tool_input.get("size", "1024x1024"),
                        "quality": tool_input.get("quality", "standard"),
                        "n": 1,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            image_url = data["data"][0]["url"]

            if customer_id:
                # Dateiname aus Prompt ableiten (max 40 Zeichen, bereinigt)
                safe_name = "".join(c for c in tool_input["prompt"][:40] if c.isalnum() or c in " _-").strip().replace(" ", "_")
                await _save_image_document(
                    image_url=image_url,
                    filename=safe_name or "dall-e-bild",
                    reference="DALL-E 3",
                    prompt_or_desc=tool_input["prompt"],
                    customer_id=customer_id,
                )

            return {
                "image_url": image_url,
                "prompt": tool_input["prompt"],
            }
        except Exception as e:
            return {"error": f"Bild konnte nicht erstellt werden: {e}"}
    return {"error": f"Unbekanntes DALL-E Tool: {tool_name}"}


async def _handle_unsplash(tool_name: str, tool_input: dict, customer_id: str | None = None) -> Any:
    if tool_name == "search_image":
        if not settings.unsplash_access_key:
            return {"error": "Unsplash API Key nicht konfiguriert."}
        query = tool_input.get("query", "")
        count = min(tool_input.get("count", 1), 3)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://api.unsplash.com/search/photos",
                    headers={"Authorization": f"Client-ID {settings.unsplash_access_key}"},
                    params={"query": query, "per_page": count, "orientation": "landscape"},
                )
                resp.raise_for_status()
                data = resp.json()
            results = data.get("results", [])
            if not results:
                return {"error": f"Keine Bilder gefunden für '{query}'"}

            images = []
            for r in results:
                img = {
                    "image_url": r["urls"]["regular"],
                    "description": r.get("alt_description") or r.get("description") or query,
                    "photographer": r["user"]["name"],
                    "source": "Unsplash",
                }
                images.append(img)

                if customer_id:
                    photographer = r["user"]["name"]
                    safe_name = "".join(c for c in query[:30] if c.isalnum() or c in " _-").strip().replace(" ", "_")
                    await _save_image_document(
                        image_url=r["urls"]["regular"],
                        filename=safe_name or "unsplash-foto",
                        reference=f"Unsplash / {photographer}",
                        prompt_or_desc=img["description"],
                        customer_id=customer_id,
                    )

            return images if len(images) > 1 else images[0]
        except Exception as e:
            return {"error": f"Bildsuche fehlgeschlagen: {e}"}
    return {"error": f"Unbekanntes Unsplash-Tool: {tool_name}"}
