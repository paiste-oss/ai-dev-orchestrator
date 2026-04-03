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
import hashlib
import json
import logging

import httpx

from core.config import settings
from core.redis_client import redis_sync
from core.utils import safe_json_loads

_log = logging.getLogger(__name__)

_REDIS_KEY = "browser:state:{customer_id}"
_TREE_KEY  = "assistenz:tree:{customer_id}:{url_hash}"
_SESSION_TTL = 60 * 30   # 30 Minuten
_TREE_TTL    = 60 * 60 * 24  # 24 Stunden

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
          let base = 0;
          if (t === needle) base = 100;
          else if (t.includes(needle)) base = 50;
          else {
            const matched = words.filter(w => t.includes(w));
            base = matched.length * 10;
          }
          if (base === 0) return 0;
          // Bevorzuge Elemente die tatsächlich im Viewport sichtbar sind
          const r = el.getBoundingClientRect();
          const inView = r.left >= -10 && r.top >= -10 && r.right <= window.innerWidth + 10 && r.bottom <= window.innerHeight + 10;
          return inView ? base + 200 : base;
        }
        const els = Array.from(document.querySelectorAll(sel))
          .filter(el => {
            const r = el.getBoundingClientRect();
            if (r.width < 5 || r.height < 5) return false;
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

  // ── Accessibility-Tree extrahieren ───────────────────────────────────────
  // Gibt alle interaktiven Elemente als kompaktes JSON zurück.
  async function extractTree() {
    const elements = await page.evaluate(() => {
      function getSelector(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        const attr = ['data-testid','data-id','name','aria-label'].find(a => el.getAttribute(a));
        if (attr) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
        // CSS-Pfad aufbauen (max 3 Ebenen)
        const parts = [];
        let cur = el;
        for (let i = 0; i < 3 && cur && cur !== document.body; i++) {
          let seg = cur.tagName.toLowerCase();
          if (cur.id) { seg = '#' + CSS.escape(cur.id); parts.unshift(seg); break; }
          const sibs = Array.from(cur.parentNode?.children || []).filter(c => c.tagName === cur.tagName);
          if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
          parts.unshift(seg);
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      }

      const ROLES = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="tab"], summary';
      const scrollY = window.scrollY;
      return Array.from(document.querySelectorAll(ROLES))
        .filter(el => {
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          return r.width >= 5 && r.height >= 5 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
        })
        .map((el, i) => {
          const r = el.getBoundingClientRect();
          const content = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '').trim().slice(0, 120);
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          return {
            id: i,
            role,
            content,
            selector: getSelector(el),
            bbox: {
              x: Math.round(r.left + r.width / 2),
              y: Math.round(r.top + scrollY + r.height / 2),
              w: Math.round(r.width),
              h: Math.round(r.height),
            },
          };
        })
        .filter(e => e.content.length > 0 || e.role === 'input' || e.role === 'select');
    });
    return elements;
  }

  // ── Aktionen ausführen ────────────────────────────────────────────────────
  let elementX = null, elementY = null;
  let treeJson = null;

  if (action.type === 'navigate') {
    await goto(action.url);
    await acceptCookieConsent();

  } else if (action.type === 'extract_tree') {
    // Seite laden, Tree extrahieren, zurückgeben
    await goto(action.url || url);
    await acceptCookieConsent();
    try { await page.waitForSelector('a, button, input', { timeout: 5000 }); } catch (_) {}
    treeJson = await extractTree();

  } else if (action.type === 'click_selector') {
    // Zuverlässiges Klicken per CSS-Selector
    await goto(url);
    await acceptCookieConsent();
    try {
      await page.waitForSelector(action.selector, { timeout: 5000 });
      const el = await page.$(action.selector);
      if (el) {
        await page.evaluate(el => el.scrollIntoView({ block: 'center' }), el);
        await new Promise(r => setTimeout(r, 400));
        const box = await el.boundingBox();
        if (box) {
          elementX = Math.round(box.x + box.width / 2);
          elementY = Math.round(box.y + box.height / 2);
          await el.click();
          await new Promise(r => setTimeout(r, 1800));
        }
      }
    } catch (_) {}

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

  return { screenshot, cookies: newCookies, url: currentUrl, elementX, elementY, treeJson };
};
"""


def _tree_key(customer_id: str, url: str) -> str:
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    return _TREE_KEY.format(customer_id=customer_id, url_hash=url_hash)


def _load_tree(customer_id: str, url: str) -> list | None:
    raw = redis_sync().get(_tree_key(customer_id, url))
    if raw:
        return safe_json_loads(raw, None)
    return None


def _save_tree(customer_id: str, url: str, tree: list) -> None:
    redis_sync().set(_tree_key(customer_id, url), json.dumps(tree), ex=_TREE_TTL)


async def _find_element_via_tree(tree: list, step_text: str) -> dict | None:
    """
    Fragt Claude Text-API: Welches Element aus dem Tree passt zum Schritt?
    Gibt {selector, x, y} zurück oder None.
    """
    if not settings.anthropic_api_key or not tree:
        return None

    # Kompaktes JSON — nur id, role, content (kein selector/bbox in Prompt)
    compact = [{"id": e["id"], "role": e["role"], "content": e["content"]} for e in tree if e.get("content")]
    compact_json = json.dumps(compact, ensure_ascii=False)

    prompt = (
        f'Hier sind die interaktiven Elemente einer Webseite als JSON-Array:\n{compact_json}\n\n'
        f'Für den Schritt: "{step_text}"\n'
        f'Welches Element soll angeklickt werden?\n'
        f'Antworte NUR mit der numerischen ID des Elements, z.B.: 42\n'
        f'Wenn keines passt: -1'
    )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-haiku-4-5-20251001", "max_tokens": 16, "messages": [{"role": "user", "content": prompt}]},
            )
            resp.raise_for_status()
            text = resp.json()["content"][0]["text"].strip()

        element_id = int("".join(filter(str.isdigit, text)) or "-1")
        if element_id < 0:
            return None

        el = next((e for e in tree if e["id"] == element_id), None)
        if el:
            _log.info("Tree-Match: id=%d role=%s content='%s'", el["id"], el["role"], el["content"][:50])
            return {"selector": el["selector"], "x": el["bbox"]["x"], "y": el["bbox"]["y"]}

    except Exception as exc:
        _log.debug("Tree-Find-Fehler: %s", exc)
    return None


def _load_state(customer_id: str) -> dict:
    raw = redis_sync().get(_REDIS_KEY.format(customer_id=customer_id))
    return safe_json_loads(raw, {"url": "about:blank", "cookies": []})


def _save_state(customer_id: str, state: dict) -> None:
    redis_sync().set(_REDIS_KEY.format(customer_id=customer_id), json.dumps(state), ex=_SESSION_TTL)


async def _call_browserless(context_url: str, cookies: list, action: dict, lang: str) -> dict:
    """Einzelner Browserless-HTTP-Call. Gibt Rohdaten zurück."""
    payload = {
        "code": _PUPPETEER_BASE,
        "context": {"url": context_url, "cookies": cookies, "action": action, "lang": lang},
    }
    async with httpx.AsyncClient(timeout=40.0) as client:
        resp = await client.post(
            f"{settings.browserless_url}/function",
            params={"token": settings.browserless_token},
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()


async def _vision_find_coords(screenshot_b64: str, description: str) -> dict | None:
    """Screenshot → Claude Vision → {x, y} Koordinaten. None wenn nicht gefunden."""
    if not settings.anthropic_api_key or not screenshot_b64:
        return None
    prompt = (
        f'Screenshot einer Webseite (1280×720px).\n'
        f'Finde das klickbare Element für: "{description}"\n'
        f'Antworte NUR mit JSON: {{"x": <zahl>, "y": <zahl>}} oder {{"x": null, "y": null}}\n'
        f'Koordinaten = Pixel-Mittelpunkt des Elements.'
    )
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-haiku-4-5-20251001", "max_tokens": 64, "messages": [{
                    "role": "user", "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": screenshot_b64}},
                        {"type": "text", "text": prompt},
                    ],
                }]},
            )
            resp.raise_for_status()
            text = resp.json()["content"][0]["text"].strip()
        s, e = text.find("{"), text.rfind("}") + 1
        coords = json.loads(text[s:e]) if s >= 0 else {}
        x, y = coords.get("x"), coords.get("y")
        if x is not None and y is not None:
            return {"x": int(x), "y": int(y)}
    except Exception as exc:
        _log.debug("Vision-Fehler: %s", exc)
    return None


async def browser_action(customer_id: str, action: dict, lang: str = "de-CH,de;q=0.9") -> dict:
    """
    Führt eine Browser-Aktion aus. Bei find_and_click: DOM-Suche → Vision-Fallback → Click.

    action-Typen:
      {"type": "navigate", "url": "https://..."}
      {"type": "find_and_click", "text": "Button-Beschreibung", "locateOnly": False}
      {"type": "click", "x": 640, "y": 360}
      {"type": "type", "text": "Hallo", "submit": True}
      {"type": "scroll", "direction": "down"}
    """
    if not settings.browserless_token:
        return {"screenshot_b64": None, "url": "", "error": "Browserless nicht konfiguriert."}

    state = _load_state(customer_id)
    context_url = action.get("url") if action.get("type") == "navigate" else state["url"]

    try:
        data = await _call_browserless(context_url, state["cookies"], action, lang)

        screenshot_b64 = data.get("screenshot", "")
        new_url = data.get("url", context_url)
        new_cookies = data.get("cookies", [])
        el_x = data.get("elementX")
        el_y = data.get("elementY")

        # ── Nach navigate: Tree im Hintergrund extrahieren und cachen ──────────
        if action.get("type") == "navigate" and data.get("treeJson") is None:
            try:
                tree_data = await _call_browserless(
                    new_url, new_cookies,
                    {"type": "extract_tree", "url": new_url},
                    lang,
                )
                if tree_data.get("treeJson"):
                    _save_tree(customer_id, new_url, tree_data["treeJson"])
                    _log.info("Tree gecacht: %d Elemente für %s", len(tree_data["treeJson"]), new_url)
            except Exception as exc:
                _log.debug("Tree-Extraktion fehlgeschlagen: %s", exc)

        # ── extract_tree: Tree speichern ──────────────────────────────────────
        if action.get("type") == "extract_tree" and data.get("treeJson"):
            _save_tree(customer_id, new_url, data["treeJson"])

        # ── find_and_click: Fallback-Kette wenn DOM-Suche scheitert oder (0,0) liefert ──
        if (action.get("type") == "find_and_click" and (el_x is None or (el_x == 0 and el_y == 0))):
            step_text = action.get("text", "")
            _log.info("DOM-Suche erfolglos für '%s'", step_text[:60])

            # Stufe 2: Tree-Suche (cached) + Claude Text-API
            tree = _load_tree(customer_id, new_url)
            if tree:
                match = await _find_element_via_tree(tree, step_text)
                if match:
                    if not action.get("locateOnly"):
                        click_data = await _call_browserless(
                            new_url, new_cookies,
                            {"type": "click_selector", "selector": match["selector"]},
                            lang,
                        )
                        screenshot_b64 = click_data.get("screenshot", screenshot_b64)
                        new_url = click_data.get("url", new_url)
                        new_cookies = click_data.get("cookies", new_cookies)
                        raw_x = click_data.get("elementX")
                        raw_y = click_data.get("elementY")
                        el_x = raw_x if (raw_x is not None and raw_x != 0) else match["x"]
                        el_y = raw_y if (raw_y is not None and raw_y != 0) else match["y"]
                        _log.info("Tree-Click via Selector ausgeführt")
                    else:
                        el_x, el_y = match["x"], match["y"]

            # Stufe 3: Vision-Fallback (wenn Tree nicht vorhanden oder kein Match)
            if (el_x is None or (el_x == 0 and el_y == 0)) and screenshot_b64 and not action.get("locateOnly"):
                _log.info("Vision-Fallback für '%s'", step_text[:60])
                coords = await _vision_find_coords(screenshot_b64, step_text)
                if coords:
                    click_data = await _call_browserless(
                        new_url, new_cookies,
                        {"type": "click", "x": coords["x"], "y": coords["y"]},
                        lang,
                    )
                    screenshot_b64 = click_data.get("screenshot", screenshot_b64)
                    new_url = click_data.get("url", new_url)
                    new_cookies = click_data.get("cookies", new_cookies)
                    el_x, el_y = coords["x"], coords["y"]
                    _log.info("Vision-Click bei (%d, %d)", el_x, el_y)

        _save_state(customer_id, {"url": new_url, "cookies": new_cookies})

        return {
            "screenshot_b64": screenshot_b64,
            "url": new_url,
            "error": None,
            "element_x": el_x,
            "element_y": el_y,
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
