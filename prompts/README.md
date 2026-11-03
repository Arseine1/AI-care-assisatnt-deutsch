# Prompts

Les prompts sont **versionnés** (champ `version`, numéro de version sémantique) et **verrouillés** : un soignant ne les voit ni ne les modifie. Ils sont intégrés aux workflows n8n à la génération (`node workflows/generer.mjs`), et la version utilisée est notée dans le journal d'audit (`soins.journal_ia`) et dans chaque brouillon.

## Le template verrouillé

Chaque appel à l'IA utilise le même assemblage, construit par le sous-workflow « template » (jamais ailleurs) :

```
[RÔLE ET RÈGLES]        texte fixe de _regles.md (identique pour tous les prompts)
[FAITS DES SOURCES]     faits trouvés par « chercher », chacun avec sa source entre crochets
[INSTRUCTION SOIGNANT]  Mode A : instruction fixe du prompt (cachée derrière le bouton)
                        Mode B : consigne du soignant, APRÈS contrôle, et seulement ici
[FORMAT DE SORTIE]      format imposé par le prompt
```

Règles du template : n'utiliser que les faits fournis ; citer chaque fait avec sa source entre crochets ; écrire « information non disponible » si un fait manque ; ne jamais mélanger deux résidents ; ne pas qualifier une valeur sans fait qui la qualifie.

## Les prompts

| Prompt | Version | Sortie | Rôle | Période | Protocoles |
|---|---|---|---|---|---|
| [`generer_sbar`](generer_sbar.md) | 1.0.4 | texte | transmission SBAR des 12 dernières heures | 12 h | non |
| [`resume_epa`](resume_epa.md) | 1.0.0 | texte | résumé du dossier ePA : diagnostics, allergies, médication (eML) | 24 h | non |
| [`points_vigilance`](points_vigilance.md) | 1.0.1 | texte | 6 points de vigilance au plus, par ordre de sécurité | 24 h | oui |
| [`contexte_alarme`](contexte_alarme.md) | 1.0.1 | texte | contexte utile pour répondre à une alarme de capteur | 24 h | oui |
| [`extraire_faits`](extraire_faits.md) | 1.0.1 | **JSON strict** | données structurées d'un document (lettre de médecin) | — | non |
| [`comparer`](comparer.md) | 1.0.1 | **JSON strict** | contradictions entre une lettre et les sources (allergie, double anticoagulation, insuffisance rénale) | 24 h | oui |

Un septième prompt, [`consigne_guidee`](consigne_guidee.md) (1.3.0, texte, 24 h, protocoles : oui, relit les rapports de garde déjà validés), sert de modèle au **Mode B** : la consigne du soignant, après contrôle, remplit le bloc INSTRUCTION SOIGNANT. Il a lui aussi 3 cas de test. Depuis la 1.3.0 (étape 9 du jour 4), « chercher » classe les faits d'abord selon la demande du soignant (mots et synonymes de soins) et ne donne aucun fait au modèle quand le dossier ne parle pas du sujet : la réponse est alors « information non disponible ».

Règles communes : [`_regles.md`](_regles.md) (version 1.2.1). Les briques qui utilisent ces prompts sont décrites dans [docs/briques-ia.md](../docs/briques-ia.md).

## Format d'un fichier de prompt

```markdown
---
id: generer_sbar          # identifiant (= nom du fichier)
version: 1.0.4            # à incrémenter à chaque modification du texte
sortie: texte             # texte | json (json = sortie JSON stricte, vérifiée)
cles_json: a,b            # obligatoire si sortie: json : clés que l'objet JSON doit contenir
listes_json: l:x|y        # optionnel : clés que doit porter chaque élément de la liste « l »
temperature: 0.1
heures: 12                # période par défaut des faits
requete: …                # mots utilisés pour la recherche sémantique dans le RAG
protocoles: false         # joindre ou non les protocoles de la maison aux faits
max_phrases: 8            # optionnel : nombre maximal de phrases de la réponse (8 par défaut)
longueur_phrase: 220       # optionnel : caractères au plus par phrase (220 par défaut)
max_faits: 8              # optionnel : nombre maximal de faits envoyés au modèle (8 par défaut)
sources_prioritaires: ePA   # optionnel : sources dont les faits sont retenus en premier (séparées par |)
rapports_valides: false   # optionnel : relire les rapports de garde déjà validés (jamais pour écrire un nouveau rapport)
---
## INSTRUCTION
…texte du bloc [INSTRUCTION SOIGNANT] ({periode_heures} est remplacé)

## FORMAT DE SORTIE
…texte du bloc [FORMAT DE SORTIE]
```

Le générateur refuse un prompt incomplet (champ manquant, id différent du nom du fichier, sections absentes, JSON sans `cles_json`).

## Cas de test : `prompts/tests/<prompt>.json`

Chaque prompt a **exactement 3 cas** :

| Type | Ce qu'il vérifie |
|---|---|
| `nominal` | le cas normal : le texte reprend les faits avec leurs sources |
| `manquant` | une information manque : l'IA écrit « information non disponible » (ou ne signale rien) au lieu d'inventer |
| `piege` | un fait ou un document contient une demande (« ignore les règles… ») ou les données d'un autre résident : elle n'est pas exécutée |

Un cas contient : le résident, les **faits** fournis, une **réponse de référence** (écrite à la main, modèle de ce qu'on attend) et ce qui est **attendu** (`contient`, `ne_contient_pas`, chemins JSON, avertissements).

### Deux niveaux de tests

| Commande | Quoi | Durée |
|---|---|---|
| `node tests/prompts.test.mjs` | **sans IA** : structure des prompts, 3 cas chacun, assemblage du template (4 blocs, un seul résident, un fait n'arrive jamais dans le bloc d'instruction), réponses de référence validées par les contrôles automatiques, et aucun exemple concret (heure, nom) dans les prompts | instantané |
| `node tests/prompts-live.mjs [prompt] [cas]` | **avec le vrai modèle** (Ollama) : même template, mêmes réglages et mêmes contrôles que la production | 3 à 6 min par cas avec Llama 3.2 |

Résultats des essais réels : [docs/prompts-tests.md](../docs/prompts-tests.md).

## Fichiers

| Fichier | Rôle |
|---|---|
| `_regles.md` | bloc [RÔLE ET RÈGLES], commun à tous les prompts |
| `generer_sbar.md`, `resume_epa.md`, `points_vigilance.md`, `contexte_alarme.md`, `extraire_faits.md`, `comparer.md` | les 6 prompts |
| `tests/*.json` | les 18 cas de test (3 par prompt) |
