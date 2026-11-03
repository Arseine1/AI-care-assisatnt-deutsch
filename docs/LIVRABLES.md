# Liefergegenstände: verlangt / wo / konform?

Geprüft am 27.10.2026. Der Test `node tests/livrables.test.mjs` kontrolliert die mit « Test » markierten Punkte automatisch.

## 1. docker-compose.yml

| Verlangt | Wo im Repository | Konform? |
|---|---|---|
| n8n | `compose/docker-compose.yml`, Dienst `n8n` (Port 5679) | Ja (Test) |
| Qdrant | Dienst `qdrant` (Port 6335) | Ja (Test) |
| Mosquitto | Dienst `mosquitto` (Port 1884), Konten und Rechte in `compose/mosquitto/` | Ja (Test) |
| Ollama | Dienst `ollama`, **Profil `ollama`**: `docker compose --profile ollama up -d` | **Ja, mit einem Vorbehalt**: Standardmäßig verwendet das Projekt das auf dem Rechner installierte Ollama (nur eine Kopie der Modelle, 8 GB Arbeitsspeicher). Der Container ist bereit, startet aber nicht mit einem einfachen `docker compose up -d`. Er wurde auf diesem Rechner nicht durchgängig erprobt (Speicher). |
| weitere Dienste | `postgres`, `mailpit` (simuliertes KIM-Postfach), `ocr`, `hapi-fhir` | Ja |

Die Datei wird mit `docker compose config -q` validiert (mit und ohne `--profile ollama`).

## 2. Drei n8n-Workflows (JSON in `workflows/`)

Die Workflows werden aus `workflows/code/*.js` **erzeugt** (`node workflows/generer.mjs`) und dann als versioniertes JSON exportiert. Jeder « verlangte Workflow » ist eine Gruppe von Dateien, die gemeinsame Bausteine teilen.

| Verlangt | Dateien | Konform? |
|---|---|---|
| **Dienstbericht und Übergabe (SBAR)** | `67-brique-rapport-garde` (eine Bewohnerin bzw. ein Bewohner), `68-brique-etage-complet` und `74-maitre-etage` (eine Etage), `76-etage-automatique` (5:30 Uhr), `66-brique-apres-validation` (Aufnahme ins RAG + Übermittlung an das nächste Team), Eingänge `70`, `72`, `73` | Ja |
| **Sensoralarme** | `81-alarme-capteur` (MQTT + TTN-Brücke), `82-maitre-alarmes` (Liste, Quittierung) | Ja. Seit dem 27.10.: Der Alarm wird auch **in Qdrant indexiert** (siehe 3). |
| **Import der Dokumente** | `00-indexeur` (gemeinsam), `10` Pflegesoftware, `20` FHIR, `30` Dateien (OCR), `40` ePA, `50` KIM, `83` + `85` + `86` Briefe automatisch | Ja |
| RAG-Suche | `60-brique-chercher`: Vektorsuche in Qdrant + direktes Lesen der Pflegesoftware | Ja |
| Filter nach Zimmer / Bewohner | Das Zimmer wird in eine `patient_id` übersetzt (`Bewohner des Zimmers`); die Suchen `Qdrant Zeitraum` und `Qdrant Hintergrund` sind **immer nach `patient_id` gefiltert** | Ja (Test). Die Protokolle (Collection `connaissances`) haben absichtlich keinen Bewohnerfilter. |
| Temperatur 0,0 bis 0,2 | Nur ein Baustein ruft Llama zum Schreiben auf (`62-brique-rediger`): Temperatur des Prompts, **0,1 für alle 8 Prompts**; `test-llama3.json` (Verbindungstest) seit dem 27.10. auf 0,1 festgelegt | Ja (Test). Vor dem 27.10. gab `test-llama3.json` keine Temperatur an (Standardwert von Ollama, 0,8): korrigiert. |

## 3. Demonstration: IoT-Alarm, dann Aktualisierung des Qdrant-Index

| Verlangt | Wo | Konform? |
|---|---|---|
| Ein IoT-Alarm | `node scripts/demo-nuit.mjs` (Szene 2: MQTT-Nachricht `capteurs/chambre12/chute`); oder eine echte Uplink-Simulation aus TTN | Ja |
| Danach die Aktualisierung des RAG-Index in Qdrant | Workflow 81: `Alarm erstellen` → `RAG-Dokument (Alarm)` → `Indizieren (Alarm)` (Unter-Workflow `00-indexeur`); die Demo prüft, dass der Punkt in der Collection `patients` erscheint (Quelle « Sensoren », Typ `alarme`, Bewohner des Zimmers) | **Ja seit dem 27.10., in der Praxis bestätigt** (Workflow 81 neu importiert, schnelle Demo vom 27.10. um 09:36 Uhr: Alarm nach 1,4 s sichtbar, Punkt 5 s später zu Qdrant hinzugefügt, Collection `patients` von 93 auf 94 Punkte gestiegen, Quelle « Sensoren », Bewohner PAT-003). Zuvor wurde der Alarm **nicht** zu Qdrant hinzugefügt (nur zu PostgreSQL): Die zweite Hälfte der Demonstration gab es nicht. |

Was die Indexierung des Alarms nicht ist: ein neuer Aufruf von Llama. Es handelt sich um ein Embedding (`nomic-embed-text`), und ein Indexierungsfehler hält weder den Alarm noch seinen Kontext an.
