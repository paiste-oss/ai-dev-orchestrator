#!/usr/bin/env python3
"""Vercel deployment status — prüfen und neu deployen."""
import os, sys, json, subprocess
import urllib.request, urllib.error

TOKEN = os.getenv("VERCEL_TOKEN", "")
PROJECT_ID = os.getenv("VERCEL_PROJECTID", "")

if not TOKEN or not PROJECT_ID:
    # Lade aus .env im Projektroot
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("VERCEL_TOKEN=") and not TOKEN:
                    TOKEN = line.split("=", 1)[1]
                elif line.startswith("VERCEL_PROJECTID=") and not PROJECT_ID:
                    PROJECT_ID = line.split("=", 1)[1]

if not TOKEN or not PROJECT_ID:
    print("Fehler: VERCEL_TOKEN und VERCEL_PROJECTID müssen in .env oder als Env-Vars gesetzt sein.")
    sys.exit(1)
BASE = "https://api.vercel.com"


def _get(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def _post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


STATE_ICONS = {"READY": "✅", "BUILDING": "🔨", "ERROR": "❌", "CANCELED": "⛔", "QUEUED": "⏳"}


def cmd_status(limit: int = 5) -> None:
    data = _get(f"/v6/deployments?projectId={PROJECT_ID}&limit={limit}")
    print(f"\n{'STATE':<12} {'CREATED':<22} COMMIT")
    print("─" * 80)
    for d in data.get("deployments", []):
        state = d["state"]
        icon = STATE_ICONS.get(state, "?")
        ts = d.get("createdAt", 0)
        import datetime
        dt = datetime.datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
        msg = d.get("meta", {}).get("githubCommitMessage", "–")[:50]
        print(f"{icon} {state:<10} {dt}  {msg}")
    print()


def cmd_redeploy() -> None:
    # Get latest deployment ID and redeploy it
    data = _get(f"/v6/deployments?projectId={PROJECT_ID}&limit=1")
    deps = data.get("deployments", [])
    if not deps:
        print("Kein Deployment gefunden.")
        return
    dep_id = deps[0]["uid"]
    result = _post(f"/v13/deployments?forceNew=1", {"deploymentId": dep_id})
    print(f"Redeploy gestartet: {result.get('url', '?')}")


def cmd_promote(deployment_url: str) -> None:
    """Bestimmtes Deployment auf Production promoten."""
    data = _get(f"/v6/deployments?projectId={PROJECT_ID}&limit=20")
    match = next((d for d in data.get("deployments", []) if deployment_url in d.get("url", "")), None)
    if not match:
        print(f"Deployment '{deployment_url}' nicht gefunden.")
        return
    result = _post(f"/v10/projects/{PROJECT_ID}/promote/{match['uid']}", {})
    print(f"Promoted: {result}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        cmd_status(int(sys.argv[2]) if len(sys.argv) > 2 else 5)
    elif cmd == "redeploy":
        cmd_redeploy()
    elif cmd == "promote":
        cmd_promote(sys.argv[2] if len(sys.argv) > 2 else "")
    else:
        print("Usage: vercel_status.py [status [N] | redeploy | promote <url>]")
