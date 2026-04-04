"""
n8n Credential Service — Lesen und Entschlüsseln von n8n-Credentials aus SQLite.

Ausgelagert aus api/v1/workflows.py damit:
- Krypto-Logik testbar und isoliert ist
- Der API-Router keine kryptografischen Abhängigkeiten importiert
- Die Entschlüsselung an einem einzigen Ort liegt
"""
import base64
import hashlib
import json
import os
import sqlite3

from core.config import settings

N8N_SQLITE_PATH = "/n8n_data/database.sqlite"

# Felder die NICHT an den Client weitergegeben werden
_SENSITIVE_FIELDS = {"password", "apiKey", "accessToken", "secret", "privateKey", "pass"}


def _evp_bytes_to_key(password: bytes, salt: bytes, key_len: int, iv_len: int) -> tuple[bytes, bytes]:
    """OpenSSL EVP_BytesToKey mit MD5 — entspricht crypto-js Standard."""
    d, prev = b"", b""
    while len(d) < key_len + iv_len:
        prev = hashlib.md5(prev + password + salt).digest()
        d += prev
    return d[:key_len], d[key_len:key_len + iv_len]


def decrypt_n8n_credential(encrypted_b64: str) -> dict:
    """Entschlüsselt einen n8n-Credential-Datensatz (AES-256-CBC, OpenSSL-Format)."""
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad

    raw = base64.b64decode(encrypted_b64)
    if raw[:8] != b"Salted__":
        raise ValueError("Ungültiges Credential-Format: Salted__-Prefix fehlt")
    salt = raw[8:16]
    ciphertext = raw[16:]
    key, iv = _evp_bytes_to_key(settings.n8n_encryption_key.encode(), salt, 32, 16)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    decrypted = unpad(cipher.decrypt(ciphertext), AES.block_size)
    return json.loads(decrypted.decode("utf-8"))


def read_n8n_credentials() -> list[dict]:
    """Liest alle Credentials aus der n8n SQLite-DB, entschlüsselt und bereinigt sie.
    Sensitive Felder (API-Keys, Passwörter) werden vor der Rückgabe entfernt.
    Läuft synchron — muss via anyio.to_thread.run_sync() aus async Kontext aufgerufen werden.
    """
    if not os.path.exists(N8N_SQLITE_PATH):
        return []
    results = []
    con = sqlite3.connect(f"file:{N8N_SQLITE_PATH}?mode=ro", uri=True)
    try:
        rows = con.execute("SELECT id, name, type, data FROM credentials_entity").fetchall()
        for cred_id, name, cred_type, data_enc in rows:
            try:
                data = decrypt_n8n_credential(data_enc)
                safe = {k: v for k, v in data.items() if k not in _SENSITIVE_FIELDS}
                results.append({"id": cred_id, "name": name, "type": cred_type, "data": safe})
            except Exception:
                results.append({"id": cred_id, "name": name, "type": cred_type, "data": {}})
    finally:
        con.close()
    return results
