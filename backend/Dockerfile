FROM python:3.11-slim

# Arbeitsverzeichnis im Container
WORKDIR /app

# System-Tools installieren (für Git-Support)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Software-Liste kopieren und installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Den restlichen Code kopieren
COPY . .

# Befehl zum Starten der API
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]