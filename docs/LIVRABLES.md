# Livrables : demandé / où / conforme ?

Vérifié le 27.10.2026. Le test `node tests/livrables.test.mjs` contrôle automatiquement les points marqués « test ».

## 1. docker-compose.yml

| Demandé | Où dans le dépôt | Conforme ? |
|---|---|---|
| n8n | `compose/docker-compose.yml`, service `n8n` (port 5679) | Oui (test) |
| Qdrant | service `qdrant` (port 6335) | Oui (test) |
| Mosquitto | service `mosquitto` (port 1884), comptes et droits dans `compose/mosquitto/` | Oui (test) |
| Ollama | service `ollama`, **profil `ollama`** : `docker compose --profile ollama up -d` | **Oui, avec une réserve** : par défaut le projet réutilise l'Ollama installé sur le poste (une seule copie des modèles, 8 Go de mémoire). Le conteneur est prêt mais ne démarre pas avec un simple `docker compose up -d`. Il n'a pas été essayé de bout en bout sur ce poste (mémoire). |
| autres services | `postgres`, `mailpit` (boîte KIM simulée), `ocr`, `hapi-fhir` | Oui |

Le fichier se valide avec `docker compose config -q` (avec et sans `--profile ollama`).

## 2. Trois workflows n8n (JSON dans `workflows/`)

Les workflows sont **générés** (`node workflows/generer.mjs`) à partir de `workflows/code/*.js`, puis exportés en JSON versionné. Chaque « workflow demandé » est un ensemble de fichiers qui partagent des briques communes.

| Demandé | Fichiers | Conforme ? |
|---|---|---|
| **Rapport de garde et transmission (SBAR)** | `67-brique-rapport-garde` (un résident), `68-brique-etage-complet` et `74-maitre-etage` (un étage), `76-etage-automatique` (5 h 30), `66-brique-apres-validation` (ajout au RAG + transmission à l'équipe suivante), entrées `70`, `72`, `73` | Oui |
| **Alarmes de capteurs** | `81-alarme-capteur` (MQTT + pont TTN), `82-maitre-alarmes` (liste, acquittement) | Oui. Depuis le 27.10 : l'alarme est aussi **indexée dans Qdrant** (voir 3). |
| **Import des documents** | `00-indexeur` (commun), `10` logiciel de soins, `20` FHIR, `30` fichiers (OCR), `40` ePA, `50` KIM, `83` + `85` + `86` courrier en automatique | Oui |
| Recherche RAG | `60-brique-chercher` : recherche vectorielle Qdrant + lecture directe du logiciel de soins | Oui |
| Filtre par chambre / résident | la chambre est traduite en `patient_id` (`Résident de la chambre`) ; les recherches `Qdrant période` et `Qdrant fond` sont **toujours filtrées par `patient_id`** | Oui (test). Les protocoles (collection `connaissances`) n'ont volontairement pas de filtre résident. |
| Température 0,0 à 0,2 | une seule brique appelle Llama pour rédiger (`62-brique-rediger`) : température du prompt, **0,1 pour les 8 prompts** ; `test-llama3.json` (essai de connexion) fixé à 0,1 depuis le 27.10 | Oui (test). Avant le 27.10, `test-llama3.json` n'indiquait pas de température (valeur par défaut d'Ollama, 0,8) : corrigé. |

## 3. Démonstration : alarme IoT puis mise à jour de l'index Qdrant

| Demandé | Où | Conforme ? |
|---|---|---|
| Une alarme IoT | `node scripts/demo-nuit.mjs` (scène 2 : message MQTT `capteurs/chambre12/chute`) ; ou une vraie simulation d'uplink depuis TTN | Oui |
| Puis la mise à jour de l'index du RAG dans Qdrant | workflow 81 : `Créer l'alarme` → `Document RAG (alarme)` → `Indexer (alarme)` (sous-workflow `00-indexeur`) ; la démo vérifie que le point apparaît dans la collection `patients` (source « Capteurs », type `alarme`, résident de la chambre) | **Oui depuis le 27.10, confirmé en réel** (workflow 81 réimporté, démo rapide du 27.10 à 09 h 36 : alarme visible en 1,4 s, point ajouté à Qdrant 5 s plus tard, collection `patients` passée de 93 à 94 points, source « Capteurs », résident PAT-003). Avant, l'alarme n'était **pas** ajoutée à Qdrant (seulement à PostgreSQL) : la deuxième moitié de la démonstration n'existait pas. |

Ce que l'indexation de l'alarme n'est pas : un nouvel appel à Llama. C'est un embedding (`nomic-embed-text`), et une erreur d'indexation n'arrête ni l'alarme ni son contexte.
