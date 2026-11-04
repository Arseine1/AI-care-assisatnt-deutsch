# Minimale Sicherheit (Tag 4, Schritt 7)

Diese Seite beschreibt, was die Oberfläche und n8n schützt, **und was sie nicht schützt**. Alle Daten sind fiktiv; die unten genannten Konten sind Demonstrationskonten.

## Was vorhanden ist

| Schutz | Wo | Was er verhindert |
|---|---|---|
| **Anmeldung der Pflegekraft** (Kennung + PIN-Code) | Workflow `88-connexion` | den KI-Assistenten für die Pflegeteams ohne Konto zu nutzen |
| **Sitzung**: zufälliges Token mit 12 Stunden Gültigkeit, von n8n VOR jeder Verarbeitung geprüft | Knoten « Sitzung » jedes Einstiegspunkts | n8n aufzurufen, ohne angemeldet zu sein, selbst wenn man den Schlüssel kennt |
| **Name der Pflegekraft bei jeder Validierung gespeichert**, aus der Sitzung entnommen | Workflows 72 und 73, Tabelle `soins.validations` (Spalte `soignant_id`), Audit-Journal | « im Namen » einer anderen Person zu validieren |
| **Zugelassene Ursprünge** (CORS): nur die Adresse der Oberfläche | Option `allowedOrigins` der Webhooks | dass eine andere Webseite im Browser n8n aufruft |
| **Geheimer Schlüssel** im Header `X-AICare-Cle` | Credential « AI-Care clé des webhooks » | Aufrufe, die nicht aus der Oberfläche oder den Skripten des Projekts stammen |
| **Eigener interner Schlüssel** für den Pfad `aicare-verifier-interne` | Credential « AI-Care clé interne » | dass ein Brief geprüft wird, ohne die Sitzung einer Pflegekraft zu durchlaufen |
| **Geschlossener MQTT-Broker** (siehe `docs/alarmes.md`) | `compose/mosquitto/` | falsche Alarme, die jemand im Netzwerk sendet |

## Die Demonstrationskonten

`node scripts/creer-soignants.mjs` legt drei fiktive Konten an: `martin`, `keller`, `roth`. Ihre PIN-Codes (6 zufällig gezogene Ziffern) stehen in der Datei `.env` (`DEMO_PIN_MARTIN`, `DEMO_PIN_KELLER`, `DEMO_PIN_ROTH`), niemals im Repository. Um einen zu ändern: die Zeile in `.env` ändern und das Skript erneut starten.

Vollständige Inbetriebnahme: `node scripts/generer-secrets.mjs` (legt die fehlenden Secrets an), `node scripts/creer-soignants.mjs`, `node workflows/importer.mjs`, dann die Oberfläche mit `VITE_MOCK=false` starten (siehe `.env.exemple`). Im simulierten Modus (Standard) akzeptiert die Anmeldeseite nur das fiktive Konto `demo` / `123456` und ruft keinen Server auf.

## Konten anlegen und verwalten

Ein einziger Befehl, in einem im Projektstamm (`C:\xampp\htdocs\IA CARE assistant`) geöffneten Terminal, Docker gestartet.

**Ein Konto anlegen (geführter Modus: das Skript stellt die Fragen)**:

```bash
node scripts/creer-compte.mjs
```

Es fragt nach der Kennung (z. B. `anna`, ohne Akzent und Leerzeichen), dem angezeigten Namen (z. B. `Frau Anna Weiss`) und dem PIN-Code (4 bis 8 Ziffern; leer = zufällig gezogen und nur einmal angezeigt).

**Ein Konto in einer Zeile anlegen**:

```bash
node scripts/creer-compte.mjs anna "Frau Anna Weiss" 482913
```

**Weitere Aktionen**:

```bash
node scripts/creer-compte.mjs --liste
```
```bash
node scripts/creer-compte.mjs --pin anna
```
```bash
node scripts/creer-compte.mjs --desactiver anna
```
```bash
node scripts/creer-compte.mjs --activer anna
```

- `--liste`: Konten, Zustand (aktiv / deaktiviert), Erstellungsdatum, Anzahl offener Sitzungen.
- `--pin anna [PIN]`: ändert die PIN (zufällig gezogen, wenn weggelassen) und schließt die offenen Sitzungen des Kontos.
- `--desactiver anna`: Das Konto kann sich nicht mehr anmelden, seine Sitzungen werden geschlossen; sein Verlauf an Validierungen bleibt erhalten (ein Konto, das Berichte validiert hat, wird nicht gelöscht: Die Nachvollziehbarkeit bliebe ohne Namen).

Das neue Konto funktioniert sofort, ohne n8n oder die Oberfläche neu zu starten. **Warum kein Formular in der Oberfläche?** Es gibt noch keine Rollen: Jede angemeldete Pflegekraft könnte dann Konten anlegen. Solange es keine Rollen gibt, bleibt das Anlegen ein Vorgang, der am Rechner von der Person durchgeführt wird, die die Installation verwaltet.
## Wie es funktioniert

1. **Anmeldung**: Die Oberfläche sendet `{identifiant, pin}`. n8n liest den Fingerabdruck der PIN in der Datenbank (`scrypt`, kontospezifisches Salz, Vergleich in konstanter Zeit) und antwortet mit einem Token aus 32 zufälligen Bytes. **In der Datenbank wird nur der SHA-256-Fingerabdruck des Tokens gespeichert**; das Token selbst existiert nur im Tab der Pflegekraft (`sessionStorage`, beim Schließen des Tabs gelöscht).
2. **Jeder Aufruf** trägt `Authorization: Bearer <jeton>`. Der erste Knoten nach dem Webhook berechnet den Fingerabdruck und sucht eine nicht abgelaufene Sitzung eines aktiven Kontos. Sonst lautet die Antwort `{ "erreur": "session" }`, kein weiterer Knoten wird ausgeführt, und die Oberfläche öffnet die Anmeldeseite erneut (Meldung « Ihre Sitzung ist abgelaufen »).
3. **Validierung**: Name und Kennung der validierenden Pflegekraft stammen aus der Sitzung (Knoten « Sitzung »), niemals aus dem Body der Anfrage. Sie werden in `soins.validations` und ins Audit-Journal geschrieben.
4. **Sperrung**: 5 Fehlversuche in 5 Minuten bei demselben Konto sperren dieses Konto für 5 Minuten, selbst mit der richtigen PIN. Eine unbekannte Kennung erhält genau dieselbe Ablehnung wie eine falsche PIN und führt dieselbe Berechnung durch: Man kann nicht erraten, welche Konten existieren. Nur bestehende Konten werden gezählt (die Tabelle der Fehlversuche wächst nicht mit erfundenen Kennungen).

## Was NICHT schützt (Grenzen, offen gesagt)

- **Der Schlüssel `X-AICare-Cle` ist kein Geheimnis.** Die Oberfläche sendet ihn, daher kann ihn jeder, der die Oberfläche in einem Browser öffnet, im Code lesen. Er filtert nur Rauschen (Aufrufe, die nicht aus der Oberfläche kommen); **der eigentliche Schutz ist die Sitzung**.
- **Der Webhook `courrier-recu` hat keinerlei Authentifizierung.** Mailpit löst ihn aus und kann keinen Header senden. Jeder im Netzwerk kann ihn daher auslösen, aber er **bittet n8n nur, das Mailpit-Postfach erneut zu lesen**: Er übermittelt keine Daten und erlaubt weder, etwas zu lesen, noch etwas zu ändern. In der Produktion würde der Posteingang von n8n (IMAP) mit eigenen Zugangsdaten gelesen.
- **Kein HTTPS**: Alles läuft über HTTP auf dem Rechner (`localhost`). Token und PIN wären in einem gemeinsam genutzten Netzwerk lesbar. Vor jeder Nutzung außerhalb des Testrechners hinter einen HTTPS-Proxy zu stellen.
- **Das Sitzungstoken bleibt 12 Stunden gültig**, selbst wenn die Pflegekraft den Tab schließt, ohne sich abzumelden. Die Schaltfläche « Abmelden » schließt es sofort auf Seiten von n8n.
- **Keine Kontenverwaltung in der Oberfläche** (Anlegen, PIN-Änderung): Sie erfolgt per Skript (siehe oben), mangels Rollen.
- **Keine Rollen**: Alle angemeldeten Pflegekräfte können in der Oberfläche alles tun. Die Nachvollziehbarkeit (wer hat validiert) besteht, die Trennung der Rechte nicht.
- **Die Demonstrations-PINs** (6 Ziffern) sind von Natur aus schwach; die Sperrung begrenzt massenhaftes Ausprobieren, was einem starken Passwort nicht gleichkommt.
- **Sensoralarme werden nur auf ihrer Seite angezeigt** (Wunsch des Nutzers): Eine Pflegekraft, die auf einer anderen Seite geblieben ist, sieht den roten Zähler des Tabs und hört den Piepton, nicht die Karte.

## Prüfen

```bash
node tests/securite.test.mjs        # Struktur, Sitzung, PIN, Signatur, kein Secret im Repository (außerhalb von n8n)
node tests/securite-live.mjs        # gegen n8n: Ablehnung ohne Schlüssel, ohne Sitzung, mit falscher Sitzung, Sperrung, CORS, Signatur
```

## Ausnahme des Prototyps: .env.prototype

Das Repository enthält absichtlich `.env.prototype`: die Schlüssel, Passwörter und PINs der TESTKONTEN dieses Prototyps, einschließlich des TTN-Schlüssels, damit die Installation mit einem einzigen Befehl und ohne jede Eingabe auskommt. Die Daten sind fiktiv, die Konten dienen nur Versuchen. **Das Repository ist öffentlich: Jeder kann diese Werte lesen.** Für einen echten Einsatz niemals beibehalten: die Datei aus dem Repository und seiner Historie entfernen, den TTN-Schlüssel neu erzeugen und `node scripts/generer-secrets.mjs` zufällige Geheimnisse erstellen lassen. Der Test `tests/securite.test.mjs` nimmt nur diese eine Datei von der Suche nach Geheimnissen aus.
