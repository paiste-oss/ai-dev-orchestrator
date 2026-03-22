#!/usr/bin/env python3
"""
Claude Code Runner — WSL Host Service
======================================
Nimmt Dev-Tasks aus dem Backend und führt sie mit Claude Code CLI aus.

Kommunikation: Backend HTTP API (172.28.224.1:8000)
Claude Binary: lokal auf WSL

Verwendung:
  python3 scripts/claude-runner.py

Systemd:
  sudo systemctl start claude-runner
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime

# ── Konfiguration ──────────────────────────────────────────────────────────────

BACKEND_URL    = os.environ.get("BACKEND_URL",    "http://172.28.224.1:8000")
RUNNER_SECRET  = os.environ.get("RUNNER_SECRET",  "")
PROJECT_ROOT   = os.environ.get("PROJECT_ROOT",   "/home/naor/ai-dev-orchestrator")
POLL_INTERVAL  = int(os.environ.get("POLL_INTERVAL", "5"))   # Sekunden zwischen Polls

# Claude Binary aus VSCode Extension (oder PATH)
CLAUDE_BIN = os.environ.get(
    "CLAUDE_BIN",
    "/home/naor/.vscode-server/extensions/anthropic.claude-code-2.1.81-linux-x64/resources/native-binary/claude",
)


# ── API-Hilfsfunktionen ────────────────────────────────────────────────────────

def _api(method: str, path: str, body: dict | None = None) -> dict | None:
    url  = f"{BACKEND_URL}/v1{path}"
    data = json.dumps(body).encode() if body is not None else None
    req  = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Content-Type":    "application/json",
            "X-Runner-Secret": RUNNER_SECRET,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except urllib.error.URLError as e:
        raise ConnectionError(f"Backend nicht erreichbar ({BACKEND_URL}): {e.reason}") from e


def get_next_task() -> dict | None:
    return _api("GET", "/dev-tasks/runner/next")

def push_output(task_id: str, output: str) -> None:
    try:
        _api("POST", f"/dev-tasks/runner/{task_id}/output", {"output": output})
    except Exception:
        pass  # Live-Output ist best-effort

def complete_task(task_id: str, output: str, tokens: int = 0) -> None:
    _api("POST", f"/dev-tasks/runner/{task_id}/complete", {"output": output, "tokens": tokens})

def fail_task(task_id: str, output: str, error: str) -> None:
    _api("POST", f"/dev-tasks/runner/{task_id}/fail", {"output": output, "error": error})

def pause_task(task_id: str, output: str, retry_after: int = 60) -> None:
    _api("POST", f"/dev-tasks/runner/{task_id}/pause", {
        "output": output,
        "retry_after_seconds": retry_after,
    })


# ── Task-Ausführung ────────────────────────────────────────────────────────────

def run_task(task: dict) -> None:
    task_id     = task["id"]
    description = task["description"]
    title       = task["title"]

    log(f"▶ Task {task_id[:8]} — {title}")

    cmd = [
        CLAUDE_BIN,
        "--print",                         # nicht-interaktiv, Output auf stdout
        "--dangerously-skip-permissions",  # keine Rückfragen bei File/Bash-Ops
        "--output-format", "text",         # plain text Output
        description,
    ]

    output_lines: list[str] = []

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=PROJECT_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env={**os.environ, "ANTHROPIC_API_KEY": os.environ.get("ANTHROPIC_API_KEY", "")},
        )

        for raw_line in proc.stdout:
            line = raw_line.rstrip()
            if not line:
                continue
            output_lines.append(line)
            # Live-Output alle ~10 Zeilen pushen
            if len(output_lines) % 10 == 0:
                push_output(task_id, "\n".join(output_lines))

        proc.wait()
        final_output = "\n".join(output_lines)

        # Finalen Output pushen
        push_output(task_id, final_output)

        if proc.returncode == 0:
            complete_task(task_id, final_output)
            log(f"✓ Task {task_id[:8]} abgeschlossen")
        else:
            fail_task(task_id, final_output, f"Claude exit code {proc.returncode}")
            log(f"✗ Task {task_id[:8]} fehlgeschlagen (exit {proc.returncode})")

    except FileNotFoundError:
        error = f"Claude Binary nicht gefunden: {CLAUDE_BIN}"
        fail_task(task_id, "", error)
        log(f"✗ {error}")
    except Exception as e:
        output = "\n".join(output_lines)
        fail_task(task_id, output, str(e))
        log(f"✗ Task {task_id[:8]} Fehler: {e}")


# ── Logging ────────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Hauptschleife ──────────────────────────────────────────────────────────────

def main() -> None:
    log(f"Claude Code Runner gestartet")
    log(f"Backend:  {BACKEND_URL}")
    log(f"Projekt:  {PROJECT_ROOT}")
    log(f"Claude:   {CLAUDE_BIN}")

    if not os.path.exists(CLAUDE_BIN):
        log(f"FEHLER: Claude Binary nicht gefunden: {CLAUDE_BIN}")
        log("Bitte CLAUDE_BIN setzen oder Claude Code Extension installieren.")
        sys.exit(1)

    if not RUNNER_SECRET:
        log("WARNUNG: RUNNER_SECRET nicht gesetzt — alle Runner-Requests werden abgelehnt.")

    log(f"Polling alle {POLL_INTERVAL}s für neue Tasks...")

    while True:
        try:
            task = get_next_task()
            if task:
                run_task(task)
            else:
                time.sleep(POLL_INTERVAL)
        except ConnectionError as e:
            log(f"Verbindungsfehler: {e} — Retry in 15s")
            time.sleep(15)
        except KeyboardInterrupt:
            log("Runner gestoppt.")
            break
        except Exception as e:
            log(f"Unerwarteter Fehler: {e} — Retry in {POLL_INTERVAL}s")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
