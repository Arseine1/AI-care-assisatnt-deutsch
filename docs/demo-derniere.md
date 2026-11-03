# Letzte Demonstration (fiktive Nacht)

*Erzeugt von `node scripts/demo-nuit.mjs --rapide` am 2026-11-03 18:19; Konto: arsene. Nicht von Hand ändern.*

Gesamtdauer: 1.4 Minuten.

| Prüfung | Ergebnis | Detail |
|---|---|---|
| angemeldet: Arsène (Testkonto) | OK | 1.6 s |
| der Alarm erscheint in der Oberfläche | OK | 3.0 s (Ziel: weniger als 5 s; enthält ~1 s für den Docker-Befehl) |
| der RAG-Index (Qdrant) wird aktualisiert: Der Alarm wird dort hinzugefügt | OK | 0.3 s nach der Anzeige; „Sensoralarm (Sturz) am 03.11. um 19:18 Uhr, Zimmer 12.“ [Sensoren], Bewohner PAT-003, 72 Punkte in „patients“ |
| der Brief geht im Postfach ein | OK | HTTP 200 |
| n8n liest den Brief (OCR), identifiziert den Bewohner und erstellt eine Meldung „zu prüfen“ | OK | 62.4 s |
| der Brief wird einem Müller zugeordnet (Name + Geburtsdatum), nie geraten | OK | Herr Heinz Müller (Zimmer 21) |
| die Anweisung wird abgelehnt | OK | Grund: regles, 5.2 s |
| es wurde kein Entwurf erstellt (die KI wurde nicht angefragt) | OK |  |
