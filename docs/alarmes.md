# Sensoralarme (MQTT)

Ein Sensor veröffentlicht eine MQTT-Nachricht; die Oberfläche zeigt einen Alarm in weniger als einer Sekunde an (Rechner im Ruhezustand), mit den vom **Code** gelesenen Fakten der Akte. Der Kontexttext des KI-Assistenten kommt anschließend hinzu, sobald er bereit ist.

## MQTT-Themen

`capteurs/chambre{n}/{type}` mit `type` aus `chute`, `sortie_lit`, `appel` (`n`: 1 bis 3 Ziffern). Jedes andere Thema wird abgelehnt (Zeile `alarme_rejetee` im Audit-Journal, Thema bereinigt). Der Broker ist das Mosquitto des docker-compose: `localhost:1884` vom Rechner aus, `mosquitto:1883` von n8n aus, Zugriff nur für zwei Konten (siehe « Konten des Brokers » weiter unten).

**Der Inhalt der Nachricht wird niemals gelesen, gespeichert oder an die KI gesendet**: Nur das Thema zählt. Ein defekter oder gehackter Sensor kann daher keinen Text einschleusen (getestet: `tests/alarmes.test.mjs`).

## Was geschieht (Workflow `81-alarme-capteur`)

1. **Prüfung des Themas** (Code), dann Suche nach der Bewohnerin bzw. dem Bewohner des Zimmers.
2. **Codierte Fakten**, ohne KI: Bewohner, Risiken, Allergien, Diagnosen und **Risikomedikation**, nach Familie erkannt (Antikoagulans: Blutung; Insulin: Hypoglykämie; Sedativum: Schläfrigkeit, Sturz; Blutdrucksenker oder Diuretikum: Sturz). Zimmer ohne Bewohner: Der Alarm wird trotzdem angezeigt, ohne KI-Kontext.
3. **Alarm gespeichert** (`soins.alarmes`): Ab diesem Moment wird er sichtbar. Ein vom Sensor wiederholter Alarm für dasselbe Zimmer und denselben Typ innerhalb einer Minute erzeugt keinen zweiten.
4. **Kontext des KI-Assistenten** (Prompt `contexte_alarme`, 7 Fakten der Akte + die vom Code erstellte Zeile « [Sensoren] », höchstens 4 Sätze, Anti-Erfindungs-Filter wie überall). **Immer nur eine Generierung gleichzeitig**: Ein Alarm, der eintrifft, während ein anderer seinen Kontext vorbereitet, wird mit dem Status `differe` (zurückgestellt) markiert (die codierten Fakten bleiben angezeigt).

Die Oberfläche fragt alle 2 Sekunden `POST /webhook/aicare-alarmes` ab; `{ "acquitter": "<uuid>" }` quittiert, `{ "historique": true }` fügt die quittierten Alarme der letzten 24 Stunden hinzu. Ein Alarm bleibt bis zu seiner Quittierung angezeigt. Ein Kontext im Status `en_cours` (in Vorbereitung), dessen n8n angehalten wurde, wird `indisponible` (nicht verfügbar) (Wiederaufnahme beim Start, Wächter).

## In der Oberfläche

- **Alarmkarte** (dezent, ohne farbigen Balken) oben auf den Arbeitsseiten: Titel, Uhrzeit, Fakten der Akte, Kontext der KI, Schaltfläche « Quittieren ».
- **Seite « Alarme »** (ein eigener Tab, mit Zähler): ausschließlich Sensoralarme, Liste der offenen Alarme und Verlauf von 24 Stunden. Die Dokumentenwarnungen (Briefe, ePA) stehen auf ihrer eigenen Seite « Dokumente » (siehe docs/documents.md).
- **Verbindung verloren**: Erhält die Oberfläche dreimal hintereinander keine Antwort von n8n mehr, schreibt sie das (« Verbindung zum Server verloren »), statt glauben zu lassen, es gebe keinen Alarm.
- Bei jedem neuen Alarm: zwei kurze Pieptöne (der Browser kann einen ersten Klick auf die Seite verlangen), und der Tab-Titel kündigt « (n) ALARM – … » an.

## Einen Alarm simulieren

```bash
scripts/simuler-alarme.sh 12 sortie_lit
```
```powershell
.\scripts\simuler-alarme.ps1 -Chambre 12 -Type sortie_lit
```

Beide verwenden `mosquitto_pub`, falls installiert, sonst das des Containers (nichts zu installieren). Vollständiger Test mit Messungen: `node tests/alarme-live.mjs` (Alarme in mehreren Zimmern, ungültige Themen, Duplikate, Fristen, Quittierung).

## Gemessene Zeiten (Testrechner: 8 GB RAM, 4 Kerne, ohne Grafikkarte)

| Messung | Ergebnis |
|---|---|
| Alarm sichtbar, Rechner im Ruhezustand | **0,4 bis 0,9 s** (ohne den Befehl `docker exec`, der der Messung 1 bis 2 s hinzufügt), danach höchstens 2 s Abfrageintervall der Oberfläche |
| Alarm sichtbar, während eine Generierung läuft (Ollama normal) | 6,5 s bis **43,8 s** |
| Alarm sichtbar, während eine Generierung läuft (Ollama 3 Threads, niedrige Priorität) | Median **2,4 s**, 4 von 5 Alarmen unter 2,5 s, **einer bei 13 s** |
| KI-Kontext bereit (erste Messung, 8 Sätze) | **209 s** |
| KI-Kontext (4 Sätze, 3 Threads) | **unzuverlässige Messungen**: 320 s, aber während der Messung war der Rechner überlastet (Modell fast vollständig aus dem Speicher verdrängt, 18 GB Auslagerungsdatei) |

**Offenes Fazit**: Der Test « Alarm in weniger als 5 Sekunden angezeigt » wird **im Ruhezustand** erfüllt (unter einer Sekunde) und **meist auch unter Last** mit den unten genannten Einstellungen, aber **nicht immer** auf diesem Rechner (einmal 13 s gemessen). Der Text der KI braucht hier mehrere Minuten.

### Einstellungen, die die Anzeige der Alarme schützen

- `AICARE_THREADS` (Standard 3): Rechenthreads, die Ollama überlassen werden, um einen Kern frei zu halten.
- `scripts/priorite-ollama.ps1`: Ollama mit niedrigerer Priorität, während es generiert (`-Normale`, um zurückzukehren). **Kompromiss**: n8n und PostgreSQL ziehen vorbei, aber die Generierung verlangsamt sich, sobald der Rechner etwas anderes tut. Nach jedem Neustart von Ollama zu wiederholen.

### Um schneller zu werden (siehe auch `docs/vitesse.md`)

1. **16 GB RAM**: beseitigt die beobachtete Überlastung (sie lässt die Messungen um das Dreifache schwanken); der Text wird weiterhin vom Prozessor berechnet.
2. **Grafikkarte**: der Text in wenigen Sekunden.
3. **Kontexttext ohne Generierung**: Die Maßnahme aus dem Protokoll des Hauses könnte vom Code direkt aus dem RAG zitiert werden (eine Sekunde, ohne Erfindungsmöglichkeit); nicht umgesetzt, noch zu entscheiden.

## Konten des Brokers (geschlossener Zugang)

Der Broker verweigert jede Verbindung ohne Konto. Zwei Konten, angelegt mit `node scripts/generer-secrets.mjs` (Zufallspasswörter, in `.env` geschrieben, niemals ins Repository; die gehashte Datei `compose/mosquitto/passwd` wird von Git ignoriert):

- `capteurs`: veröffentlicht auf `capteurs/#`, kann nichts lesen;
- `n8n`: liest `capteurs/#`, veröffentlicht nicht.

Die Skripte `scripts/simuler-alarme.ps1` und `.sh` lesen das Konto `capteurs` aus `.env`: keine Passworteingabe. Lokal ist kein API-Schlüssel nötig.

## TTN-Brücke (The Things Stack)

Zweiter Einstiegspunkt desselben Workflows `81`: Der Knoten « TTN-Alarm » abonniert `v3/<application>/devices/+/up` auf Ihrem TTN-Server (verschlüsseltes MQTT, Port 8883), der Knoten « Übersetzen (TTN) » entnimmt daraus Zimmer und Alarmtyp, danach ist der Ablauf identisch mit den lokalen Sensoren.

- Konfiguration in `.env`: `TTN_SERVEUR`, `TTN_PORT` (8883), `TTN_APPLICATION` (vollständige Kennung `application@locataire`), `TTN_CLE_API` (Schlüssel nur zum Lesen des Datenverkehrs). Dann `node workflows/importer.mjs --seulement=81`. Ohne diese Werte bleibt der Knoten deaktiviert.
- Erkanntes Format: dekodierte Nachricht `{ "alarme": "chute|sortie_lit|appel", "chambre": 12 }` (JavaScript-Formatter der TTN-Anwendung, siehe unten) oder ersatzweise ein Gerätename der Form `chambre12-sortie-lit`. Akzeptierte Synonyme: `fall`, `bed_exit`, `call`, `sos`, `room` …
- Übernommen werden nur das Zimmer (1 bis 3 Ziffern) und der Typ (geschlossene Liste): Kein anderer Text der TTN-Nachricht gelangt in das System oder in den Prompt.
- In TTN einzufügender Formatter (Payload formatters, Uplink, Benutzerdefiniertes JavaScript):

```javascript
function decodeUplink(input) {
  var types = { 1: 'chute', 2: 'sortie_lit', 3: 'appel' };
  var t = types[input.bytes[0]];
  return { data: { alarme: t, chambre: input.bytes[1] }, warnings: [], errors: t ? [] : ['type inconnu'] };
}
```

- Tests aus TTN (Messaging, Simulate uplink, FPort 1): `010C` Sturz Zimmer 12, `020C` Bettausstieg Zimmer 12, `030C` Ruf Zimmer 12.
- Grenze: Nur die Verbindung zu einem echten TTN-Konto beweist den vollständigen Weg; die Offline-Tests decken die Übersetzung ab (`tests/alarmes.test.mjs`).
