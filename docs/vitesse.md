# Geschwindigkeit: Messungen vorher / nachher (Tag 4, Schritt 2)

Testrechner: 8 GB RAM, ohne Grafikkarte, Llama 3.2 (3 Milliarden Parameter) über Ollama. Messung: `node tests/bench-vitesse.mjs 2 12 <Bezeichnung>` (Dienstbericht von Herrn Weber, Zimmer 12, über den echten n8n-Webhook; beim ersten Versuch ist das Modell entladen oder nicht, der zweite läuft « warm »). Die Rohergebnisse stehen in `tests/resultats/vitesse.jsonl`.

## Ergebnisse

| Einstellung | Versuch | Gesamt | Davon Modell | Erzeugte Token | Gesendete Fakten |
|---|---|---|---|---|---|
| **Vorher** (Tag 3: bis zu 40 Fakten, max. 500 Token, Modell 10 Min. gehalten) | 1 (kalt) | 139 s | 126 s | 202 | 11 |
| | 2 (warm) | 57 s | 50 s | 167 | 11 |
| 8 Fakten, max. 450 Token, Modell 30 Min. gehalten | 1 | 167 s | 158 s | 194 | 8 |
| | 2 | 68 s | 57 s | 178 | 8 |
| + kurze JSON-Schlüssel (`r`, `t`, `f`) | 1 | 107 s | 99 s | 248 | 8 |
| | 2 | 76 s | 71 s | 223 | 8 |
| **Endstand**: + 8 Sätze mit höchstens 220 Zeichen (140 schnitt Sätze mitten im Wort ab: « pour Diâ. »), Suchmodell 30 Min. gehalten | 1 | 82 s | 76 s | 222 | 8 |
| | 2 | 73 s | 68 s | 222 | 8 |

Eine erste « Vorher »-Messung von 160 s (16 Fakten) wurde der Erinnerung halber in der Datei behalten; eine andere, durch einen Ruhezustand des Rechners (19 Stunden) verfälschte, wurde entfernt.

## Was die Messungen zeigen (offen gesagt)

- **Die Zeit eines Berichts sinkt nicht deutlich**: zwischen 57 s und 73 s warm, mit einer Abweichung von 15 s, die vor allem von der Zahl der erzeugten Wörter herrührt (167 bis 248 Token je nach Versuch). Die Einstellungen haben die Größenordnung nicht verändert.
- **Die Zeit ist proportional zu den erzeugten Token**: etwa 3 Token (Wortstücke) pro Sekunde auf diesem Rechner. Die Länge des Prompts spielt kaum eine Rolle: Von 11 auf 8 Fakten zu gehen, hat nichts messbar beschleunigt. Den Prompt zu verkürzen bringt also nichts; **die Länge der Antwort zu begrenzen** kann helfen, aber ein Modell mit 3 Milliarden Parametern, das mindestens vier Sätze schreiben muss, erzeugt ebenso viel wie zuvor.
- **Der erste Bericht nach einer Pause kostet mehr** (bis zu 80 bis 100 s mehr bei kaltem Start): Laden des Modells in den Speicher. `keep_alive` mit 30 Minuten vermeidet das, solange die Berichte aufeinanderfolgen.
- **Der Speicher ist die eigentliche Obergrenze**: Nach den Versuchen 0,75 GB frei von 8 GB. Llama 3.2 belegt 2,4 GB und das Suchmodell (`nomic-embed-text`) 0,4 GB.

## Gewählte Einstellungen

| Einstellung | Wert | Grund |
|---|---|---|
| `num_ctx` | 4096 | reicht für 8 Fakten und die Regeln; größer = mehr Speicher |
| `num_predict` (in Token) | 450 (Text in JSON-Sätzen) | begrenzt die Dauer; ein abgeschnittenes JSON wird Satz für Satz gerettet |
| `keep_alive` | 30 Minuten (Generierung und Suche) | kein erneutes Laden zwischen zwei Berichten derselben Etage |
| Fakten je Bewohner | höchstens 8, nach Wichtigkeit gewählt (Sensoralarm, Vorfall, Allergie, Risiken, Medikation, Vitalwerte, jüngste Beobachtungen …) | kürzerer Prompt, weniger Verwechslungsstoff |
| Sätze | höchstens 8, höchstens 220 Zeichen, JSON-Schlüssel mit einem Buchstaben | begrenzt die Länge der Antwort |
| `OLLAMA_MAX_LOADED_MODELS` | **nicht angewendet** | siehe unten |

### Warum `OLLAMA_MAX_LOADED_MODELS=1` nicht angewendet wird

Jeder Bericht verwendet **zwei** Modelle: `nomic-embed-text` (Suche im RAG), dann Llama 3.2 (Verfassen). Gemessen: Beide passen zusammen in den Speicher (2,4 + 0,4 GB). Mit einer Grenze von 1 würde Ollama bei **jedem** Bericht das eine entladen, um das andere zu laden, was jedes Mal einen Ladevorgang hinzufügt. Die Grenze von 1 bleibt empfohlen, **wenn man Llama 3 mit 8 Milliarden Parametern** auf diesem Rechner verwendet (zwei große Modelle passen nicht): `setx OLLAMA_MAX_LOADED_MODELS 1`, dann Ollama neu starten. Sie wird auf diesem Rechner nicht geändert.

## Der eigentliche Gewinn: Der Bericht ist fertig, bevor man ihn anfordert

Die Generierungszeit eines Berichts kann auf diesem Rechner nicht kurz werden. Was sich beseitigen lässt, ist **das Warten der Pflegekraft**: Der Workflow `76-etage-automatique` bereitet jeden Morgen um **5:30 Uhr** (Berliner Zeit) die Berichte aller Etagen vor, eine Person nach der anderen. Bei der Ablösung öffnet die Pflegekraft « Automatischen Bericht von 05:30 Uhr öffnen », liest gegen, korrigiert, validiert.

- Jede Etage wird einmal vorbereitet; niemals zweimal innerhalb von 3 Stunden (Neustart von n8n, manuelle Auslösung).
- Derselbe Unter-Workflow (`68-brique-etage-complet`) dient dem Klick der Pflegekraft und der Auslösung um 5:30 Uhr: gleiche Regeln, gleicher Anti-Erfindungs-Filter.
- **Praxisversuch** (manuelle Auslösung des Workflows, frische Daten): Etage 2 in 9 Minuten fertig (4 Berichte, je 2 bis 3 Minuten), Etage 1 in weiteren 9 Minuten, also 18 Minuten für 8 Bewohner, ohne dass jemand wartet. Die beiden Aufgaben werden von der Oberfläche über icare-tache {etage, recent: true} geöffnet. Qualität: Herr Weber, 4 Sätze mit Quelle, 0 entfernt; Frau Schulz, 1 Satz behalten und 4 entfernt; Herr Müller, 5 entfernt; Herr Becker, 1 entfernt (Rubrik R leer: « Information nicht verfügbar »). Der Filter leistet seine Arbeit, aber Llama 3.2 bleibt wenig vollständig: kurze Berichte, Gegenlesen unerlässlich.

## Schätzungen für den Einsatzrechner (nicht gemessen)

- 16 GB RAM, ohne Grafikkarte: größeres Risiko eines überlasteten Speichers; Llama 3 8B wird nutzbar, wohl 4 bis 6 Minuten pro Bericht (Schätzung).
- Mit einer Grafikkarte mit mindestens 8 GB Videospeicher: in der Größenordnung von zehn Sekunden (Schätzung).
- Das Modell wird über `AICARE_MODELE` gewechselt (`node workflows/generer.mjs`, dann erneuter Import), sonst ist nichts zu ändern.
