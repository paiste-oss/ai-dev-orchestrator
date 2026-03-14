import requests

# Dieses Skript simuliert einen Klick auf den Button
def run_daily_update():
    url = "http://localhost:8000/agent/run"
    payload = {
        "prompt": "Führe einen kompletten Projekt-Scan durch und erstelle eine JSON-Zusammenfassung des aktuellen Stands für das Langzeitgedächtnis.",
        "model": "llama3.1"
    }
    try:
        response = requests.post(url, json=payload)
        print("Tägliches Update abgeschlossen:", response.json())
    except Exception as e:
        print("Fehler beim täglichen Update:", e)

if __name__ == "__main__":
    run_daily_update()