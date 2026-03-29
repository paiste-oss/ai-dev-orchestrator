"""
Monatliche automatische Journalbuchung in Dolibarr.

Läuft am 1. jedes Monats via Celery Beat.
Überträgt alle noch nicht gebuchten Kunden-Rechnungen (VT)
und Bankzahlungen (BQ) ins Hauptbuch.

Da Dolibarr keinen REST-Endpunkt für den Journal-Transfer bietet,
wird direkt in die Dolibarr-Datenbank geschrieben —
exakt wie die Dolibarr UI es tut.
"""
from __future__ import annotations

import logging
from datetime import datetime, date

from tasks.celery_app import celery_app

_log = logging.getLogger(__name__)

_DOLI_DB_HOST = "dolibarr_db"
_DOLI_DB_PORT = 3306
_DOLI_DB_NAME = "dolibarr"
_DOLI_DB_USER = "dolibarr"


def _get_doli_conn():
    """MariaDB-Verbindung zur Dolibarr-Datenbank."""
    import pymysql
    from core.config import settings
    import os
    password = os.environ.get("DOLI_DB_PASSWORD", "")
    return pymysql.connect(
        host=_DOLI_DB_HOST,
        port=_DOLI_DB_PORT,
        user=_DOLI_DB_USER,
        password=password,
        database=_DOLI_DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


@celery_app.task(name="tasks.dolibarr_journal.transfer_journals")
def transfer_journals():
    """
    Überträgt offene Rechnungen und Zahlungen ins Dolibarr-Hauptbuch.
    Wird am 1. jedes Monats um 06:00 ausgeführt.
    """
    try:
        conn = _get_doli_conn()
    except Exception as e:
        _log.error("Dolibarr DB-Verbindung fehlgeschlagen: %s", e)
        return

    try:
        with conn.cursor() as cur:
            vt = _transfer_vt(cur)
            bq = _transfer_bq(cur)
        conn.commit()
        _log.info("Dolibarr Journal-Transfer: VT=%d, BQ=%d neue Einträge", vt, bq)
    except Exception as e:
        conn.rollback()
        _log.error("Dolibarr Journal-Transfer fehlgeschlagen: %s", e)
    finally:
        conn.close()


def _get_admin_user_id(cur) -> int:
    cur.execute("SELECT rowid FROM llx_user WHERE admin=1 AND statut=1 LIMIT 1")
    row = cur.fetchone()
    return row["rowid"] if row else 1


def _transfer_vt(cur) -> int:
    """Überträgt noch nicht gebuchte Kundenrechnungen ins VT-Journal."""
    admin_id = _get_admin_user_id(cur)
    today = date.today()

    # Rechnungen die noch nicht in llx_accounting_bookkeeping sind
    cur.execute("""
        SELECT f.rowid as inv_id, f.ref, f.datef, f.total_ttc, f.total_ht, f.total_tva,
               t.code_client as thirdparty_code, t.nom as thirdparty_name,
               fd.rowid as line_id, fd.total_ht as line_ht, fd.total_tva as line_tva,
               fd.total_ttc as line_ttc, fd.fk_code_ventilation,
               aa.account_number as revenue_account
        FROM llx_facture f
        JOIN llx_societe t ON t.rowid = f.fk_soc
        JOIN llx_facturedet fd ON fd.fk_facture = f.rowid
        LEFT JOIN llx_accounting_account aa ON aa.rowid = fd.fk_code_ventilation
        WHERE f.entity = 1
          AND f.fk_statut IN (1, 2)
          AND fd.fk_code_ventilation > 0
          AND NOT EXISTS (
              SELECT 1 FROM llx_accounting_bookkeeping bk
              WHERE bk.fk_docdet = fd.rowid AND bk.code_journal = 'VT'
          )
    """)
    rows = cur.fetchall()

    count = 0
    for r in rows:
        label = f"{r['thirdparty_name']} - {r['ref']}"
        doc_date = r['datef'] or today
        # Debitor (1100) — Bruttobetrag
        cur.execute("""
            INSERT INTO llx_accounting_bookkeeping
            (entity, ref, piece_num, doc_date, doc_type, doc_ref, fk_doc, fk_docdet,
             thirdparty_code, subledger_account, subledger_label,
             numero_compte, label_compte, label_operation,
             debit, credit, montant, sens,
             code_journal, journal_label, fk_user_author, date_creation)
            VALUES
            (1, %s, 0, %s, 'customer_invoice', %s, %s, %s,
             %s, %s, %s,
             '1100', 'Débiteurs', %s,
             %s, 0, %s, 'D',
             'VT', 'Verkaufsjournal', %s, NOW())
        """, (r['ref'], doc_date, r['ref'], r['inv_id'], r['line_id'],
              r['thirdparty_code'], r['thirdparty_code'], r['thirdparty_name'],
              f"{label} - Nebenbuchkonto",
              float(r['line_ttc'] or 0), float(r['line_ttc'] or 0), admin_id))

        # Erlöskonto (3000) — Nettobetrag
        revenue_acct = r['revenue_account'] or '3000'
        cur.execute("""
            INSERT INTO llx_accounting_bookkeeping
            (entity, ref, piece_num, doc_date, doc_type, doc_ref, fk_doc, fk_docdet,
             thirdparty_code, numero_compte, label_compte, label_operation,
             debit, credit, montant, sens,
             code_journal, journal_label, fk_user_author, date_creation)
            VALUES
            (1, %s, 0, %s, 'customer_invoice', %s, %s, %s,
             %s, %s, 'Umsatzerlöse', %s,
             0, %s, %s, 'C',
             'VT', 'Verkaufsjournal', %s, NOW())
        """, (r['ref'], doc_date, r['ref'], r['inv_id'], r['line_id'],
              r['thirdparty_code'], revenue_acct, f"{label} - Umsatzerlöse",
              float(r['line_ht'] or 0), float(r['line_ht'] or 0), admin_id))

        # MWST (2200)
        if r['line_tva'] and float(r['line_tva']) != 0:
            cur.execute("""
                INSERT INTO llx_accounting_bookkeeping
                (entity, ref, piece_num, doc_date, doc_type, doc_ref, fk_doc, fk_docdet,
                 thirdparty_code, numero_compte, label_compte, label_operation,
                 debit, credit, montant, sens,
                 code_journal, journal_label, fk_user_author, date_creation)
                VALUES
                (1, %s, 0, %s, 'customer_invoice', %s, %s, %s,
                 %s, '2200', 'MWST', %s,
                 0, %s, %s, 'C',
                 'VT', 'Verkaufsjournal', %s, NOW())
            """, (r['ref'], doc_date, r['ref'], r['inv_id'], r['line_id'],
                  r['thirdparty_code'], f"{label} - Taxes 8,1 %",
                  float(r['line_tva']), float(r['line_tva']), admin_id))

        count += 1
    return count


def _transfer_bq(cur) -> int:
    """Überträgt noch nicht gebuchte Bankzahlungen ins BQ-Journal."""
    admin_id = _get_admin_user_id(cur)

    # Bankzeilen die noch nicht in llx_accounting_bookkeeping sind
    cur.execute("""
        SELECT b.rowid as bank_id, b.datev, b.amount, b.label,
               b.fk_account, ba.ref as bank_ref, ba.label as bank_label,
               t.code_client as thirdparty_code, t.nom as thirdparty_name
        FROM llx_bank b
        JOIN llx_bank_account ba ON ba.rowid = b.fk_account
        LEFT JOIN llx_socpeople sp ON sp.rowid = b.fk_user_author
        LEFT JOIN llx_societe t ON t.rowid = (
            SELECT fk_soc FROM llx_bank_url bu WHERE bu.fk_bank = b.rowid AND bu.type = 'company' LIMIT 1
        )
        WHERE NOT EXISTS (
              SELECT 1 FROM llx_accounting_bookkeeping bk
              WHERE bk.fk_doc = b.rowid AND bk.code_journal = 'BQ'
          )
    """)
    rows = cur.fetchall()

    count = 0
    for r in rows:
        amount = float(r['amount'] or 0)
        if amount == 0:
            continue

        doc_date = r['datev'] or date.today()
        thirdparty_name = r['thirdparty_name'] or 'Unbekannt'
        thirdparty_code = r['thirdparty_code'] or ''
        doc_ref = f"ID Bankzeile {r['bank_id']}"
        label = f"Kundenzahlung / Bank {r['bank_label']} / {thirdparty_name}"

        # Bank (1020) — Debit
        cur.execute("""
            INSERT INTO llx_accounting_bookkeeping
            (entity, ref, piece_num, doc_date, doc_type, doc_ref, fk_doc, fk_docdet,
             thirdparty_code, numero_compte, label_compte, label_operation,
             debit, credit, montant, sens,
             code_journal, journal_label, fk_user_author, date_creation)
            VALUES
            (1, %s, 0, %s, 'bank', %s, %s, %s,
             %s, '1020', 'Bank', %s,
             %s, 0, %s, 'D',
             'BQ', 'Finanzjournal', %s, NOW())
        """, (doc_ref, doc_date, doc_ref, r['bank_id'], r['bank_id'],
              thirdparty_code, label,
              abs(amount), abs(amount), admin_id))

        # Debitor (1100) — Credit
        cur.execute("""
            INSERT INTO llx_accounting_bookkeeping
            (entity, ref, piece_num, doc_date, doc_type, doc_ref, fk_doc, fk_docdet,
             thirdparty_code, subledger_account, subledger_label,
             numero_compte, label_compte, label_operation,
             debit, credit, montant, sens,
             code_journal, journal_label, fk_user_author, date_creation)
            VALUES
            (1, %s, 0, %s, 'bank', %s, %s, %s,
             %s, %s, %s,
             '1100', 'Débiteurs', %s,
             0, %s, %s, 'C',
             'BQ', 'Finanzjournal', %s, NOW())
        """, (doc_ref, doc_date, doc_ref, r['bank_id'], r['bank_id'],
              thirdparty_code, thirdparty_code, thirdparty_name,
              f"Kundenzahlung / {thirdparty_name}",
              abs(amount), abs(amount), admin_id))

        count += 1
    return count
