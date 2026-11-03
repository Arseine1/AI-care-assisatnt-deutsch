# Vitesse : mesures avant / après (jour 4, étape 2)

Poste de test : 8 Go de RAM, sans carte graphique, Llama 3.2 (3 milliards de paramètres) via Ollama. Mesure : `node tests/bench-vitesse.mjs 2 12 <étiquette>` (rapport de garde de M. Weber, chambre 12, par le webhook n8n réel ; le premier essai trouve le modèle déchargé ou non, le second est « à chaud »). Les résultats bruts sont dans `tests/resultats/vitesse.jsonl`.

## Résultats

| Réglage | Essai | Total | Dont modèle | Jetons générés | Faits envoyés |
|---|---|---|---|---|---|
| **Avant** (jour 3 : jusqu'à 40 faits, 500 jetons max, modèle gardé 10 min) | 1 (à froid) | 139 s | 126 s | 202 | 11 |
| | 2 (à chaud) | 57 s | 50 s | 167 | 11 |
| 8 faits, 450 jetons max, modèle gardé 30 min | 1 | 167 s | 158 s | 194 | 8 |
| | 2 | 68 s | 57 s | 178 | 8 |
| + clés JSON courtes (`r`, `t`, `f`) | 1 | 107 s | 99 s | 248 | 8 |
| | 2 | 76 s | 71 s | 223 | 8 |
| **Final** : + 8 phrases de 220 caractères au plus (140 coupait des phrases en plein mot : « pour Diâ. »), modèle de recherche gardé 30 min | 1 | 82 s | 76 s | 222 | 8 |
| | 2 | 73 s | 68 s | 222 | 8 |

Une première mesure « avant » de 160 s (16 faits) a été gardée pour mémoire dans le fichier ; une autre, faussée par une mise en veille du poste (19 heures), a été retirée.

## Ce que montrent les mesures (franchement)

- **Le temps d'un rapport ne baisse pas de façon nette** : entre 57 s et 73 s à chaud, avec un écart de 15 s dû surtout au nombre de mots générés (167 à 248 jetons selon les essais). Les réglages n'ont pas changé l'ordre de grandeur.
- **Le temps est proportionnel aux jetons générés** : environ 3 jetons (morceaux de mots) par seconde sur ce poste. La longueur du prompt compte peu : passer de 11 à 8 faits n'a rien accéléré de mesurable. Réduire le prompt ne sert donc pas ; **limiter la longueur de la réponse** peut servir, mais un modèle de 3 milliards de paramètres obligé d'écrire quatre phrases au moins en produit autant qu'avant.
- **Le premier rapport après une pause coûte plus cher** (jusqu'à 80 à 100 s de plus à froid) : chargement du modèle en mémoire. `keep_alive` à 30 minutes l'évite tant que les rapports se suivent.
- **La mémoire est le vrai plafond** : après les essais, 0,75 Go libre sur 8 Go. Llama 3.2 occupe 2,4 Go et le modèle de recherche (`nomic-embed-text`) 0,4 Go.

## Réglages retenus

| Réglage | Valeur | Raison |
|---|---|---|
| `num_ctx` | 4096 | suffit pour 8 faits et les règles ; plus grand = plus de mémoire |
| `num_predict` (en jetons) | 450 (texte en phrases JSON) | borne la durée ; un JSON coupé est récupéré phrase par phrase |
| `keep_alive` | 30 minutes (génération et recherche) | pas de rechargement entre deux rapports d'un même étage |
| Faits par résident | 8 au plus, choisis par importance (alarme de capteur, incident, allergie, risques, médication, constantes, observations récentes…) | prompt plus court, moins de matière à confondre |
| Phrases | 8 au plus, 220 caractères au plus, clés JSON d'une lettre | borne la longueur de la réponse |
| `OLLAMA_MAX_LOADED_MODELS` | **non appliqué** | voir ci-dessous |

### Pourquoi `OLLAMA_MAX_LOADED_MODELS=1` n'est pas appliqué

Chaque rapport utilise **deux** modèles : `nomic-embed-text` (recherche dans le RAG) puis Llama 3.2 (rédaction). Mesuré : les deux tiennent ensemble en mémoire (2,4 + 0,4 Go). Avec une limite à 1, Ollama déchargerait l'un pour charger l'autre à **chaque** rapport, ce qui ajoute un chargement à chaque fois. La limite à 1 reste conseillée **si on utilise Llama 3 en 8 milliards de paramètres** sur ce poste (deux gros modèles ne tiennent pas) : `setx OLLAMA_MAX_LOADED_MODELS 1` puis redémarrer Ollama. Elle n'est pas modifiée sur ce poste.

## Le vrai gain : le rapport est prêt avant qu'on le demande

Le temps de génération d'un rapport ne peut pas devenir court sur ce poste. Ce qu'on peut supprimer, c'est **l'attente du soignant** : le workflow `76-etage-automatique` prépare chaque matin à **5h30** (heure de Berlin) les rapports de tous les étages, un résident après l'autre. À la relève, le soignant ouvre « Ouvrir le rapport automatique de 05h30 », relit, corrige, valide.

- Chaque étage est préparé une fois ; jamais deux fois en 3 heures (relance de n8n, déclenchement manuel).
- Le même sous-workflow (`68-brique-etage-complet`) sert au clic du soignant et au déclenchement de 5h30 : mêmes règles, même filtre anti-invention.
- **Essai réel** (déclenchement manuel du workflow, données fraîches) : étage 2 terminé en 9 minutes (4 rapports, 2 à 3 minutes chacun), étage 1 en 9 minutes de plus, soit 18 minutes pour 8 résidents, sans que personne attende. Les deux tâches sont ouvertes par l'interface via icare-tache {etage, recent: true}. Qualité : M. Weber, 4 phrases sourcées, 0 retirée ; Mme Schulz, 1 phrase gardée et 4 retirées ; M. Müller, 5 retirées ; M. Becker, 1 retirée (rubrique R vide : « information non disponible »). Le filtre fait son travail, mais Llama 3.2 reste peu complet : rapports courts, relecture indispensable.

## Estimations pour le poste de déploiement (non mesurées)

- 16 Go de RAM, sans carte graphique : plus de risque de mémoire saturée ; Llama 3 8B devient utilisable, sans doute 4 à 6 minutes par rapport (estimation).
- Avec une carte graphique d'au moins 8 Go de mémoire vidéo : de l'ordre de la dizaine de secondes (estimation).
- Le modèle se change par `AICARE_MODELE` (`node workflows/generer.mjs` puis réimport), rien d'autre à modifier.
