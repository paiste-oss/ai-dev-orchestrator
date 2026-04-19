"""
S3 Storage Service — Infomaniak Object Storage (S3-kompatibel).

Alle Datei-Binärdaten landen in S3, nicht in PostgreSQL.
Pfad-Schema: customers/{customer_id}/{doc_id}/{filename}

boto3-Quirks für OpenStack Swift:
- region_name="us-east-1" ist ein Pflicht-Platzhalter (Swift ignoriert ihn)
- request_checksum_calculation="when_required" verhindert aws-chunked Transfer-Encoding
"""
import logging
import uuid
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from core.config import settings

_log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name="us-east-1",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def build_s3_key(customer_id: uuid.UUID, doc_id: uuid.UUID, filename: str) -> str:
    return f"customers/{customer_id}/{doc_id}/{filename}"


def upload_file(
    customer_id: uuid.UUID,
    doc_id: uuid.UUID,
    filename: str,
    content: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """Lädt Datei-Bytes nach S3 hoch. Gibt den S3-Key zurück."""
    key = build_s3_key(customer_id, doc_id, filename)
    try:
        _get_client().put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
            ContentLength=len(content),
        )
        _log.info("S3 Upload: %s (%d Bytes)", key, len(content))
        return key
    except ClientError as e:
        _log.error("S3 Upload fehlgeschlagen für '%s': %s", key, e)
        raise


def download_file(s3_key: str) -> bytes:
    """Lädt Datei-Bytes aus S3 herunter."""
    try:
        resp = _get_client().get_object(Bucket=settings.s3_bucket, Key=s3_key)
        return resp["Body"].read()
    except ClientError as e:
        _log.error("S3 Download fehlgeschlagen für '%s': %s", s3_key, e)
        raise


def delete_file(s3_key: str) -> None:
    """Löscht eine Datei aus S3."""
    try:
        _get_client().delete_object(Bucket=settings.s3_bucket, Key=s3_key)
        _log.info("S3 Gelöscht: %s", s3_key)
    except ClientError as e:
        _log.error("S3 Löschen fehlgeschlagen für '%s': %s", s3_key, e)
        raise


def file_exists(s3_key: str) -> bool:
    """Prüft ob eine Datei in S3 existiert."""
    try:
        _get_client().head_object(Bucket=settings.s3_bucket, Key=s3_key)
        return True
    except ClientError:
        return False
