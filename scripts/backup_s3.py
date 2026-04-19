"""
S3 Backup Helper — wird via docker exec ai_backend aufgerufen.
Lädt Backup-Dateien hoch oder löscht alte Backups.

Aufruf:
  upload <temp_dir> <date_prefix>
  cleanup <retention_days>
"""
import sys
import os
import boto3
from botocore.config import Config
from pathlib import Path
from datetime import datetime, timezone, timedelta

BUCKET = "baddi-backups"

def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY"],
        aws_secret_access_key=os.environ["S3_SECRET_KEY"],
        region_name="us-east-1",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def upload(temp_dir: str, prefix: str) -> None:
    s3 = _client()
    for f in Path(temp_dir).iterdir():
        key = f"{prefix}/{f.name}"
        size_mb = f.stat().st_size / 1024 / 1024
        print(f"   Lade {f.name} ({size_mb:.1f} MB)...", end=" ", flush=True)
        s3.upload_file(str(f), BUCKET, key)
        print("✓")
    print("   Alle Dateien hochgeladen.")


def cleanup(retention_days: int) -> None:
    s3 = _client()
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    paginator = s3.get_paginator("list_objects_v2")
    deleted = 0
    for page in paginator.paginate(Bucket=BUCKET):
        for obj in page.get("Contents", []):
            if obj["LastModified"] < cutoff:
                s3.delete_object(Bucket=BUCKET, Key=obj["Key"])
                print(f"   Gelöscht: {obj['Key']}")
                deleted += 1
    if deleted == 0:
        print("   Keine alten Backups gefunden.")
    else:
        print(f"   {deleted} Objekte gelöscht.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "upload":
        upload(sys.argv[2], sys.argv[3])
    elif cmd == "cleanup":
        cleanup(int(sys.argv[2]))
    else:
        print(f"Unbekannter Befehl: {cmd}", file=sys.stderr)
        sys.exit(1)
