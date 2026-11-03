# Testdaten (100 % fiktiv)

Fiktives Pflegeheim „Haus Sonnenhof“: 8 Bewohner, Zimmer 10–14 (Stockwerk 1) und 20–23 (Stockwerk 2).
Kein Name, kein Wert und kein Dokument stammt von realen Personen.

## Einzige Quelle

`source/residents.mjs` ist die **einzige** Quelle der Bewohner (Diagnosen, Allergien, Medikation, Kost, Risiken, Notizen, Vitalwerte, Laborwerte). SQL, FHIR-Bundle und die Liste des Frontends werden daraus **erzeugt**: Man ändert sie nicht von Hand.
`source/lettres.mjs` beschreibt die 5 Arztbriefe.

## Absichtlich vorgesehene Szenarien

| Bewohner | Szenario | Wo zu finden |
|---|---|---|
| Herr Hans Weber, Zi. 12 | Allergie gegen **Penicillin**; **Sturz heute Nacht** (vor 5 h); Brief mit Verordnung von **Amoxicillin** → Widerspruch | Pflegenotizen, FHIR, KIM-Brief |
| Frau Greta Schulz, Zi. 10 | Unter **Marcumar**; Brief mit Verordnung von **Apixaban** ohne Erwähnung von Marcumar → doppelte Antikoagulation | Medikationsplan, KIM-Brief |
| Herr Otto Wagner, Zi. 20 | **Niereninsuffizienz Stadium 4** (GFR 22); **gescannter** Brief (Bild) mit Verordnung von **Ibuprofen** → renaler Widerspruch, OCR erforderlich | Notizen, FHIR, gescannter KIM-Brief |
| Herr Karl Becker, Zi. 14 | **Nächtliche Hypoglykämien** (52 mg/dl heute Nacht, 3 in 5 Tagen); gescannter Bericht des Diabetologen | Notizen, Vitalwerte, `fichiers/` |
| Herr Heinz Müller, Zi. 11 (geb. 09.05.1934) und Zi. 21 (geb. 01.12.1947) | **Namensvettern**. Der Brief „Herr Müller“ lässt sich nur über das **Geburtsdatum** dem richtigen Bewohner zuordnen: Der Müller in Zimmer 21 ist gegen Sulfonamide allergisch, der Brief verordnet Cotrimoxazol | KIM-Brief |
| Frau Elisabeth Fischer, Zi. 22 | Brief **ohne Widerspruch**: dient dazu, das Ausbleiben von Fehlalarmen zu prüfen | KIM-Brief |
| Frau Lotte Hoffmann, Zi. 23 | Dekubitus Stadium 1, Mangelernährung, Latexallergie | Notizen, FHIR |

## Relative Zeitstempel

Die Notizen und Vitalwerte werden als „vor N Minuten“ gespeichert (`now() - interval …`): Ein erneutes Laden aktualisiert die **letzten 12 Stunden**. Einige mehrere Tage alte Notizen dienen zum Testen des Filters.
Die im Text angezeigte Uhrzeit wird berechnet (z. B. „Sturz festgestellt um 04h41“): Sie entspricht immer dem Zeitstempel der Notiz (Zeitzone Europe/Berlin).

## Befehle

Voraussetzungen: `docker compose up -d` in `compose/`, dann `npm install` in `data/`.

```bash
cd data
```
```bash
npm run generer    # erzeugt data/sql/02_seed.sql und front/src/mock/residents.json neu
```
```bash
npm run postgres   # fiktive Pflegesoftware: Schema „soins“ + Daten (wiederholbar)
```
```bash
npm run fhir       # Krankenhausdatenbank: FHIR-Bundle + PUT in HAPI (idempotent)
```
```bash
npm run kim        # simuliertes KIM-Postfach: 5 PDF-Briefe in Mailpit (ohne Duplikate)
```
```bash
npm run lettres    # erzeugt die PDFs der Briefe neu (data/lettres/)
```
```bash
npm run scan       # erzeugt den gescannten Bericht neu (data/fichiers/)
```

`npm run epa` lädt die eML und die Diagnosen der Bewohner in die ePA-Mocks von gematik (siehe README im Stammverzeichnis).
`npm run qdrant` erstellt die 3 Collections des RAG (patients, connaissances, a_verifier; 768 Dimensionen, Cosine): wiederholbar, ohne Löschen.

`npm run tout` führt generer, postgres, fhir, kim und epa nacheinander aus.

## Inhalt

| Ordner | Inhalt |
|---|---|
| `sql/` | `01_schema.sql` (Schema `soins`), `02_seed.sql` (erzeugt) |
| `fhir/` | `bundle.json` (erzeugt: Patient, Condition, AllergyIntolerance, MedicationStatement, Observation) |
| `lettres/` | 4 PDF-Briefe (Text) + 1 gescannter Brief (Bild), auf Deutsch |
| `fichiers/` | 5 Protokolle (`.md`) + 1 gescannter Bericht (`.pdf`, Bild) |
| `scripts/` | Generatoren und Lader (Node, ohne native Abhängigkeit) |

Die Scans werden mit einer Systemschrift gezeichnet (Arial unter Windows, DejaVu unter Linux). Der Text der „gescannten“ PDFs ist nicht auswählbar: Zum Lesen ist eine OCR nötig.
