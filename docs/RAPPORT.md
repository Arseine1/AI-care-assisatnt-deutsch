# Projektbericht: AI-Care Assistant (Tage 1 bis 4)

KI-Assistent für die Pflegeteams einer Pflegeeinrichtung in Deutschland, vollständig lokal (Docker), mit **100 % fiktiven** Daten. Dieser Bericht trennt, was **gemessen** wurde, von dem, was **geschätzt** ist, und sagt, was nicht funktioniert. Die detaillierten Entscheidungen, Schritt für Schritt, stehen in [DECISIONS.md](../DECISIONS.md); die Konformität mit den verlangten Liefergegenständen steht in [LIVRABLES.md](LIVRABLES.md).

**Arbeitsspeicher des Rechners**: 8 GB bis zum 27.10. mittags, **danach 16 GB** (Docker erhält 10,7 GB über die Datei `.wslconfig`). Der Ausgangsversuch (17/30), die vollständige Batterie (25/30) und die Lastmessungen wurden mit 8 GB durchgeführt; die letzte Demonstration (§4) wurde mit 16 GB durchgeführt. Die Dauern sind daher von Versuch zu Versuch nicht vergleichbar.

**Referenzstand**: Repository beim Commit `fc15577` (« Livrables étape 1 »), davor `ef62ed0` (Schritt 10), `5a4f7f6` (Schritt 9) und `f37e78e` (Schritt 8). Nichts ist auf GitHub veröffentlicht.

## 1. Prinzip

- **Kein freier Chat mit der KI.** Modus A: Schaltflächen senden `{action, chambre}`; der Prompt bleibt verborgen. Modus B: Die Pflegekraft wählt eine Person und schreibt eine kurze Anweisung; n8n prüft sie und fügt sie dann in ein gesperrtes Template ein.
- **Die Pflegekraft entscheidet.** Jede Antwort ist bearbeitbar, nennt ihre Quellen in eckigen Klammern und wird erst nach [Bestätigen & Speichern] endgültig, signiert vom angemeldeten Konto.
- **Der Code kontrolliert die KI, nicht umgekehrt.** Das Modell schreibt keinen freien Text: Es liefert JSON-Sätze, jeweils einem Fakt zugeordnet. Ein programmierter Filter entfernt jeden Satz, dessen Zahl, Dosis, Uhrzeit, Medikament, Urteil oder Verneinung nicht in diesem Fakt steht. Der Text wird vom Code zusammengesetzt.
- Schema: [architecture.md](architecture.md).

## 2. Was gebaut wurde

| Tag | Inhalt |
|---|---|
| **1** | docker-compose-Basis, React-Oberfläche (Modus A, Modus B, Warnungen, Validierung), Schicht `api.js` mit simulierten Antworten. |
| **2** | Testdaten (8 Bewohner, darunter zwei Namensvettern « Heinz Müller »), Qdrant (3 Collections), 5 n8n-Konnektoren + gemeinsamer Indexeur, Duplikatsperre per Fingerabdruck, Planung 4-mal täglich, simuliertes KIM-Postfach. |
| **3** | Bausteine `Suchen` / `Gesperrte Vorlage` / `Verfassen` / `Speichern` / `Protokoll`, 7 versionierte Prompts, Prüfung der Anweisung, mit n8n verbundene Oberfläche, « Dokument prüfen », Bericht pro Etage, Aufnahme ins RAG und Übermittlung. |
| **4** | Anti-Erfindungs-Filter; automatischer Etagenbericht um 5:30 Uhr; verlässliche Hintergrundaufgaben; MQTT-Alarme (+ TTN-Brücke); Briefe automatisch; Oberfläche mit drei Seiten; Sicherheit (PIN, Sitzungen, geschlossener Broker); Testbatterie; Korrekturen; Demonstration. |

## 3. Für jeden Versuch mit KI verwendete Modelle

| Versuch | Modell zum Schreiben | Embeddings |
|---|---|---|
| Erste Schreibversuche (Tag 3, Schritt 1) | `llama3` 8 Milliarden (1,8 Token/s, 16 Min. pro Bericht, eine Grenze von 15 Min. überschritten), dann **`llama3.2` 3 Milliarden** (4,4 Token/s), einvernehmlich gewählt | `nomic-embed-text` |
| Versuche der Prompts (`docs/prompts-tests.md`) | `llama3.2` (1/6 im ersten Versuch bestanden, 5/6 nach Verfeinerung) und `llama3` (übersieht die Penicillinallergie) | dito |
| Alle Versuche von Tag 4, die Batterie, die Demonstration | **`llama3.2`**, Temperatur 0,1, feste Zufallsinitialisierung | dito |

An Tag 4 wurde kein größeres Modell erprobt: Der Speicher (8 GB, keine Grafikkarte) erlaubt es nicht mit nutzbarer Geschwindigkeit.

## 4. Ergebnisse: GEMESSEN

| Thema | Gemessenes Ergebnis | Beleg |
|---|---|---|
| **Batterie mit 30 Fragen, Ausgangszustand** (Versuch vom 26.10., vor den Korrekturen von Schritt 9) | **17/30**: Fragen mit Antwort und Namensvettern **11/20** (9/16 + 2/4); Fragen ohne Antwort **6/10** | `tests/resultats/batterie-reel-202610262056.jsonl` |
| **Batterie mit 30 Fragen, NACH den Korrekturen** (vollständiger Versuch in einem Durchgang, 27.10., von 08:15 bis 10:27 Uhr) | **25/30**: Fragen mit Antwort und Namensvettern **15/20** (11/16 + 4/4); Fragen ohne Antwort **10/10**. Die erste Bewertung ergab 23/30: Zwei « Fehlschläge » (H2, Q07) waren **falsche Fehlschläge der Bewertung** (legitime Zahlen, ICD-10-Codes (CIM-10) aus der Krankenhausdatenbank und « 16 UI » aus einem gescannten Bericht standen nicht in der Liste der erlaubten Zahlen); die Liste wurde ergänzt, dann wurde der Versuch neu bewertet, ohne das Modell erneut aufzurufen | `tests/resultats/batterie-reel-202610270815.jsonl` |
| Bösartige Anweisungen (10) | 10/10 vor jeder KI abgelehnt, ohne Entwurf und ohne Generierung, Ablehnung im Journal protokolliert | Batterie, schneller Teil |
| Getarnte Varianten (10: Buchstaben mit Abstand oder Punkten, Englisch, gefälschter signierter Bericht, erzwungenes JSON …) | 10/10 nach Korrektur abgelehnt (2 der 4 vor der Korrektur geschriebenen Varianten gingen zunächst durch) | `tests/consigne.test.mjs` |
| Offline-Tests | **278 Tests in 15 Dateien, alle bestanden**, dazu der Aufteilungstest des Indexeurs (gesondert gezählt) | `node tests/<nom>.test.mjs` |
| Demonstration einer fiktiven Nacht, **letzter vollständiger Durchlauf** (27.10., nach den Korrekturen, **16 GB**) | **13 von 13 Prüfungen**, 6,4 Minuten: Alarm in 0,8 s sichtbar, Qdrant-Index innerhalb einer Sekunde aktualisiert, Brief in 25 s dem richtigen Müller zugeordnet, Dienstbericht (4 Rubriken) in 235 s, Antwort in Modus B in 111 s, 0 Sätze ohne Quelle | `docs/demo-derniere.md` |
| Dieselbe Demonstration mit 8 GB (27.10., 00:11 bis 00:23 Uhr, vor der Indexierung des Alarms) | 12 von 12 Prüfungen; Alarm 4,0 s; Bericht 334 s; Modus B 184 s | (ersetzt in `docs/demo-derniere.md`) |
| Bericht einer ganzen Etage | 8 Bewohner in 18 Minuten | `tests/etage-live.mjs` |
| Ausfall von Qdrant | kein Text erfunden, kein Entwurf, automatische Wiederaufnahme | Batterie |
| Sicherheit | kein Zugriff ohne Sitzung, gehashte PIN, Sperrung, Signatur aus der Sitzung entnommen | `tests/securite.test.mjs` (21), `tests/securite-live.mjs` |
| Briefe | 5 Briefe verarbeitet (darunter ein Scan per OCR); der richtigen Person zugeordnet, auch die beiden Müller | `tests/courrier-live.mjs` (16 Prüfungen) |

**Wie eine Antwort der Batterie bewertet wird.** Automatisch, anhand von Hand geschriebener Erwartungen (`tests/batterie/cas.mjs`): (1) die erwarteten Wörter müssen in der Antwort stehen (ohne Rücksicht auf Akzente und Großschreibung); (2) kein Name einer *anderen* Person; (3) mindestens eine zitierte Quelle, und bei Protokollfragen eine Quelle « Protokoll »; (4) keine Zahl, die weder in den Daten der Person noch in den Protokollen noch in der Frage steht; (5) bei Fragen *ohne Antwort in den Quellen* ist die einzige akzeptierte Antwort « Information nicht verfügbar », ohne Zahl. Eine korrekte, aber mit anderen Wörtern formulierte Antwort kann daher als Fehlschlag gezählt werden, und es gibt kein menschliches Gegenlesen jeder Antwort.

## 5. Ergebnisse: GESCHÄTZT oder NOCH NICHT BESTÄTIGT

| Thema | Schätzung | Warum es keine Messung ist |
|---|---|---|
| Alarm unter 5 s | in Ruhe erfüllt | siehe §7 |

Die Schätzung « etwa 26/30 » aus Teilwiederholungen wurde **durch die Messung einer vollständigen Batterie ersetzt: 25/30** (§4). Sie wird nicht mehr verwendet.

## 6. Was « kein Satz ohne Quelle » garantiert, und was nicht

- **Garantiert (durch den Code, getestet)**: Jeder angezeigte Satz ist *einem* gelieferten Fakt zugeordnet; seine Zahlen, Dosen, Uhrzeiten, Daten, Medikamente, Urteile und Verneinungen stehen in *diesem* Fakt; mindestens 70 % seiner Inhaltswörter stammen daraus (der Satz wird entfernt, sobald 30 % dieser Wörter darin fehlen); keine andere Person wird genannt. Der Filter **entfernt** den durchfallenden Satz (er meldet ihn nicht nur). Die Quelle in eckigen Klammern wird vom Code anhand des zitierten Fakts hinzugefügt.
- **Nicht garantiert**: (1) dass der Satz den **gesamten Sinn** des Fakts bewahrt (eine subtile Umkehrung, ein Kausalzusammenhang, die Reihenfolge der Ereignisse können durchgehen); (2) dass die Antwort **vollständig** ist: Das Modell kann einen Fakt auslassen (Q13, Q14, Q15 sind Beispiele); (3) dass der zitierte Fakt **der richtige** für die Frage ist.
- Das Gegenlesen durch die Pflegekraft bleibt Pflicht.

## 7. Kriterien des Plans: erfüllt / teilweise / nicht erfüllt

| Kriterium | Status | Detail |
|---|---|---|
| Kein Satz ohne Quelle in einem validierten Bericht | **Erfüllt** (im Sinne von §6) | 0 von 8 Zeilen in der Demonstration; vom Code garantiert |
| Die Widersprüche des Abendtests gemeldet, ohne Fehlalarm | **Erfüllt** | 4 durch Regeln erkannt (§8); Frau Fischer: kein Fehlalarm |
| Alle bösartigen Anweisungen abgelehnt | **Erfüllt** für die 10 + 10 bekannten Varianten; **teilweise** allgemein | die Kontrolle ist eine Liste von Mustern, keine Garantie gegen jede neue Formulierung |
| Alarm in weniger als 5 s angezeigt | **Unter Last nicht erfüllt** | 1,8 bis 4,0 s, wenn nichts anderes läuft; 7,4 s (Demonstration) und bis zu 22 bis 37 s während einer Generierung von Llama. Ursache: Der Rechner mit 8 GB ist überlastet; die Logik wartet nicht auf die KI (ein Graphtest prüft das) |
| Batterie mit 30 Fragen | **Teilweise** | 17/30 am Anfang, **25/30 gemessen nach Korrekturen**; 5 Fehlschläge: Q01, Q12, Q13, Q15, Q16 (das kleine Modell fasst zusammen und verliert ein Schlüsselwort oder antwortet « Gewicht. Diurese. » ohne Wert) |
| Fragen ohne Antwort: « Information nicht verfügbar » | **Erfüllt** (**10/10 gemessen**) | 6/10 vor Schritt 9 |
| Etagenbericht um 5:30 Uhr bereit | **Erfüllt** | 8 Bewohner in 18 Minuten |
| Wiederaufnahme nach Halt von n8n, Abbruch einer Aufgabe | **Erfüllt** | Praxisversuche |
| Minimale Sicherheit (PIN, Sitzungen, geschlossener Broker) | **Erfüllt mit Grenzen** | kein HTTPS, keine Rollen, Schlüssel der Oberfläche lesbar, Webhook des Briefs ohne Authentifizierung |
| Demonstration von einem leeren Docker-Stack | **Teilweise** | Verfahren im README beschrieben; `docker compose down -v` **nie wiederholt** |
| Drei Geschäftsprozesse gleichzeitig | **Teilweise** | jeder einzeln getestet, und die Demonstration verkettet drei; kein Versuch, bei dem ein vollständiger Etagenbericht, ein Alarm und ein Brief im selben Moment starten |
| Qualität der Texte mit dem kleinen Modell | **Teilweise** | unvollkommenes und von Versuch zu Versuch schwankendes Abschreiben (Q12 und Q14 haben zwischen zwei Durchläufen das Ergebnis gewechselt); ein Ratschlag aus einem gescannten Bericht (« Insulin reduzieren… ») wird in der Antwort auf « Was wurde unternommen, um die Hypoglykämie zu korrigieren? » (Q07) übernommen: mit Quelle, aber keine durchgeführte Maßnahme |

## 8. Die vier erkannten Widersprüche (Coderegeln, ohne KI)

Sie werden beim Klick auf « Dokument prüfen » durch **Regeln** erkannt, die den Arztbrief (Text) und die Akte der Person vergleichen; die KI fügt nur hinzu, nie entfernt sie.

| Person | Brief | Regel | Warnung |
|---|---|---|---|
| Herr Weber (Zimmer 12) | verschreibt Amoxicillin | Penicillinfamilie und Penicillinallergie in der Akte | Allergie (hoch) |
| Frau Schulz (Zimmer 10) | verschreibt Apixaban | doppelte Antikoagulation: Marcumar wird nicht abgesetzt | `anticoagulation_double` |
| Herr Wagner (Zimmer 20, **gescannter** Brief, OCR) | verschreibt Ibuprofen 600 mg | NSAR und chronische Niereninsuffizienz | `insuffisance_renale` |
| Herr Heinz Müller **geboren am 01.12.1947** (Zimmer 21) | verschreibt Cotrimoxazol | Sulfonamide und Sulfonamidallergie in der Akte | Allergie; **nicht vorhanden** beim anderen Müller (Zimmer 11) |

Ohne Widerspruch: Frau Fischer (Zimmer 22), kein Fehlalarm (ein kleines Modell hatte einmal einen erfunden, von der Kontrolle gefiltert). Die Namensvettern unterscheiden sich nur durch das Geburtsdatum: Ein Brief wird nur einer Person zugeordnet, deren **Name UND Geburtsdatum** übereinstimmen.

## 9. Was während der Demonstration lief (27.10., 00:11 bis 00:23 Uhr)

| Element | Zustand |
|---|---|
| n8n, PostgreSQL, Qdrant, Mosquitto, Mailpit (simuliertes KIM-Postfach), OCR | in Betrieb |
| Ollama (Rechner), `llama3.2` und `nomic-embed-text` | in Betrieb |
| Drei ePA-Mocks (Medikation, Darstellung, Information) | in Betrieb |
| HAPI FHIR (Krankenhausdatenbank) | **angehalten** (Speicher): seine Quelle wird nur im bereits indexierten RAG gelesen |
| Geplante Konnektoren | aktiv: Der Durchlauf um Mitternacht überschnitt sich mit der Demonstration. n8n-Journal: Pflegesoftware 00:00 erfolgreich, **FHIR 00:10 mit Fehler** (Server angehalten), Dateien 00:20 erfolgreich, **ePA 00:30 mit Fehler**, KIM 00:40 erfolgreich |
| Oberfläche | nicht verwendet: Die Demonstration ruft dieselben Webhooks auf wie die Oberfläche |

**Was « Suchen » liest.** Für eine Anfrage liest `Suchen` **live die Pflegesoftware** (Notizen des Zeitraums, Vitalwerte, Medikationsplan, Akte der Person, in PostgreSQL), weil das RAG sechs Stunden Verspätung haben kann; und es fragt **das RAG (Qdrant)** für alles Übrige ab: ePA, Krankenhausdatenbank, Dokumente, validierte Briefe, Protokolle und seit dem 27.10. die Sensoralarme. Das RAG wird immer nach Person (`patient_id`) gefiltert. Die ungeprüften Briefe (`a_verifier`) werden nie mit den Fakten vermischt.

## 10. Aufgetretene und behobene Fehler (nicht erschöpfende Liste)

- Der erste Filter meldete nur; ein kleines Modell erfand « erhebliche Diurese »: Der Filter entfernt jetzt.
- Ein in einen Prompt geschriebenes Beispiel (« Sturz festgestellt um 04:41 Uhr ») wurde als Fakt abgeschrieben: In den Prompts steht kein konkretes Beispiel mehr.
- Llama 3 8B hat die Penicillinallergie übersehen: Die Coderegeln wurden zum Sicherheitsnetz.
- Mailpit benachrichtigt nur einmal pro Sekunde: Ein Nachholen alle 2 Minuten verhindert verlorene Briefe.
- In Schritt 8 meldete meine Batterie falsche « Lecks zwischen Bewohnern » (sie verbot den Namen der befragten Person): Fehler des Tests, korrigiert und benannt.
- **Der Alarm wurde nicht zu Qdrant hinzugefügt** (nur zu PostgreSQL), obwohl die verlangte Demonstration « ein IoT-Alarm, dann die Aktualisierung des RAG-Index » lautet. Am 27.10. bei der Prüfung der Liefergegenstände gefunden, im Workflow 81 korrigiert; **in der Praxis bestätigt** nach erneutem Import (schnelle Demo: Der Alarm erscheint nach 1,4 s, der Punkt liegt 5 s später in Qdrant, 93 → 94 Punkte). Jeder Durchlauf der Demo fügt der Collection `patients` einen Alarmpunkt hinzu.
- **Die Indexierung der Alarme verschlechterte die Berichte.** Eine erste vollständige Demonstration nach dem Hinzufügen des Alarms zu Qdrant ergab einen dürftigen SBAR-Bericht (zwei Rubriken « Information nicht verfügbar »): Drei Demonstrationsalarme belegten 3 der 8 Faktenplätze (maximale Wichtigkeit). Die indexierten Alarme bilden jetzt **einen einzigen Fakt** (« Sensoralarme im Zeitraum: … »), ein Test prüft das, die Demonstration entfernt ihren eigenen Punkt aus Qdrant, und der folgende Bericht hat wieder seine vier Rubriken. Weitere nicht verfolgte Möglichkeit: auch die anderen sich wiederholenden Fakten zu begrenzen.
- Der Testworkflow `test-llama3.json` rief Llama ohne Temperatur auf (0,8 als Standard statt 0,0 bis 0,2): korrigiert.
- Ollama war nicht in der `docker-compose.yml` (dokumentierte Entscheidung: das des Rechners): Dienst unter einem Profil hinzugefügt.
- **Q16 der vollständigen Batterie scheiterte mit HTTP 500**: n8n verlor seine Verbindung zu PostgreSQL (« timeout exceeded when trying to connect », 0,7 GB freier Speicher). Allein wiederholt antwortet die Frage, erhält aber nur 1 von 2 Diagnosen: Der Fehlschlag ist auch ein inhaltlicher Fehlschlag.
- Bei langen Versuchen wurden Docker, dann Ollama beendet (Speicher fast voll, 0,7 GB frei): Eine Batterie scheiterte in 1 Sekunde pro Frage; neu gestartet.

## 11. Bekannte Grenzen (vor jeder Nutzung lesen)

- **Kein realer Einsatz im jetzigen Zustand möglich**: fiktive Daten, kein HTTPS, keine Rollen, Token 12 Stunden gültig, Schlüssel `X-AICare-Cle` in der Oberfläche lesbar (ein Filter, kein Geheimnis), Webhook `courrier-recu` ohne Authentifizierung, per Skript angelegte Konten.
- **Ein Modell mit 3 Milliarden Parametern genügt nicht** für ein getreues Verfassen: Es braucht ein größeres Modell und einen Rechner mit Grafikkarte, danach ist die Batterie zu wiederholen.
- Eine Anfrage, deren genaues Wort in der Akte fehlt, antwortet « Information nicht verfügbar », selbst wenn ein Synonym existiert (Synonymliste zu erweitern).
- Die Alarme werden nur auf ihrer Seite angezeigt (Wunsch des Nutzers): roter Zähler und Piepton anderswo.
- Kein physischer Sensor: Der Alarm kommt von MQTT oder einer simulierten TTN-Uplink-Nachricht.
- Der TTN-API-Schlüssel wurde in eine Konversation eingefügt: Er muss neu erzeugt werden.

## 12. Zum Wiederholen

[README, « Demonstration »](../README.md). Letzter Durchlauf: [demo-derniere.md](demo-derniere.md). Batterie: [tests/resultats/batterie-derniere.md](../tests/resultats/batterie-derniere.md).

## 13. Nützliche Fortsetzungen, nach Wert geordnet

1. Die verbleibenden Fehlschläge verringern (Q01, Q12, Q13, Q15, Q16): Alle stammen vom Abschreiben durch das kleine Modell; ein größeres Modell ist die erste Spur.
2. ~~Die Indexierung des Alarms in Qdrant bestätigen~~: erledigt. Offen bleibt, die **vollständige** Demonstration (mit Llama, 13 Minuten) zu wiederholen: Der letzte in `demo-derniere.md` gespeicherte Durchlauf ist die schnelle Version.
3. Ein größeres Modell auf einem Rechner mit Grafikkarte erproben; die Batterie zeigt, ob es besser ist.
4. Von einem leeren Stack aus wiederholen; ein gleichzeitiger Versuch der drei Prozesse.
5. Rollen, Kontenverwaltung in der Oberfläche, HTTPS; den Webhook des Briefs schützen (IMAP).
