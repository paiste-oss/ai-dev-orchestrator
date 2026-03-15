FROM python:3.11-slim

WORKDIR /app

# System-Dependencies:
# - libpq-dev + gcc: für asyncpg/psycopg2
# - libmupdf-dev: wird von PyMuPDF benötigt (PDF-Parsing)
# - libgl1: für OpenCV/Pillow (optionales Image-Processing in PDFs)
RUN apt-get update && apt-get install -y \
    git \
    libpq-dev \
    gcc \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
