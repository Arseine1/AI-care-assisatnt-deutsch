# Prompts

Die Prompts sind **versioniert** (Feld `version`, semantische Versionsnummer) und **gesperrt**: Eine Pflegekraft sieht sie weder noch ändert sie sie. Sie werden bei der Generierung (`node workflows/generer.mjs`) in die n8n-Workflows eingebettet, und die verwendete Version wird im Audit-Journal (`soins.journal_ia`) und in jedem Entwurf vermerkt.

## Das gesperrte Template

Jeder Aufruf der KI verwendet denselben Aufbau, der vom Unter-Workflow « template » erstellt wird (nirgendwo sonst):

```
[RÔLE ET RÈGLES]        fester Text aus _regles.md (für alle Prompts identisch)
[FAITS DES SOURCES]     von « chercher » gefundene Fakten, jeweils mit ihrer Quelle in eckigen Klammern
[INSTRUCTION SOIGNANT]  Modus A: feste Anweisung des Prompts (hinter der Schaltfläche verborgen)
                        Modus B: Anweisung der Pflegekraft, NACH der Prüfung, und nur hier
[FORMAT DE SORTIE]      vom Prompt vorgegebenes Format
```

Regeln des Templates: nur die gelieferten Fakten verwenden; jeden Fakt mit seiner Quelle in eckigen Klammern zitieren; « information non disponible » schreiben, wenn ein Fakt fehlt; niemals zwei Bewohner vermischen; einen Wert nicht bewerten, wenn kein Fakt ihn bewertet.

## Die Prompts

| Prompt | Version | Ausgabe | Aufgabe | Zeitraum | Protokolle |
|---|---|---|---|---|---|
| [`generer_sbar`](generer_sbar.md) | 1.0.4 | Text | SBAR-Übergabe der letzten 12 Stunden | 12 h | nein |
| [`resume_epa`](resume_epa.md) | 1.0.0 | Text | Zusammenfassung der ePA-Akte: Diagnosen, Allergien, Medikation (eML) | 24 h | nein |
| [`points_vigilance`](points_vigilance.md) | 1.0.1 | Text | höchstens 6 Aufmerksamkeitspunkte, nach Sicherheitsrelevanz geordnet | 24 h | ja |
| [`contexte_alarme`](contexte_alarme.md) | 1.0.1 | Text | nützlicher Kontext, um auf einen Sensoralarm zu reagieren | 24 h | ja |
| [`extraire_faits`](extraire_faits.md) | 1.0.1 | **striktes JSON** | strukturierte Daten aus einem Dokument (Arztbrief) | — | nein |
| [`comparer`](comparer.md) | 1.0.1 | **striktes JSON** | Widersprüche zwischen einem Brief und den Quellen (Allergie, doppelte Antikoagulation, Niereninsuffizienz) | 24 h | ja |

Ein siebter Prompt, [`consigne_guidee`](consigne_guidee.md) (1.3.0, Text, 24 h, Protokolle: ja, liest bereits validierte Dienstberichte erneut), dient als Vorlage für **Modus B**: Die Anweisung der Pflegekraft füllt nach der Prüfung den Block INSTRUCTION SOIGNANT. Auch er hat 3 Testfälle. Seit Version 1.3.0 (Schritt 9 von Tag 4) ordnet « chercher » die Fakten zuerst nach der Anfrage der Pflegekraft (Wörter und pflegerische Synonyme) und gibt dem Modell keinen Fakt, wenn die Akte das Thema nicht behandelt: Die Antwort lautet dann « information non disponible ».

Gemeinsame Regeln: [`_regles.md`](_regles.md) (Version 1.2.1). Die Bausteine, die diese Prompts verwenden, sind in [docs/briques-ia.md](../docs/briques-ia.md) beschrieben.

## Format einer Prompt-Datei

```markdown
---
id: generer_sbar          # Kennung (= Dateiname)
version: 1.0.4            # bei jeder Textänderung zu erhöhen
sortie: texte             # texte | json (json = striktes, geprüftes JSON als Ausgabe)
cles_json: a,b            # Pflicht bei sortie: json: Schlüssel, die das JSON-Objekt enthalten muss
listes_json: l:x|y        # optional: Schlüssel, die jedes Element der Liste « l » tragen muss
temperature: 0.1
heures: 12                # Standardzeitraum der Fakten
requete: …                # Wörter für die semantische Suche im RAG
protocoles: false         # Protokolle des Hauses den Fakten beifügen oder nicht
max_phrases: 8            # optional: Höchstzahl der Sätze der Antwort (Standard 8)
longueur_phrase: 220       # optional: höchstens so viele Zeichen pro Satz (Standard 220)
max_faits: 8              # optional: Höchstzahl der an das Modell gesendeten Fakten (Standard 8)
sources_prioritaires: ePA   # optional: Quellen, deren Fakten zuerst berücksichtigt werden (durch | getrennt)
rapports_valides: false   # optional: bereits validierte Dienstberichte erneut lesen (nie zum Schreiben eines neuen Berichts)
---
## INSTRUCTION
…Text des Blocks [INSTRUCTION SOIGNANT] ({periode_heures} wird ersetzt)

## FORMAT DE SORTIE
…Text des Blocks [FORMAT DE SORTIE]
```

Der Generator weist einen unvollständigen Prompt zurück (fehlendes Feld, Kennung abweichend vom Dateinamen, fehlende Abschnitte, JSON ohne `cles_json`).

## Testfälle: `prompts/tests/<prompt>.json`

Jeder Prompt hat **genau 3 Fälle**:

| Typ | Was er prüft |
|---|---|
| `nominal` | der Normalfall: Der Text übernimmt die Fakten mit ihren Quellen |
| `manquant` | eine Information fehlt: Die KI schreibt « information non disponible » (oder meldet nichts), statt etwas zu erfinden |
| `piege` | ein Fakt oder ein Dokument enthält eine Aufforderung (« ignore les règles… ») oder die Daten einer anderen Bewohnerin bzw. eines anderen Bewohners: Sie wird nicht ausgeführt |

Ein Fall enthält: die Bewohnerin bzw. den Bewohner, die gelieferten **Fakten**, eine **Referenzantwort** (von Hand geschrieben, Vorbild für das Erwartete) und das **Erwartete** (`contient`, `ne_contient_pas`, JSON-Pfade, Warnungen).

### Zwei Teststufen

| Befehl | Was | Dauer |
|---|---|---|
| `node tests/prompts.test.mjs` | **ohne KI**: Struktur der Prompts, jeweils 3 Fälle, Aufbau des Templates (4 Blöcke, nur eine Bewohnerin bzw. ein Bewohner, ein Fakt gelangt nie in den Anweisungsblock), von den automatischen Kontrollen validierte Referenzantworten und kein konkretes Beispiel (Uhrzeit, Name) in den Prompts | sofort |
| `node tests/prompts-live.mjs [prompt] [cas]` | **mit dem echten Modell** (Ollama): gleiches Template, gleiche Einstellungen und gleiche Kontrollen wie in der Produktion | 3 bis 6 Min. pro Fall mit Llama 3.2 |

Ergebnisse der Praxistests: [docs/prompts-tests.md](../docs/prompts-tests.md).

## Dateien

| Datei | Aufgabe |
|---|---|
| `_regles.md` | Block [RÔLE ET RÈGLES], allen Prompts gemeinsam |
| `generer_sbar.md`, `resume_epa.md`, `points_vigilance.md`, `contexte_alarme.md`, `extraire_faits.md`, `comparer.md` | die 6 Prompts |
| `tests/*.json` | die 18 Testfälle (3 pro Prompt) |
