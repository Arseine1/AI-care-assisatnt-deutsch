# AI-Care Assistant auf einem anderen Rechner installieren

Dieser Leitfaden ermöglicht es einer Person, die nicht an der Entwicklung beteiligt war, das Projekt zu installieren und die Tests zu wiederholen. Die Daten sind **vollständig fiktiv**; ein externer Zugriff ist nur nötig, um die Docker-Images, die Ollama-Modelle und die ePA-Mocks von gematik herunterzuladen.

## 1. Was man vor dem Start braucht

| Element | Minimum | Hinweis |
|---|---|---|
| Arbeitsspeicher | 8 GB (12 bis 16 GB empfohlen) | Die Referenzmessung (25/30, Demonstration 13/13) wurde mit 16 GB durchgeführt. Mit 8 GB funktioniert alles, aber langsamer, und Docker kann Dienste beenden. |
| Freier Speicherplatz | 25 GB (Schätzung) | Docker-Images, Ollama-Modelle (2,3 GB, 7 GB mit dem Modell des Agenten), Daten. |
| Prozessor | ohne Grafikkarte zulässig | Ohne Grafikkarte braucht ein Text im Modus B 2 bis 5 Minuten. Das ist normal. |
| Node.js | 20 oder höher (LTS) | https://nodejs.org |
| Docker | Docker Desktop (Windows, Mac) oder Docker Engine + compose (Linux) | Muss vor der Installation gestartet sein. |
| Git | beliebige Version | Zum Klonen des Repositorys und der ePA-Mocks. |
| Ollama | aktuelle Version | https://ollama.com/download — **auf dem Rechner** installiert, nicht in Docker. |
| Freie Ports | 5679, 6335, 1884, 8025, 1025, 8090, 8009, 8084, 8085, 8082, 11434, 5173 | Ein anderes Programm auf einem dieser Ports blockiert den Start. |

**Windows, 16 GB oder weniger**: den Speicher von Docker (WSL) begrenzen, damit für Ollama Platz bleibt. `C:\Users\<Name>\.wslconfig` anlegen:

```ini
[wsl2]
memory=8GB
```

Dann in einem Terminal: `wsl --shutdown`, und Docker Desktop neu starten. Nicht mehr als 60 % des Arbeitsspeichers des Rechners verwenden.

**Linux**: Ollama mit `OLLAMA_HOST=0.0.0.0` starten, damit die Container es erreichen (`host.docker.internal`).

## 2. Installation mit einem Befehl

```bash
git clone https://github.com/Arseine1/AI-care-assisatnt-deutsch
```
```bash
cd AI-care-assisatnt-deutsch
```
```bash
node scripts/installer.mjs
```

**Es werden keine Fragen gestellt, und es ist kein Schlüssel einzugeben**: In Schritt 2 wird die im Repository mitgelieferte Datei `.env.prototype` (Schlüssel, Passwörter und PINs **nur zum Testen**) nach `.env` kopiert, und fehlende Ollama-Modelle werden automatisch aus dem offiziellen Ollama-Register geladen: `llama3.2` (2,0 GB), `nomic-embed-text` (0,3 GB) und `qwen2.5:7b` (4,7 GB, das Modell, das den Agenten der Seite Rentenbeiträge steuert). Unter Windows genügt auch ein Doppelklick auf `INSTALLER.cmd`. Optionen: `--sans-pilote` (ohne `qwen2.5:7b`), `--sans-modeles` (nichts herunterladen: Das Skript hält in Schritt 4 an und listet auf, was fehlt). Die Datei enthält auch den TTN-Schlüssel des Prototyps, die TTN-Anbindung ist also aktiv. **Nur Prototyp**: vor jedem echten Einsatz `.env.prototype` aus dem Repository (und seiner Historie) entfernen, den TTN-Schlüssel neu erzeugen und das Installationsskript zufällige Geheimnisse erstellen lassen.

Dauer: **30 bis 45 Minuten**, davon etwa 15 Minuten für den Import der n8n-Workflows und 5 bis 10 Minuten für die ePA-Mocks. Das Skript zeigt den Fortschritt an und zeigt niemals ein Passwort.

| Schritt | Was geschieht |
|---|---|
| 1 | Prüfung von Node, Docker, Arbeitsspeicher |
| 2 | Anlegen von `.env` aus `.env.prototype`; fehlende Werte werden zufällig erzeugt |
| 3 | Start der Docker-Dienste und der ePA-Mocks; Warten, bis sie antworten |
| 4 | Prüfung und Download der fehlenden Ollama-Modelle |
| 5 | Laden der fiktiven Daten (PostgreSQL, FHIR, KIM-Postfach, ePA) und Anlegen der Qdrant-Collections |
| 6 | Import und Veröffentlichung der n8n-Workflows (n8n startet neu) |
| 7 | Anlegen der Konten der Pflegekräfte, Installation der Oberfläche, `VITE_MOCK=false` |
| 8 | Erste Indexierung des RAG |

Das Skript ist **wiederholbar**: Schlägt ein Schritt fehl, die Ursache beheben und mit `--depuis=<Nummer>` neu starten. Nützliche Optionen: `--sans-epa` (ohne die ePA-Mocks, 1,5 GB weniger Arbeitsspeicher; die Quelle « ePA » von `test-du-soir` schlägt dann fehl), `--jusqua=<Nummer>`.

Am Ende startet das Skript selbst die Überprüfung aus Abschnitt 4.

## 3. Die Oberfläche öffnen

```bash
cd front
```
```bash
npm run dev
```

http://localhost:5173 öffnen. Konten: `martin`, `keller`, `roth`, `arsene`. Die **PINs** stehen in der Datei `.env` (Zeilen `DEMO_PIN_*`); sie werden bei der Installation zufällig erzeugt und unterscheiden sich daher auf jedem Rechner. Um ein weiteres Konto anzulegen: `node scripts/creer-compte.mjs`.

## 4. Prüfen, dass alles funktioniert

Jederzeit, ohne etwas zu ändern:

```bash
node scripts/installer.mjs --verifier
```

Es prüft die Dienste, die Modelle, die Collections, die Konten und startet dann die 19 Testdateien ohne KI (etwa 15 Sekunden). Alles muss « OK » sein. Mit `--demo` wird die schnelle Demonstration angehängt.

### Die Tests, vom kürzesten zum längsten

| Befehl | Dauer (Rechner mit 16 GB ohne Grafikkarte) | Was es belegt |
|---|---|---|
| `node scripts/installer.mjs --verifier` | 15 s | Dienste grün, 19 Testdateien ohne KI: Kontrolle der Anweisungen, Anti-Erfindungs-Filter, Sicherheit, Regeln der Rentenbeiträge, Hintergrundaufgaben |
| `node scripts/demo-nuit.mjs --rapide` | unter 5 Min. | Eine fiktive Nacht ohne Llama: Anmeldung, Sturzalarm (MQTT-Sensor), Arztbrief (OCR), bösartige Anweisung abgelehnt, signierte Validierung |
| `node scripts/demo-nuit.mjs` | etwa 7 Min. (6,4 gemessen) | Dieselbe, mit Llama (Dienstbericht, freie Frage). 13 Kontrollen; letztes Ergebnis in `docs/demo-derniere.md` |
| `node tests/batterie.mjs` | einige Minuten (nicht gestoppt) | Schneller Teil der Batterie: getarnte bösartige Anweisungen, Namensvettern, Ausfall |
| `node tests/batterie.mjs --reel` | **etwa 75 Min.** | 30 Fragen mit Llama. Fortsetzbar mit `--reprendre`. Ergebnis in `tests/resultats/batterie-derniere.md` |
| `node tests/sgb6-live.mjs` | auf einem anderen Rechner nicht gemessen | Rentenbeiträge durchgängig über n8n, 9 fiktive Vorgänge, ohne KI zum Lesen |
| `node tests/sgb6-live.mjs --ia` | 20 bis 40 Min. | Dasselbe mit Lesen durch die KI |
| `node tests/sgb6-modeles.mjs --modeles=qwen2.5:7b` | mehrere Stunden pro Modell | Vergleich der Modelle, die den Agenten Rentenbeiträge steuern |

**Auf dem Entwicklungsrechner gemessene Referenzergebnisse**: Batterie 25/30 (mit Antwort 11/16, Namensvettern 4/4, ohne Antwort 10/10); Demonstration 13/13. Auf einem anderen Rechner variieren die Zeiten, und die 5 bekannten Fehlschläge (Q01, Q12, Q13, Q15, Q16) stammen vom kleinen Modell `llama3.2`, das schlecht abschreibt: siehe [batterie.md](batterie.md) und [RAPPORT.md](RAPPORT.md). **Ein etwas abweichendes Ergebnis (24 oder 26 von 30) ist normal**: Das Modell ist nicht vollkommen reproduzierbar. Ein deutlich schlechteres Ergebnis (unter 20) deutet auf ein Installations- oder Speicherproblem hin.

Vor einer Demonstration die Zeitstempel neu laden (die « letzten 12 Stunden » veralten): `cd data`, dann `npm run postgres`.

## 5. Wenn etwas nicht stimmt

| Symptom | Wahrscheinliche Ursache | Abhilfe |
|---|---|---|
| `ABBRUCH  Docker ist installiert, antwortet aber nicht.` (Meldung des Skripts) | Docker Desktop nicht gestartet | Starten, 1 Minute warten, neu starten |
| Port bereits belegt | Anderes Programm | Den Port freigeben (Liste in Abschnitt 1) oder das andere Programm beenden |
| « Server nicht erreichbar » in der Oberfläche, obwohl Docker läuft | Portweiterleitung von Docker Desktop defekt (unter Windows häufig) | Docker Desktop beenden, `wsl --shutdown`, neu starten, 2 Minuten warten |
| Docker-Dienste werden zufällig beendet, HTTP-500-Fehler | Speichermangel | Andere Programme schließen; siehe `.wslconfig` in Abschnitt 1; `docker compose up -d` in `compose/` |
| `git clone` der ePA-Mocks blockiert | Firewall oder Richtlinie des Rechners | https://codeload.github.com/gematik/epa-deployment/zip/refs/heads/main herunterladen, in `compose/epa-deployment/` entpacken (die Datei `dc-mocks.yml` muss dort liegen), `--depuis=3`; oder `--sans-epa` |
| `ollama pull` schlägt fehl | Befehl im Terminal nicht vorhanden | Die Ollama-Anwendung starten oder das Modell über deren Oberfläche herunterladen |
| Import der Workflows unterbrochen | Speicher, oder n8n nicht bereit | Mit `--depuis=6` neu starten: Der Import ist wiederholbar |
| Die Texte der KI brauchen mehr als 5 Minuten | Prozessor ausgelastet, Modell aus dem Speicher entfernt | Ohne Grafikkarte normal; andere Programme schließen |

## 6. Von vorn beginnen

Löscht die Datenbank, Qdrant, n8n und die Konten (niemals den Code):

```bash
cd compose
```
```bash
docker compose down -v
```

Dann `.env` löschen, wenn man auch neue Secrets möchte, und `node scripts/installer.mjs` erneut starten.

## 7. Zu beachtende Grenzen

- **Das Installationsskript wurde nicht durchgängig auf einem leeren Rechner wiederholt.** Seine Schritte 1 und 2 wurden auf einer sauberen Kopie des Repositorys ausgeführt, sein Teil « Überprüfung » auf dem Stack des Entwicklungsrechners. Die Schritte 3 bis 8 übernehmen die Befehle dieses Rechners, aber der erste Durchlauf auf einem anderen PC kann ein Detail aufdecken: In diesem Fall die Abbruchmeldung und die Nummer des Schritts notieren.
- Die Versionen der Docker-Images (n8n 2.43.8, Qdrant 1.19.2, Mailpit 1.32.0, HAPI FHIR 8.12.0, PostgreSQL 16, Mosquitto 2) sind festgelegt, damit ein anderer Rechner denselben Stack erhält. Die ePA-Mocks von gematik werden in ihrer jeweils neuesten Version heruntergeladen: Ändern sie sich, kann Schritt 3 eine Anpassung erfordern.
- Die Ollama-Modelle sind nicht auf eine genaue Version festgelegt: Ein später heruntergeladenes `llama3.2` kann leicht abweichen, daher variieren die Ergebnisse der Batterie etwas.
- Die KI erzeugt einen Entwurf, den die Pflegekraft liest und validiert; das Projekt ist kein Medizinprodukt.
