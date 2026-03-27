"""
Browserless.io — Web-Automatisierung für Baddi-Chat.

Jede Aktion:
  1. Stellt den gespeicherten Sitzungszustand wieder her (URL + Cookies aus Redis)
  2. Führt die Aktion aus (navigate / click / type / scroll)
  3. Macht einen Screenshot (JPEG, 1280×720)
  4. Speichert neuen Zustand in Redis
  5. Gibt den Screenshot als base64-String zurück

Der Screenshot wird im Chat als browser_view-Karte angezeigt.
"""
import base64
import json
import logging

import httpx

from core.config import settings
from core.redis_client import redis_sync
from core.utils import safe_json_loads

_log = logging.getLogger(__name__)

_REDIS_KEY = "browser:state:{customer_id}"
_SESSION_TTL = 60 * 30  # 30 Minuten

# ── Puppeteer-Snippets ─────────────────────────────────────────────────────────

_PUPPETEER_BASE = """
export default async ({ page, context }) => {
  const { url, cookies, action } = context;

  // Viewport setzen
  await page.setViewport({ width: 1280, height: 720 });

  // Cookies wiederherstellen
  if (cookies && cookies.length > 0) {
    try { await page.setCookie(...cookies); } catch (_) {}
  }

  // Cookie-Consent-Popups automatisch akzeptieren
  async function acceptCookieConsent() {
    try {
      await page.evaluate(() => {
        // Bekannte IDs und Klassen (OneTrust, Cookiebot, Swiss/German Sites)
        const selectors = [
          '#onetrust-accept-btn-handler',
          '#accept-all-cookies',
          '#cookie-consent-accept',
          '#cookieConsent button[class*="accept"]',
          '.cookie-accept-all',
          '.js-accept-cookies',
          '[data-testid="uc-accept-all-button"]',
          '#uc-btn-accept-banner',
          '.sp_choice_type_11',
          '#didomi-notice-agree-button',
          '.didomi-continue-without-agreeing',
          '.cc-accept-all',
          '[id*="accept-all"]',
          '[class*="accept-all"]',
          '[id*="cookie"][id*="accept"]',
          '[class*="cookie"][class*="accept"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); return true; }
        }

        // Fallback: Button-Text suchen (DE/FR/IT/EN)
        const keywords = ['alle akzeptieren', 'akzeptieren', 'zustimmen', 'einverstanden',
                          'accept all', 'accept cookies', 'tout accepter', 'accetta tutto',
                          'ich stimme zu', 'ok', 'agree'];
        const buttons = Array.from(document.querySelectorAll('button, a[role="button"], [type="button"]'));
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toLowerCase() ?? '';
          if (keywords.some(k => text === k || text.startsWith(k))) {
            btn.click(); return true;
          }
        }
        return false;
      });
      // Kurz warten damit das Popup verschwindet
      await new Promise(r => setTimeout(r, 800));
    } catch (_) {}
  }

  // Aktion ausführen
  if (action.type === 'navigate') {
    await page.goto(action.url, { waitUntil: 'networkidle2', timeout: 20000 });
    await acceptCookieConsent();

  } else if (action.type === 'click') {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await acceptCookieConsent();
    await page.mouse.click(action.x, action.y);
    await new Promise(r => setTimeout(r, 1500));

  } else if (action.type === 'type') {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await acceptCookieConsent();
    await page.keyboard.type(action.text, { delay: 40 });
    if (action.submit) {
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 2000));
    }

  } else if (action.type === 'scroll') {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await acceptCookieConsent();
    const delta = action.direction === 'down' ? 600 : -600;
    await page.evaluate((d) => window.scrollBy(0, d), delta);
    await new Promise(r => setTimeout(r, 500));

  } else {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await acceptCookieConsent();
  }

  // Screenshot + Zustand
  const screenshot = await page.screenshot({ type: 'jpeg', quality: 75, encoding: 'base64' });
  const newCookies = await page.cookies();
  const currentUrl = page.url();

  return { screenshot, cookies: newCookies, url: currentUrl };
};
"""


def _load_state(customer_id: str) -> dict:
    raw = redis_sync().get(_REDIS_KEY.format(customer_id=customer_id))
    return safe_json_loads(raw, {"url": "about:blank", "cookies": []})


def _save_state(customer_id: str, state: dict) -> None:
    redis_sync().set(_REDIS_KEY.format(customer_id=customer_id), json.dumps(state), ex=_SESSION_TTL)


async def browser_action(customer_id: str, action: dict) -> dict:
    """
    Führt eine Browser-Aktion aus und gibt das Ergebnis zurück.

    action-Typen:
      {"type": "navigate", "url": "https://..."}
      {"type": "click", "x": 640, "y": 360}
      {"type": "type", "text": "Hallo", "submit": True}
      {"type": "scroll", "direction": "down"}
      {"type": "screenshot"}

    Rückgabe:
      {"screenshot_b64": "...", "url": "https://...", "error": None}
    """
    if not settings.browserless_token:
        return {"screenshot_b64": None, "url": "", "error": "Browserless nicht konfiguriert."}

    state = _load_state(customer_id)

    # Für navigate: URL direkt aus Action
    context_url = action.get("url") if action.get("type") == "navigate" else state["url"]

    payload = {
        "code": _PUPPETEER_BASE,
        "context": {
            "url": context_url,
            "cookies": state["cookies"],
            "action": action,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(
                f"{settings.browserless_url}/function",
                params={"token": settings.browserless_token},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        screenshot_b64 = data.get("screenshot", "")
        new_url = data.get("url", context_url)
        new_cookies = data.get("cookies", [])

        _save_state(customer_id, {"url": new_url, "cookies": new_cookies})

        return {"screenshot_b64": screenshot_b64, "url": new_url, "error": None}

    except httpx.HTTPStatusError as e:
        _log.warning("Browserless HTTP-Fehler: %s — %s", e.response.status_code, e.response.text[:200])
        return {"screenshot_b64": None, "url": context_url, "error": f"Browserless-Fehler: {e.response.status_code}"}
    except Exception as e:
        _log.warning("Browserless-Fehler: %s", e)
        return {"screenshot_b64": None, "url": context_url, "error": str(e)}


def clear_browser_session(customer_id: str) -> None:
    """Löscht die gespeicherte Browser-Sitzung."""
    redis_sync().delete(_REDIS_KEY.format(customer_id=customer_id))
