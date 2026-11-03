# Architecture

Tout tourne en local sur un poste (Docker). Les données sont fictives. Ollama (le modèle de langage) est installé sur le poste, hors Docker.

## Vue d'ensemble

```mermaid
flowchart LR
  subgraph Soignant
    UI["Interface React<br/>3 pages : Rapport de garde, Alarmes, Documents<br/>connexion identifiant + PIN"]
  end

  subgraph n8n["n8n : tous les traitements"]
    SEC["Sécurité : clé + session<br/>AVANT tout traitement"]
    CTRL["Contrôle de la consigne (Mode B)<br/>règles de code, sans IA"]
    CH["chercher<br/>faits d'UN résident, classés par pertinence"]
    TPL["template verrouillé<br/>4 blocs"]
    RED["rédiger<br/>(seul appel au modèle)"]
    FIL["filtre anti-invention<br/>retire toute phrase sans source"]
    ENR["enregistrer / valider<br/>signature = session"]
    ALM["alarmes MQTT<br/>faits codés d'abord, contexte IA ensuite"]
    DOC["courriers : OCR, identification<br/>nom + date de naissance, règles"]
  end

  subgraph Sources["Sources d'intelligence"]
    PG[("PostgreSQL<br/>logiciel de soins fictif<br/>brouillons, validations, journal d'audit")]
    QD[("Qdrant : RAG<br/>patients, connaissances, a_verifier")]
    FHIR["Base hôpital FHIR"]
    EPA["ePA gematik (mock)"]
    FIC["Fichiers : protocoles, scans"]
    KIM["Boîte KIM simulée<br/>Mailpit"]
  end

  OL["Ollama (poste)<br/>llama3.2 + nomic-embed-text"]
  MQ["Mosquitto<br/>broker fermé"]
  TTN["The Things Network<br/>capteurs LoRaWAN"]

  UI -- "Bearer + clé" --> SEC
  SEC --> CTRL --> CH --> TPL --> RED --> FIL --> ENR
  SEC --> CH
  CH --> PG
  CH --> QD
  RED --> OL
  CH -. "embedding" .-> OL
  ENR --> PG
  ENR -- "rapport validé" --> QD
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

Les cinq connecteurs (logiciel de soins, FHIR, ePA, fichiers, KIM) alimentent le RAG quatre fois par jour (00:00, 06:00, 12:00, 18:00, heure de Berlin) par un sous-workflow commun (« Indexeur ») avec anti-doublon par empreinte. Le logiciel de soins est en plus lu **en direct** à chaque demande, car le RAG peut avoir six heures de retard.

## Le chemin d'une demande (Mode B)

```mermaid
sequenceDiagram
  participant S as Soignant
  participant N as n8n
  participant B as Base + RAG
  participant L as Llama (Ollama)
  S->>N: consigne + chambre + jeton de session
  N->>N: session valide ? sinon refus, rien d'autre ne s'exécute
  N->>N: contrôle de la consigne (300 caractères, règles, autre résident, données personnelles)
  alt consigne refusée
    N-->>S: refus + motif (aucune IA, journal : motif, longueur, empreinte)
  else consigne acceptée
    N->>B: faits d'UN résident (classés selon la demande)
    alt aucun fait ne parle du sujet
      N-->>S: « information non disponible » (Llama non sollicité pour affirmer quoi que ce soit)
    else
      N->>L: template verrouillé : règles, faits, consigne, format
      L-->>N: phrases JSON (une phrase = un fait)
      N->>N: filtre : retire toute phrase dont chiffre, dose, heure, médicament, jugement ou négation n'est pas dans SON fait
      N-->>S: texte assemblé par le code, source entre crochets
    end
  end
  S->>N: Valider & Enregistrer (texte relu)
  N->>B: validation signée par le compte connecté + journal d'audit
```

## Ce qui garantit quoi

| Garantie | Où elle est tenue | Test |
|---|---|---|
| Le texte libre d'un soignant n'atteint l'IA que par le contrôle, puis le bloc INSTRUCTION SOIGNANT | graphe des workflows | `tests/chemins-ia.test.mjs` |
| Un seul appel à l'IA générative dans tout le dépôt | « rédiger » | `tests/briques.test.mjs` |
| Aucune phrase sans source dans un texte assemblé | filtre « Contrôler la réponse » | `tests/anti-invention.test.mjs` |
| Aucun accès sans session ; signature prise dans la session | nœuds « Session » de chaque entrée | `tests/securite.test.mjs`, `tests/securite-live.mjs` |
| Les règles de contradiction passent avant toute IA | « Règles seules » | `tests/taches.test.mjs`, `tests/regles.test.mjs` |
| Une alarme est enregistrée avant toute étape d'IA | workflow 81 | `tests/alarmes.test.mjs` |
| Deux résidents ne se mélangent pas (homonymes Müller) | identification par nom ET date de naissance | `tests/batterie.mjs` |
| Un rapport validé n'est pas relu comme un fait | « chercher » | `tests/apres-validation.test.mjs` |

## Les services

| Service | Rôle | Port (poste) |
|---|---|---|
| n8n | tous les workflows | 5679 |
| PostgreSQL | logiciel de soins fictif (`soins`), brouillons, validations, sessions, journal | — |
| Qdrant | RAG (768 dimensions, Cosine) | 6335 |
| Mosquitto | alarmes de capteurs (comptes `capteurs` et `n8n`) | 1884 |
| Mailpit | boîte KIM simulée, transmission à l'équipe suivante | 8025 |
| OCR (OCRmyPDF) | lettres scannées | — |
| HAPI FHIR, mocks ePA | base de l'hôpital, ePA (démarrage à la demande, gourmands en mémoire) | 8090, 8082–8085 |
| Ollama (poste) | `llama3.2`, `nomic-embed-text` | 11434 |

Détails : [schéma du RAG](schema-rag.md), [briques IA](briques-ia.md), [interface et contrat n8n](interface-n8n.md), [alarmes](alarmes.md), [documents](documents.md), [sécurité](securite.md).
