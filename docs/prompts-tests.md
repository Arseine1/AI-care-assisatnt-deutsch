# Praxisversuche der 6 Prompts mit dem echten Modell

Ergebnisse von `node tests/prompts-live.mjs`: **nominaler** Fall jedes Prompts, von Ollama erzeugter Text mit denselben Einstellungen wie in der Produktion (Temperatur 0,1, feste Zufallsinitialisierung, Wiederholungsstrafe) und von denselben automatischen Kontrollen geprüft. Testrechner: 8 GB RAM, nur Prozessor (ohne Grafikkarte). Vollständig fiktive Daten.

Ein Fall ist « bestanden », wenn der Text enthält, was er enthalten muss, nicht enthält, was er nicht enthalten darf, und die erwarteten JSON-Pfade einhält. **Bestanden heißt nicht verlässlich**: Die Spalte « Warnungen » zeigt, was die Kontrollen gemeldet haben.

## Llama 3.2 (3 Milliarden Parameter): Standardmodell auf diesem Rechner

| Prompt | 1. Versuch | Nach Verfeinerung der Prompts | Dauer | Warnungen der Kontrollen (2. Versuch) |
|---|---|---|---|---|
| `extraire_faits` | Fehlschlag: Aktion « poursuite » statt « debut », 2 Medikamente unter Empfehlungen eingeordnet | **Fehlschlag**: Feld `duree` ausgelassen, Vorname verloren | 125 → 159 s | keine (fehlender Schlüssel `duree` nicht gesehen: Testwerkzeug seither korrigiert, wird jetzt gemeldet) |
| `comparer` | Fehlschlag: `aucune_contradiction: true` mit einem Widerspruch in der Liste, Schlüssel `gravité` mit Akzent | **bestanden** (Details ungefähr: `element_source` ungenau) | 67 → 86 s | keine |
| `resume_epa` | bestanden | **bestanden** | 72 → 74 s | Quellen in falschem Format geschrieben (`[CIM-10 …]`) |
| `points_vigilance` | Fehlschlag: Einleitung hinzugefügt, falsche Quellen, erfundene Begriffe | **bestanden** | 100 → 89 s | `source_inconnue`, `terme_non_source` |
| `contexte_alarme` | Fehlschlag: « Information nicht verfügbar » unter Alarm, obwohl der Alarm existiert | **bestanden** | 62 → 73 s | `copie_des_faits`, `valeur_non_sourcee`, `phrase_sans_source`, `terme_non_source` |
| `generer_sbar` | (siehe `docs/briques-ia.md`) | **bestanden** | 96 → 133 s | 9 Warnungen: unbekannte Quellen, hinzugefügtes Urteil (« erhöht »), Zahl außerhalb der zitierten Quelle, Sätze ohne Quelle |

Zu merken: 5 von 6 Fällen bestehen nach der Verfeinerung die Grundprüfungen, aber **der Text bleibt oft unvollkommen** (hinzugefügte Urteile, falsch geschriebene Quellen, Sätze ohne Quelle): Die Kontrollen melden es, sie korrigieren es nicht.

## Llama 3 (8 Milliarden Parameter): Versuch mit den beiden JSON-Prompts

| Prompt | Urteil | Dauer | Bemerkung |
|---|---|---|---|
| `extraire_faits` | **bestanden** | 309 s | besser als Llama 3.2: Dauer « 7 Tage » extrahiert (« 7 Tage » im Dokument) |
| `comparer` | **schwerer Fehlschlag** | 599 s | antwortet `{"contradictions": [], "aucune_contradiction": true}`: **übersieht die Penicillinallergie** trotz verschriebenem Amoxicillin |

Der Fall `comparer` ist ein **falsch-negativer**: Keine Kontrolle kann ihn erkennen (die Antwort ist gültig und konsistent). Das ist das ernsteste Risiko des gesamten Systems: eine falsche Beruhigung.

## Schlussfolgerung und Konsequenzen

1. **Ein Sprachmodell darf nicht die einzige Wache gegen schwere Widersprüche sein** (Allergie, doppelte Antikoagulation, Entzündungshemmer bei Niereninsuffizienz). Das größere Modell hat sie übersehen, das kleinste hat sie gesehen: Das Ergebnis ist nicht vorhersehbar.
2. **Deterministisches, vom Modell unabhängiges Sicherheitsnetz**: Die Medikamentenfamilien des Prompts `comparer` (Penicilline, Sulfonamide, Antikoagulanzien, NSAR) sind eine geschlossene Liste; sie lassen sich durch einfachen Regelcode auf die Fakten und den extrahierten Brief anwenden. Es wird mit dem Modell kombiniert (Vereinigung der Warnungen): zu bauen mit der Schaltfläche « Dokument prüfen » (Tag 3, Schritt 3).
3. **Die automatischen Kontrollen und das Gegenlesen durch die Pflegekraft bleiben Pflicht**; die Schaltfläche [Bestätigen & Speichern] ist niemals automatisch.
4. **Hardware**: Auf diesem Rechner liest Llama 3 (8 Md) einen Prompt von 1 500 Token in mehreren Minuten (599 s für ein JSON von 17 Token). Für den realen Einsatz ist ein Rechner mit Grafikkarte oder 16 GB RAM oder mehr nötig, mit dem größten verfügbaren Modell.

## Diese Versuche wiederholen

```bash
node tests/prompts-live.mjs comparer 1          # ein Fall
node tests/prompts-live.mjs                     # die 18 Fälle (sehr lang)
$env:AICARE_MODELE = 'llama3'; node tests/prompts-live.mjs extraire_faits 1   # anderes Modell (PowerShell)
```

Die 18 Fälle bestehen aus 6 Prompts × (nominal, fehlende Information, Falle). Nur die nominalen Fälle wurden mit dem echten Modell erprobt; die 18 Referenzantworten werden ohne KI von `node tests/prompts.test.mjs` geprüft (58 Tests).
