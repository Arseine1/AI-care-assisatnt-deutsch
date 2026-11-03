# Installer AI-Care Assistant sur un autre poste

Ce guide permet à une personne qui n'a pas participé au développement d'installer le projet et de rejouer les tests. Les données sont **entièrement fictives** ; aucun accès externe n'est nécessaire sauf pour télécharger les images Docker, les modèles Ollama et les mocks ePA de gematik.

## 1. Ce qu'il faut avant de commencer

| Élément | Minimum | Remarque |
|---|---|---|
| Mémoire | 8 Go (12 à 16 Go conseillés) | La mesure de référence (25/30, démonstration 13/13) a été faite sur 16 Go. Sur 8 Go, tout fonctionne mais plus lentement, et Docker peut arrêter des services. |
| Disque libre | 25 Go (estimation) | Images Docker, modèles Ollama (2,3 Go, 7 Go avec le modèle de l'agent), données. |
| Processeur | sans carte graphique accepté | Sans carte graphique, un texte du Mode B prend 2 à 5 minutes. C'est normal. |
| Node.js | 20 ou plus (LTS) | https://nodejs.org |
| Docker | Docker Desktop (Windows, Mac) ou Docker Engine + compose (Linux) | Doit être démarré avant l'installation. |
| Git | n'importe quelle version | Pour cloner le dépôt, et les mocks ePA. |
| Ollama | version récente | https://ollama.com/download — installé **sur le poste**, pas dans Docker. |
| Ports libres | 5679, 6335, 1884, 8025, 1025, 8090, 8009, 8084, 8085, 8082, 11434, 5173 | Un autre programme sur un de ces ports bloque le démarrage. |

**Windows, 16 Go ou moins** : limiter la mémoire de Docker (WSL) pour qu'il reste de la place à Ollama. Créer `C:\Users\<nom>\.wslconfig` :

```ini
[wsl2]
memory=8GB
```

Puis, dans un terminal : `wsl --shutdown`, et redémarrer Docker Desktop. Ne pas dépasser 60 % de la mémoire du poste.

**Linux** : lancer Ollama avec `OLLAMA_HOST=0.0.0.0` pour que les conteneurs l'atteignent (`host.docker.internal`).

## 2. Installation en une commande

```bash
git clone https://github.com/Arseine1/IA-care-assistant
```
```bash
cd IA-care-assistant
```
```bash
node scripts/installer.mjs --modeles
```

`--modeles` autorise le téléchargement des modèles Ollama manquants : `llama3.2` (2,0 Go) et `nomic-embed-text` (0,3 Go), depuis le registre officiel d'Ollama. Sans cette option, le script s'arrête à l'étape 4 en listant ce qui manque. Ajouter `--pilote` pour télécharger aussi `qwen2.5:7b` (4,7 Go), le modèle qui pilote l'agent de la page Cotisations retraite.

Durée : **30 à 45 minutes**, dont environ 15 minutes pour l'import des workflows n8n et 5 à 10 minutes pour les mocks ePA. Le script affiche l'avancement et ne montre jamais un mot de passe.

| Étape | Ce qui est fait |
|---|---|
| 1 | Contrôle de Node, Docker, mémoire |
| 2 | Création de `.env` et de **tous** les secrets au hasard (mot de passe PostgreSQL, clé de n8n, clés d'accès, PIN des comptes) |
| 3 | Démarrage des services Docker et des mocks ePA ; attente qu'ils répondent |
| 4 | Contrôle (et téléchargement avec `--modeles`) des modèles Ollama |
| 5 | Chargement des données fictives (PostgreSQL, FHIR, boîte KIM, ePA) et création des collections Qdrant |
| 6 | Import et publication des workflows n8n (n8n redémarre) |
| 7 | Création des comptes des soignants, installation de l'interface, `VITE_MOCK=false` |
| 8 | Première indexation du RAG |

Le script est **rejouable** : si une étape échoue, corriger la cause puis relancer avec `--depuis=<numéro>`. Options utiles : `--sans-epa` (sans les mocks ePA, 1,5 Go de mémoire de moins ; la source « ePA » de `test-du-soir` échouera alors), `--jusqua=<numéro>`.

À la fin, le script lance lui-même la vérification de la section 4.

## 3. Ouvrir l'interface

```bash
cd front
```
```bash
npm run dev
```

Ouvrir http://localhost:5173. Comptes : `martin`, `keller`, `roth`, `arsene`. Les **PIN** sont dans le fichier `.env` (lignes `DEMO_PIN_*`) ; ils sont tirés au hasard à l'installation et sont donc différents sur chaque poste. Pour créer un autre compte : `node scripts/creer-compte.mjs`.

## 4. Vérifier que tout fonctionne

À tout moment, sans rien modifier :

```bash
node scripts/installer.mjs --verifier
```

Il contrôle les services, les modèles, les collections, les comptes, puis lance les 19 fichiers de tests sans IA (environ 15 secondes). Tout doit être « OK ». Ajouter `--demo` pour y joindre la démonstration rapide.

### Les tests, du plus court au plus long

| Commande | Durée (poste 16 Go sans carte graphique) | Ce que cela prouve |
|---|---|---|
| `node scripts/installer.mjs --verifier` | 15 s | Services au vert, 19 fichiers de tests sans IA : contrôle des consignes, filtre anti-invention, sécurité, règles des cotisations, tâches de fond |
| `node scripts/demo-nuit.mjs --rapide` | moins de 5 min | Une nuit fictive sans Llama : connexion, alarme de chute (capteur MQTT), lettre de médecin (OCR), consigne malveillante refusée, validation signée |
| `node scripts/demo-nuit.mjs` | environ 7 min (6,4 mesuré) | La même, avec Llama (rapport de garde, question libre). 13 contrôles ; dernier résultat dans `docs/demo-derniere.md` |
| `node tests/batterie.mjs` | quelques minutes (non chronométré) | Partie rapide de la batterie : consignes malveillantes déguisées, homonymes, panne |
| `node tests/batterie.mjs --reel` | **environ 75 min** | 30 questions avec Llama. Reprenable avec `--reprendre`. Résultat dans `tests/resultats/batterie-derniere.md` |
| `node tests/sgb6-live.mjs` | non mesuré sur un autre poste | Cotisations retraite de bout en bout par n8n, 9 dossiers fictifs, sans IA de lecture |
| `node tests/sgb6-live.mjs --ia` | 20 à 40 min | Idem avec la lecture par l'IA |
| `node tests/sgb6-modeles.mjs --modeles=qwen2.5:7b` | plusieurs heures par modèle | Comparatif des modèles qui pilotent l'agent Cotisations |

**Résultats de référence mesurés sur le poste de développement** : batterie 25/30 (avec réponse 11/16, homonymes 4/4, sans réponse 10/10) ; démonstration 13/13. Sur un autre poste, les temps varient, et les 5 échecs connus (Q01, Q12, Q13, Q15, Q16) viennent du petit modèle `llama3.2` qui recopie mal : voir [batterie.md](batterie.md) et [RAPPORT.md](RAPPORT.md). **Un résultat un peu différent (24 ou 26 sur 30) est normal** : le modèle n'est pas parfaitement reproductible. Un résultat très inférieur (moins de 20) signale un problème d'installation ou de mémoire.

Avant une démonstration, recharger les horodatages (les « 12 dernières heures » vieillissent) : `cd data` puis `npm run postgres`.

## 5. Si quelque chose ne va pas

| Symptôme | Cause probable | Remède |
|---|---|---|
| `ARRÊT Docker ne répond pas` | Docker Desktop pas démarré | Le démarrer, attendre 1 minute, relancer |
| Port déjà utilisé | Autre programme | Libérer le port (liste en section 1) ou arrêter l'autre programme |
| « Impossible de joindre le serveur » dans l'interface alors que Docker tourne | Transfert de ports de Docker Desktop cassé (fréquent sous Windows) | Quitter Docker Desktop, `wsl --shutdown`, le relancer, attendre 2 minutes |
| Services Docker arrêtés au hasard, erreurs HTTP 500 | Manque de mémoire | Fermer d'autres programmes ; voir `.wslconfig` en section 1 ; `docker compose up -d` dans `compose/` |
| `git clone` des mocks ePA bloqué | Pare-feu ou stratégie du poste | Télécharger https://codeload.github.com/gematik/epa-deployment/zip/refs/heads/main, extraire dans `compose/epa-deployment/` (le fichier `dc-mocks.yml` doit s'y trouver), `--depuis=3` ; ou `--sans-epa` |
| `ollama pull` échoue | Commande absente du terminal | Lancer l'application Ollama, ou télécharger le modèle depuis son interface |
| Import des workflows interrompu | Mémoire, ou n8n pas prêt | Relancer `--depuis=6` : l'import est rejouable |
| Les textes de l'IA mettent plus de 5 minutes | Processeur chargé, modèle qui a quitté la mémoire | Normal sans carte graphique ; fermer les autres programmes |

## 6. Repartir de zéro

Efface la base, Qdrant, n8n et les comptes (jamais le code) :

```bash
cd compose
```
```bash
docker compose down -v
```

Puis supprimer `.env` si l'on veut aussi de nouveaux secrets, et relancer `node scripts/installer.mjs`.

## 7. Limites à connaître

- **Le script d'installation n'a pas été rejoué de bout en bout sur un poste vierge.** Ses étapes 1 et 2 ont été exécutées sur une copie propre du dépôt, et sa partie « vérification » sur la pile du poste de développement. Les étapes 3 à 8 reprennent les commandes de ce poste, mais le premier passage sur un autre PC peut révéler un détail : dans ce cas, noter le message d'arrêt et le numéro de l'étape.
- Les versions des images Docker (n8n 2.43.8, Qdrant 1.19.2, Mailpit 1.32.0, HAPI FHIR 8.12.0, PostgreSQL 16, Mosquitto 2) sont fixées pour qu'un autre poste obtienne la même pile. Les mocks ePA de gematik sont téléchargés dans leur dernière version : s'ils changent, l'étape 3 peut demander un ajustement.
- Les modèles Ollama ne sont pas fixés à une version précise : `llama3.2` téléchargé plus tard peut différer légèrement, d'où des résultats de batterie qui varient un peu.
- L'IA produit un brouillon que le soignant relit et valide ; le projet n'est pas un dispositif médical.
