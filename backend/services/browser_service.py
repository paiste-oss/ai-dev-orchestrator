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
  const { url, cookies, action, lang } = context;

  await page.setViewport({ width: 1280, height: 720 });
  // Realistischer User-Agent um Bot-Erkennung zu umgehen
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  if (lang) await page.setExtraHTTPHeaders({ 'Accept-Language': lang });
  if (cookies && cookies.length > 0) {
    try { await page.setCookie(...cookies); } catch (_) {}
  }

  // ── Cookie-Consent automatisch akzeptieren ────────────────────────────────
  async function acceptCookieConsent() {
    try {
      await page.evaluate(() => {
        const selectors = [
          '#onetrust-accept-btn-handler', '#accept-all-cookies', '#cookie-consent-accept',
          '.cookie-accept-all', '.js-accept-cookies', '[data-testid="uc-accept-all-button"]',
          '#uc-btn-accept-banner', '.sp_choice_type_11', '#didomi-notice-agree-button',
          '.cc-accept-all', '[id*="accept-all"]', '[class*="accept-all"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); return; }
        }
        const keywords = ['alle akzeptieren', 'akzeptieren', 'zustimmen', 'accept all',
                          'accept cookies', 'tout accepter', 'accetta tutto', 'ich stimme zu'];
        for (const btn of document.querySelectorAll('button, a[role="button"], [type="button"]')) {
          const t = btn.textContent?.trim().toLowerCase() ?? '';
          if (keywords.some(k => t === k || t.startsWith(k))) { btn.click(); return; }
        }
      });
      await new Promise(r => setTimeout(r, 800));
    } catch (_) {}
  }

  // ── Goto: wartet auf networkidle + extra Zeit für JS-SPAs ────────────────
  async function goto(targetUrl) {
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 28000 });
    } catch (_) {
      // Fallback: Seite ist teilweise geladen, trotzdem weitermachen
    }
    // Extra-Wartezeit für React/Vue/Angular Hydration
    await new Promise(r => setTimeout(r, 2000));
  }

  // ── DOM-Text-Suche mit Auto-Scroll ────────────────────────────────────────
  // Sucht interaktive Elemente per Text, scrollt bis es sichtbar ist.
  // locateOnly=true → kein Klick, nur Position ermitteln.
  async function findAndClick(searchText, locateOnly, maxScrolls) {
    // Suchbegriff normalisieren: Anführungszeichen + Verben entfernen
    const needle = searchText
      .replace(/[«»„""']/g, '')
      .replace(/\b(klicken|wählen|eingeben|absenden|öffnen|drücken|auf|button|link)\b/gi, '')
      .trim().toLowerCase();
    const words = needle.split(/\\s+/).filter(w => w.length > 2);

    const SEL = 'button, a, input[type="submit"], input[type="button"], input[type="reset"], ' +
                '[role="button"], [role="link"], label, [class*="btn"], [class*="button"], ' +
                '[class*="cta"], summary';

    for (let scroll = 0; scroll <= maxScrolls; scroll++) {
      // Im DOM nach bestem Treffer suchen (scoring)
      const found = await page.evaluate((sel, needle, words) => {
        function score(el) {
          const t = (el.innerText || el.value || el.getAttribute('aria-label') ||
                     el.getAttribute('title') || '').toLowerCase().trim();
          if (!t) return 0;
          if (t === needle) return 100;
          if (t.includes(needle)) return 50;
          const matched = words.filter(w => t.includes(w));
          return matched.length * 10;
        }
        const els = Array.from(document.querySelectorAll(sel))
          .filter(el => {
            const s = window.getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
          });
        let best = null, bestScore = 0;
        for (const el of els) {
          const s = score(el);
          if (s > bestScore) { bestScore = s; best = el; }
        }
        if (!best || bestScore === 0) return null;
        const r = best.getBoundingClientRect();
        return {
          absX: r.left + window.scrollX + r.width / 2,
          absY: r.top  + window.scrollY + r.height / 2,
          viewX: r.left + r.width / 2,
          viewY: r.top  + r.height / 2,
          inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
          score: bestScore,
        };
      }, SEL, needle, words);

      if (found) {
        // Zum Element scrollen falls nicht sichtbar
        if (!found.inViewport) {
          await page.evaluate(y => window.scrollTo(0, Math.max(0, y - 300)), found.absY);
          await new Promise(r => setTimeout(r, 400));
          // Viewport-Koordinaten nach Scroll neu berechnen
          const updated = await page.evaluate((ax, ay) => ({
            viewX: ax - window.scrollX,
            viewY: ay - window.scrollY,
          }), found.absX, found.absY);
          found.viewX = updated.viewX;
          found.viewY = updated.viewY;
        }
        if (!locateOnly) {
          await page.mouse.click(found.viewX, found.viewY);
          await new Promise(r => setTimeout(r, 1800));
        }
        return found;
      }

      // Nicht gefunden: Seite weiter nach unten scrollen
      if (scroll < maxScrolls) {
        const atBottom = await page.evaluate(() =>
          window.scrollY + window.innerHeight >= document.body.scrollHeight - 50
        );
        if (atBottom) break;
        await page.evaluate(() => window.scrollBy(0, 600));
        await new Promise(r => setTimeout(r, 350));
      }
    }
    return null;
  }

  // ── Aktionen ausführen ────────────────────────────────────────────────────
  let elementX = null, elementY = null;

  if (action.type === 'navigate') {
    await goto(action.url);
    await acceptCookieConsent();

  } else if (action.type === 'find_and_click') {
    // Primäre Methode: DOM-Text-Suche + Auto-Scroll
    await goto(url);
    await acceptCookieConsent();
    // Warten bis mindestens ein interaktives Element im DOM erscheint
    try {
      await page.waitForSelector('button, a[href], input[type="submit"], [role="button"]', { timeout: 5000 });
    } catch (_) {}
    const el = await findAndClick(
      action.text,
      action.locateOnly ?? false,
      action.maxScrolls ?? 5
    );
    if (el) { elementX = Math.round(el.viewX); elementY = Math.round(el.viewY); }

  } else if (action.type === 'click') {
    await goto(url);
    await acceptCookieConsent();
    await page.mouse.click(action.x, action.y);
    await new Promise(r => setTimeout(r, 1500));

  } else if (action.type === 'type') {
    await goto(url);
    await acceptCookieConsent();
    await page.keyboard.type(action.text, { delay: 40 });
    if (action.submit) {
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 2000));
    }

  } else if (action.type === 'scroll') {
    await goto(url);
    await acceptCookieConsent();
    await page.evaluate(d => window.scrollBy(0, d), action.direction === 'down' ? 600 : -600);
    await new Promise(r => setTimeout(r, 500));

  } else {
    await goto(url);
    await acceptCookieConsent();
  }

  const screenshot = await page.screenshot({ type: 'jpeg', quality: 75, encoding: 'base64' });
  const newCookies = await page.cookies();
  const currentUrl = page.url();

  return { screenshot, cookies: newCookies, url: currentUrl, elementX, elementY };
};
"""


def _load_state(customer_id: str) -> dict:
    raw = redis_sync().get(_REDIS_KEY.format(customer_id=customer_id))
    return safe_json_loads(raw, {"url": "about:blank", "cookies": []})


def _save_state(customer_id: str, state: dict) -> None:
    redis_sync().set(_REDIS_KEY.format(customer_id=customer_id), json.dumps(state), ex=_SESSION_TTL)


async def browser_action(customer_id: str, action: dict, lang: str = "de-CH,de;q=0.9") -> dict:
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
            "lang": lang,
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

        return {
            "screenshot_b64": screenshot_b64,
            "url": new_url,
            "error": None,
            "element_x": data.get("elementX"),
            "element_y": data.get("elementY"),
        }

    except httpx.HTTPStatusError as e:
        _log.warning("Browserless HTTP-Fehler: %s — %s", e.response.status_code, e.response.text[:200])
        return {"screenshot_b64": None, "url": context_url, "error": f"Browserless-Fehler: {e.response.status_code}"}
    except Exception as e:
        _log.warning("Browserless-Fehler: %s", e)
        return {"screenshot_b64": None, "url": context_url, "error": str(e)}


def clear_browser_session(customer_id: str) -> None:
    """Löscht die gespeicherte Browser-Sitzung."""
    redis_sync().delete(_REDIS_KEY.format(customer_id=customer_id))
