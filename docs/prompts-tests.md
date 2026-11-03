# Essais des 6 prompts avec le vrai modèle

Résultats de `node tests/prompts-live.mjs` : cas **nominal** de chaque prompt, texte généré par Ollama avec les mêmes réglages que la production (température 0,1, graine fixe, pénalité de répétition) et vérifié par les mêmes contrôles automatiques. Poste d'essai : 8 Go de RAM, processeur seul (sans carte graphique). Données entièrement fictives.

Un cas est « réussi » si le texte contient ce qu'il doit, ne contient pas ce qu'il ne doit pas, et respecte les chemins JSON attendus. **Réussi ne veut pas dire fiable** : la colonne « Avertissements » montre ce que les contrôles ont signalé.

## Llama 3.2 (3 milliards de paramètres) : modèle par défaut sur ce poste

| Prompt | 1er essai | Après affinage des prompts | Durée | Avertissements des contrôles (2e essai) |
|---|---|---|---|---|
| `extraire_faits` | échec : action « poursuite » au lieu de « debut », 2 médicaments rangés en recommandations | **échec** : champ `duree` omis, prénom perdu | 125 → 159 s | aucun (clé `duree` manquante non vue : outil de test corrigé depuis, et signalée maintenant) |
| `comparer` | échec : `aucune_contradiction: true` avec une contradiction dans la liste, clé `gravité` accentuée | **réussi** (détails approximatifs : `element_source` imprécis) | 67 → 86 s | aucun |
| `resume_epa` | réussi | **réussi** | 72 → 74 s | sources écrites hors format (`[CIM-10 …]`) |
| `points_vigilance` | échec : introduction ajoutée, sources fausses, termes inventés | **réussi** | 100 → 89 s | `source_inconnue`, `terme_non_source` |
| `contexte_alarme` | échec : « information non disponible » sous Alarme alors que l'alarme existe | **réussi** | 62 → 73 s | `copie_des_faits`, `valeur_non_sourcee`, `phrase_sans_source`, `terme_non_source` |
| `generer_sbar` | (voir `docs/briques-ia.md`) | **réussi** | 96 → 133 s | 9 avertissements : sources inconnues, jugement ajouté (« élevée »), chiffre hors source citée, phrases sans source |

À retenir : 5 cas sur 6 passent les vérifications de base après affinage, mais **le texte reste souvent imparfait** (jugements ajoutés, sources mal écrites, phrases sans source) : les contrôles le signalent, ils ne le corrigent pas.

## Llama 3 (8 milliards de paramètres) : essai sur les deux prompts JSON

| Prompt | Verdict | Durée | Remarque |
|---|---|---|---|
| `extraire_faits` | **réussi** | 309 s | meilleur que Llama 3.2 : durée « 7 Tage » extraite |
| `comparer` | **échec grave** | 599 s | répond `{"contradictions": [], "aucune_contradiction": true}` : **rate l'allergie à la pénicilline** malgré l'amoxicilline prescrite |

Le cas de `comparer` est un **faux négatif** : aucun contrôle ne peut le détecter (la réponse est valide et cohérente). C'est le risque le plus sérieux de tout le dispositif : une fausse rassurance.

## Conclusion et conséquences

1. **Un modèle de langage ne doit pas être la seule garde contre les contradictions graves** (allergie, double anticoagulation, anti-inflammatoire en insuffisance rénale). Le plus gros modèle l'a ratée, le plus petit l'a vue : le résultat n'est pas prévisible.
2. **Filet de sécurité déterministe, indépendant du modèle** : les familles de médicaments du prompt `comparer` (pénicillines, sulfamides, anticoagulants, AINS) sont une liste fermée ; elles peuvent être appliquées par un simple code de règles sur les faits et la lettre extraite. Il se combine avec le modèle (union des alertes) : à construire avec le bouton « Vérifier le document » (jour 3, étape 3).
3. **Les contrôles automatiques et la relecture du soignant restent obligatoires** ; le bouton [Valider & Enregistrer] n'est jamais automatique.
4. **Matériel** : sur ce poste, Llama 3 (8 Md) lit un prompt de 1 500 tokens en plusieurs minutes (599 s pour un JSON de 17 tokens). Un poste avec carte graphique ou 16 Go de RAM ou plus est nécessaire pour un usage réel, avec le plus gros modèle disponible.

## Refaire ces essais

```bash
node tests/prompts-live.mjs comparer 1          # un cas
node tests/prompts-live.mjs                     # les 18 cas (très long)
$env:AICARE_MODELE = 'llama3'; node tests/prompts-live.mjs extraire_faits 1   # autre modèle (PowerShell)
```

Les 18 cas se composent de 6 prompts × (nominal, information manquante, piège). Seuls les cas nominaux ont été essayés avec le vrai modèle ; les 18 réponses de référence sont vérifiées sans IA par `node tests/prompts.test.mjs` (58 tests).
