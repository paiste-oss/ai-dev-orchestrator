from services.knowledge_store import store_knowledge_chunks
import uuid

IV_PROCESS_GUIDE = """
IV-Anmeldeprozess Schweiz — Vollständiger Leitfaden

=== ÜBERBLICK ===
Die IV-Anmeldung ist ein mehrstufiger Prozess der 3-18 Monate dauern kann.
Wichtig: Frühzeitig anmelden — der Anspruch beginnt frühestens 6 Monate vor der Anmeldung rückwirkend.
Grundsatz: Eingliederung vor Rente (Art. 8a IVG) — IV versucht zuerst Wiedereingliederung.

=== PHASE 1: VORBEREITUNG (Wochen 1-4) ===

Schritt 1.1 — Anspruchsprüfung
- Anspruch auf IV besteht bei dauerhafter Einschränkung der Erwerbsfähigkeit oder Hilflosigkeit
- Voraussetzung: Mindestens 1 Jahr AHV-Beiträge ODER Schweizer Bürgerschaft/Aufenthaltsbewilligung
- Wartezeit: Anspruch frühestens nach 1 Jahr ununterbrochener Arbeitsunfähigkeit (Art. 28 IVG)
- Rückwirkung: Rente rückwirkend bis max. 12 Monate vor Anmeldung möglich

Schritt 1.2 — Anmeldeformular einreichen
- Formular: Anmeldung zur IV (IVAanm) — erhältlich bei IV-Stelle oder www.ahv-iv.ch
- Einreichen bei: Kantonale IV-Stelle des Wohnkantons (nicht Gemeinde, nicht AHV-Kasse)
- Liste der IV-Stellen: www.ahv-iv.ch/de/Kontakte

Schritt 1.3 — Ärztliche Erstbescheinigung
- Hausarzt / Facharzt: Arztbericht für die IV (Formular) ausfüllen lassen
- Inhalt: Diagnose, Beginn Erkrankung, Einschränkungen, laufende Behandlungen
- IVG Art. 43: Mitwirkungspflicht — Betroffene müssen an Abklärungen aktiv mithelfen

=== PHASE 2: MEDIZINISCHE ABKLÄRUNG (Monate 1-6) ===

Schritt 2.1 — Eingangsbestätigung und Fallnummer
- IV-Stelle bestätigt Eingang ca. 2-4 Wochen nach Anmeldung
- Fallnummer erhalten — für alle weiteren Schriftwechsel nötig
- Zugewiesener Fallmanager/Eingliederungsberater wird mitgeteilt

Schritt 2.2 — Medizinische Unterlagen einreichen
Die IV-Stelle fordert folgende Dokumente an:
- Arztberichte der letzten 3-5 Jahre (alle Fachärzte)
- Krankenhausberichte, Operationsberichte
- Psychiatrische Gutachten (bei psychischen Erkrankungen zwingend)
- Ergotherapie-Berichte, Physiotherapie-Berichte
- Alle Berichte werden direkt von Ärzten an IV gesendet (IVV Art. 91)

Schritt 2.3 — Medizinisches Gutachten MEDAS
- IV kann unabhängiges Gutachten bei MEDAS (Medizinische Abklärungsstelle) anordnen
- Termin: Meist 3-6 Monate nach Anmeldung
- Polydisziplinäre Untersuchung durch mehrere Fachärzte (2-4 Stunden)
- Ergebnis: 4-8 Wochen nach Termin
- Kosten trägt die IV vollständig
- Recht: Gutachterstelle kann abgelehnt und neue vorgeschlagen werden (BGer-Rechtsprechung)
- Tipp: Ausgeruht erscheinen, alle Beschwerden vollständig schildern (auch gute Tage/schlechte Tage)

Schritt 2.4 — Arbeitgeberbericht
- Formular Arbeitgeberbericht — Arbeitgeber beschreibt Auswirkungen auf Arbeit
- IV kommuniziert direkt mit Arbeitgeber (nur mit Einwilligung des Betroffenen)

=== PHASE 3: EINGLIEDERUNG (Monate 3-12) ===

Schritt 3.1 — Eingliederungsmassnahmen (vor Rente)
Mögliche Massnahmen der IV:
- Berufsberatung (kostenlos, kein Antragserfordernis)
- Umschulung auf neuen Beruf (IV übernimmt alle Kosten)
- Arbeitsversuch / Belastbarkeitstraining (mit IV-Unterstützung)
- Arbeitsvermittlung durch IV-Stelle
- Hilfsmittel: Rollstuhl, Hörgerät, orthopädische Schuhe, Computer, etc.

Schritt 3.2 — Taggelder während Eingliederung
- 80% des bisherigen versicherten Verdienstes
- Maximum 2024: CHF 429/Tag (CHF 12'870/Monat)
- Dauer: Solange Eingliederungsmassnahmen dauern

Schritt 3.3 — Frühintervention (Art. 7a IVG)
- Möglich innerhalb 12 Monate nach Beginn der Arbeitsunfähigkeit
- Arbeitgeber kann IV frühzeitig einschalten (präventiv)
- Ziel: Arbeitsplatzerhalt durch Anpassungen (Arbeitszeit, Aufgaben, Hilfsmittel)

=== PHASE 4: RENTENENTSCHEID (Monate 6-18) ===

Schritt 4.1 — Invaliditätsgrad-Berechnung
Die IV berechnet den Invaliditätsgrad nach Einkommensvergleich:
- Vergleich: Lohn ohne Behinderung vs. zumutbarer Lohn mit Behinderung
- LSE-Tabellen (Lohnstrukturerhebung) für Vergleichswerte
- < 40%: Kein Rentenanspruch
- 40-49%: Viertelsrente (Art. 28 IVG)
- 50-59%: Halbe Rente
- 60-69%: Dreiviertelsrente
- 70% und mehr: Ganze Rente

Schritt 4.2 — Vorbescheid
- IV sendet Vorbescheid (Schreiben) vor dem formellen Entscheid
- Frist: 30 Tage für Einsprache (Einsprachefrist beachten!)
- Bei Uneinigkeit: Schriftliche Einsprache mit Begründung und neuen Unterlagen einlegen
- Einsprache kostenlos

Schritt 4.3 — Formelle Verfügung
- Formeller Entscheid (Verfügung) per Post
- Rechtsmittel: Beschwerde beim kantonalen Versicherungsgericht innerhalb 30 Tagen
- Verfahren kostenlos (Art. 61 ATSG)
- Recht auf kostenlose Rechtsberatung bei Pro Infirmis oder Integrationsstellen

=== PHASE 5: RENTE UND LAUFENDE BEZÜGE ===

Schritt 5.1 — Beginn und Höhe der Rente
- Rente beginnt frühestens nach 12 Monaten Wartezeit (Art. 28 IVG)
- Rentenbeträge 2024 (volle Beitragszeit):
  - Mindestbetrag: CHF 604/Monat (Viertelsrente)
  - Maximalbetrag: CHF 2'450/Monat (ganze Rente)
  - Kinderrente: + CHF 941/Monat pro Kind (bis 18 oder 25 J. bei Ausbildung)
  - Hilflosenentschädigung falls Pflegebedarf vorhanden

Schritt 5.2 — Ergänzungsleistungen (EL) separat beantragen
- Falls IV-Rente + andere Einkünfte nicht ausreichen → EL beantragen!
- EL werden NICHT automatisch ausbezahlt — separat beantragen
- Antrag bei: AHV-Ausgleichskasse des Wohnkantons (NICHT IV-Stelle)
- Anspruch ab erstem Monat der IV-Rente
- ELG SR 831.301 regelt die Details

Schritt 5.3 — Laufende Rentenüberprüfung
- IV überprüft Invaliditätsgrad alle 3-5 Jahre automatisch
- Verbesserung des Gesundheitszustands muss der IV gemeldet werden
- Verschlechterung kann zur Rentenerhöhung führen (Revision beantragen)

=== CHECKLISTE ANMELDUNG IV ===
Formular IVAanm (Anmeldeformular) ausgefüllt
Arztberichte der letzten 5 Jahre (alle Fachärzte)
Krankenhausberichte und Operationsberichte
Psychiatrische Berichte (falls zutreffend)
Lohnausweise der letzten 3 Jahre
Arbeitgeberbestätigung und Stellenbeschrieb
AHV-Ausweis (Sozialversicherungsnummer)
Aufenthaltsbewilligung (bei Ausländern)
Bankverbindung (IBAN)

=== WICHTIGE KONTAKTE ===
- IV-Stellen: www.ahv-iv.ch/de/Kontakte (nach Kanton)
- Informationsstelle AHV/IV: Tel. 058 462 95 11
- Pro Infirmis (kostenlose IV-Beratung): www.proinfirmis.ch, Tel. 058 775 20 00
- Integration Handicap (Rechtsberatung): www.integrationhandicap.ch
- Procap (Rechtsschutz für Menschen mit Behinderung): www.procap.ch

=== RELEVANTE GESETZE ===
- IVG (SR 831.20): Invalidenversicherungsgesetz — Grundgesetz der IV
- IVV (SR 831.201): Verordnung über die Invalidenversicherung — Detailregeln und Verfahren
- ATSG (SR 830.1): Allgemeiner Teil des Sozialversicherungsrechts — Verfahrensrecht, Einsprachen
- ELG (SR 831.301): Bundesgesetz über Ergänzungsleistungen zur AHV und IV
- AHVG (SR 831.10): AHV-Gesetz (Beitragszeiten und Renten relevant)

=== HÄUFIGE FEHLER UND TIPPS ===
Fehler 1: Zu spät anmelden — Rente wird max. 12 Monate rückwirkend bezahlt, sofort anmelden!
Fehler 2: Unvollständige Unterlagen — Alle Arztberichte einreichen, Checkliste nutzen
Fehler 3: MEDAS-Gutachten unterschätzen — Alle Beschwerden vollständig schildern, auch an schlechten Tagen
Fehler 4: Vorbescheid ignorieren — Immer innert 30 Tagen reagieren, bei Unsicherheit Einsprache
Fehler 5: EL vergessen — Ergänzungsleistungen separat bei AHV-Kasse beantragen
Fehler 6: Keine Beratung suchen — Pro Infirmis bietet kostenlose IV-Prozessberatung

=== ZEITLICHER ABLAUF (TYPISCH) ===
Monat 0: Anmeldung einreichen (sofort bei Beginn der Einschränkung!)
Monate 1-2: Eingangsbestätigung, Fallnummer, erster Kontakt mit Fallmanager
Monate 2-4: Medizinische Unterlagen einreichen, Arztberichte organisieren
Monate 3-6: MEDAS-Gutachten-Termin, Eingliederungsmassnahmen parallel
Monate 6-12: Auswertung Gutachten, Berechnung Invaliditätsgrad
Monate 9-15: Vorbescheid, ggf. Einsprache, Verfügung
Monate 12-18: Rentenauszahlung beginnt (falls anspruchsberechtigt)
Nach Verfügung: EL-Antrag bei AHV-Kasse falls nötig
"""

doc_id = str(uuid.uuid4())
point_ids = store_knowledge_chunks(
    document_id=doc_id,
    title="IV-Anmeldeprozess Schweiz — Vollständiger Leitfaden (alle Phasen, Fristen, Tipps)",
    url="https://www.ahv-iv.ch",
    text=IV_PROCESS_GUIDE,
    source_type="law",
    domain="recht",
    language="de",
    published_at="2024-01-01",
)
print(f"IV-Leitfaden indexiert: {len(point_ids)} Chunks, doc_id={doc_id}")
