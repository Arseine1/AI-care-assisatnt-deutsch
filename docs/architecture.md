# Architektur

Alles läuft lokal auf einem Rechner (Docker). Die Daten sind fiktiv. Ollama (das Sprachmodell) ist auf dem Rechner installiert, außerhalb von Docker.

## Überblick

```mermaid
flowchart LR
  subgraph Soignant["Pflegekraft"]
    UI["React-Oberfläche<br/>3 Seiten: Dienstbericht, Alarme, Dokumente<br/>Anmeldung Kennung + PIN"]
  end

  subgraph n8n["n8n: alle Verarbeitungen"]
    SEC["Sicherheit: Schlüssel + Sitzung<br/>VOR jeder Verarbeitung"]
    CTRL["Prüfung der Anweisung (Modus B)<br/>Coderegeln, ohne KI"]
    CH["Suchen<br/>Fakten EINER Person, nach Relevanz geordnet"]
    TPL["Gesperrte Vorlage<br/>4 Blöcke"]
    RED["Verfassen<br/>(einziger Aufruf des Modells)"]
    FIL["Anti-Erfindungs-Filter<br/>entfernt jeden Satz ohne Quelle"]
    ENR["Speichern / Bestätigen<br/>Signatur = Sitzung"]
    ALM["MQTT-Alarme<br/>zuerst codierte Fakten, dann KI-Kontext"]
    DOC["Briefe: OCR, Identifizierung<br/>Name + Geburtsdatum, Regeln"]
  end

  subgraph Sources["Intelligenzquellen"]
    PG[("PostgreSQL<br/>fiktive Pflegesoftware<br/>Entwürfe, Validierungen, Audit-Journal")]
    QD[("Qdrant: RAG<br/>patients, connaissances, a_verifier")]
    FHIR["Krankenhausdatenbank FHIR"]
    EPA["ePA gematik (Mock)"]
    FIC["Dateien: Protokolle, Scans"]
    KIM["Simuliertes KIM-Postfach<br/>Mailpit"]
  end

  OL["Ollama (Rechner)<br/>llama3.2 + nomic-embed-text"]
  MQ["Mosquitto<br/>geschlossener Broker"]
  TTN["The Things Network<br/>LoRaWAN-Sensoren"]

  UI -- "Bearer + Schlüssel" --> SEC
  SEC --> CTRL --> CH --> TPL --> RED --> FIL --> ENR
  SEC --> CH
  CH --> PG
  CH --> QD
  RED --> OL
  CH -. "Embedding" .-> OL
  ENR --> PG
  ENR -- "validierter Bericht" --> QD
  TTN -- "MQTT TLS" --> ALM
  MQ --> ALM
  ALM --> PG
  KIM --> DOC
  DOC --> QD
  DOC --> PG
  FHIR --> QD
  EPA --> QD
  FIC --> QD
  PG --> QD
```

Die fünf Konnektoren (Pflegesoftware, FHIR, ePA, Dateien, KIM) speisen das RAG viermal täglich (00:00, 06:00, 12:00, 18:00, Berliner Zeit) über einen gemeinsamen Unter-Workflow (« Indexierer ») mit Duplikatsperre per Fingerabdruck. Die Pflegesoftware wird zusätzlich bei jeder Anfrage **live** gelesen, da das RAG sechs Stunden Verspätung haben kann.

## Der Weg einer Anfrage (Modus B)

```mermaid
sequenceDiagram
  participant S as Pflegekraft
  participant N as n8n
  participant B as Datenbank + RAG
  participant L as Llama (Ollama)
  S->>N: Anweisung + Zimmer + Sitzungstoken
  N->>N: Sitzung gültig? sonst Ablehnung, nichts anderes wird ausgeführt
  N->>N: Prüfung der Anweisung (300 Zeichen, Regeln, andere Person, personenbezogene Daten)
  alt Anweisung abgelehnt
    N-->>S: Ablehnung + Grund (keine KI, Journal: Grund, Länge, Fingerabdruck)
  else Anweisung akzeptiert
    N->>B: Fakten EINER Person (nach der Anfrage geordnet)
    alt kein Fakt behandelt das Thema
      N-->>S: « Information nicht verfügbar » (Llama wird nicht bemüht, um irgendetwas zu behaupten)
    else
      N->>L: gesperrtes Template: Regeln, Fakten, Anweisung, Format
      L-->>N: JSON-Sätze (ein Satz = ein Fakt)
      N->>N: Filter: entfernt jeden Satz, dessen Zahl, Dosis, Uhrzeit, Medikament, Urteil oder Verneinung nicht in SEINEM Fakt steht
      N-->>S: vom Code zusammengesetzter Text, Quelle in eckigen Klammern
    end
  end
  S->>N: Bestätigen & Speichern (gegengelesener Text)
  N->>B: von dem angemeldeten Konto signierte Validierung + Audit-Journal
```

## Was was garantiert

| Garantie | Wo sie eingehalten wird | Test |
|---|---|---|
| Der freie Text einer Pflegekraft erreicht die KI nur über die Prüfung, dann über den Block ANWEISUNG PFLEGEKRAFT | Graph der Workflows | `tests/chemins-ia.test.mjs` |
| Nur ein Aufruf der generativen KI im gesamten Repository | « Verfassen » | `tests/briques.test.mjs` |
| Kein Satz ohne Quelle in einem zusammengesetzten Text | Filter « Antwort prüfen » | `tests/anti-invention.test.mjs` |
| Kein Zugriff ohne Sitzung; Signatur wird der Sitzung entnommen | Knoten « Sitzung » jedes Eingangs | `tests/securite.test.mjs`, `tests/securite-live.mjs` |
| Die Widerspruchsregeln laufen vor jeder KI | « Nur Regeln » | `tests/taches.test.mjs`, `tests/regles.test.mjs` |
| Ein Alarm wird vor jedem KI-Schritt gespeichert | Workflow 81 | `tests/alarmes.test.mjs` |
| Zwei Bewohner werden nicht vermischt (Namensvettern Müller) | Identifizierung nach Name UND Geburtsdatum | `tests/batterie.mjs` |
| Ein validierter Bericht wird nicht als Fakt erneut gelesen | « Suchen » | `tests/apres-validation.test.mjs` |

## Die Dienste

| Dienst | Aufgabe | Port (Rechner) |
|---|---|---|
| n8n | alle Workflows | 5679 |
| PostgreSQL | fiktive Pflegesoftware (`soins`), Entwürfe, Validierungen, Sitzungen, Journal | — |
| Qdrant | RAG (768 Dimensionen, Cosine) | 6335 |
| Mosquitto | Sensoralarme (Konten `capteurs` und `n8n`) | 1884 |
| Mailpit | simuliertes KIM-Postfach, Übermittlung an das nächste Team | 8025 |
| OCR (OCRmyPDF) | gescannte Briefe | — |
| HAPI FHIR, ePA-Mocks | Krankenhausdatenbank, ePA (Start auf Abruf, speicherhungrig) | 8090, 8082–8085 |
| Ollama (Rechner) | `llama3.2`, `nomic-embed-text` | 11434 |

Details: [Schema des RAG](schema-rag.md), [KI-Bausteine](briques-ia.md), [Oberfläche und n8n-Vertrag](interface-n8n.md), [Alarme](alarmes.md), [Dokumente](documents.md), [Sicherheit](securite.md).
