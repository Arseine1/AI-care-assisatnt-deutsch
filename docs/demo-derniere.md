# Letzte Demonstration (fiktive Nacht)

*Erzeugt von `node scripts/demo-nuit.mjs` am 2026-10-27 13:09; Konto: arsene. Nicht von Hand ändern.*

Gesamtdauer: 6.4 Minuten.

| Prüfung | Ergebnis | Detail |
|---|---|---|
| angemeldet: Arsène (Testkonto) | OK | 0.4 s |
| der Alarm erscheint in der Oberfläche | OK | 0.8 s (Ziel: unter 5 s; enthält ~1 s für den Docker-Befehl) |
| der RAG-Index (Qdrant) wird aktualisiert: der Alarm wird dort hinzugefügt | OK | 0.0 s nach der Anzeige; « Sensoralarm (Sturz) am 27.10. um 14:02 Uhr, Zimmer 12. » [Sensoren], Bewohner PAT-003, 95 Punkte in « patients » |
| der Brief wird im Postfach empfangen | OK | HTTP 200 |
| n8n liest den Brief (OCR), identifiziert die Bewohnerin bzw. den Bewohner und legt eine Warnung zum Prüfen des Dokuments an | OK | 25.4 s |
| der Brief wird einem Müller zugeordnet (Name + Geburtsdatum), nie erraten | OK | Herr Heinz Müller (Zimmer 21) |
| ein Entwurf wird erstellt | OK | 235.4 s |
| die Antwort wird erstellt | OK | 111.3 s |
| die Anweisung wird abgelehnt | OK | Grund: regles, 1.1 s |
| es wurde kein Entwurf angelegt (die KI wurde nicht angefragt) | OK |  |
| der Bericht wird validiert und gespeichert | OK | 3.0 s |
| die gespeicherte Signatur ist die des angemeldeten Kontos (der von der Seite gesendete Name wird ignoriert) | OK | arsene / Arsène (Testkonto) |
| Sätze ohne Quelle: 0 von 8 Zeilen | OK |  |
