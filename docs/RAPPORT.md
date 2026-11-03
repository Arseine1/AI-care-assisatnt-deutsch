# Rapport de projet : AI-Care Assistant (jours 1 à 4)

Assistant IA pour les équipes soignantes d'une maison de soins en Allemagne, entièrement local (Docker), sur données **100 % fictives**. Ce rapport sépare ce qui est **mesuré** de ce qui est **estimé**, et dit ce qui ne marche pas. Les décisions détaillées, étape par étape, sont dans [DECISIONS.md](../DECISIONS.md) ; la conformité aux livrables demandés est dans [LIVRABLES.md](LIVRABLES.md).

**Mémoire du poste** : 8 Go jusqu'au 27.10 à midi, **16 Go ensuite** (Docker reçoit 10,7 Go depuis le fichier `.wslconfig`). L'essai de départ (17/30), la batterie complète (25/30) et les mesures de charge ont été faits sur 8 Go ; la dernière démonstration (§4) a été faite sur 16 Go. Les durées ne sont donc pas comparables d'un essai à l'autre.

**État de référence** : dépôt au commit `fc15577` (« Livrables étape 1 »), précédé de `ef62ed0` (étape 10), `5a4f7f6` (étape 9) et `f37e78e` (étape 8). Rien n'est poussé sur GitHub.

## 1. Principe

- **Pas de chat libre avec l'IA.** Mode A : des boutons envoient `{action, chambre}` ; le prompt reste caché. Mode B : le soignant choisit un résident, écrit une consigne courte ; n8n la contrôle, puis l'insère dans un template verrouillé.
- **Le soignant décide.** Toute réponse est modifiable, cite ses sources entre crochets et ne devient définitive qu'après [Valider & Enregistrer], signée du compte connecté.
- **Le code contrôle l'IA, pas l'inverse.** Le modèle ne rédige pas un texte libre : il renvoie des phrases JSON, chacune rattachée à un fait. Un filtre codé retire toute phrase dont un chiffre, une dose, une heure, un médicament, un jugement ou une négation n'est pas dans ce fait. Le texte est assemblé par le code.
- Schéma : [architecture.md](architecture.md).

## 2. Ce qui a été construit

| Jour | Contenu |
|---|---|
| **1** | Socle docker-compose, interface React (Mode A, Mode B, alertes, validation), couche `api.js` avec réponses simulées. |
| **2** | Données de test (8 résidents dont deux homonymes « Heinz Müller »), Qdrant (3 collections), 5 connecteurs n8n + indexeur commun, anti-doublon par empreinte, planification 4 fois par jour, boîte KIM simulée. |
| **3** | Briques `chercher` / `template` / `rédiger` / `enregistrer` / `journal`, 7 prompts versionnés, contrôle de la consigne, interface reliée à n8n, « Vérifier le document », rapport par étage, ajout au RAG et transmission. |
| **4** | Filtre anti-invention ; rapport d'étage automatique à 5 h 30 ; tâches de fond fiables ; alarmes MQTT (+ pont TTN) ; courriers en automatique ; interface en trois pages ; sécurité (PIN, sessions, broker fermé) ; batterie de tests ; corrections ; démonstration. |

## 3. Modèles utilisés pour chaque essai avec IA

| Essai | Modèle de rédaction | Embeddings |
|---|---|---|
| Premiers essais de rédaction (jour 3, étape 1) | `llama3` 8 milliards (1,8 jeton/s, 16 min un rapport, une limite de 15 min dépassée) puis **`llama3.2` 3 milliards** (4,4 jeton/s), choisi par accord | `nomic-embed-text` |
| Essais des prompts (`docs/prompts-tests.md`) | `llama3.2` (1/6 réussi au premier essai, 5/6 après affinage) et `llama3` (rate l'allergie à la pénicilline) | idem |
| Tous les essais du jour 4, la batterie, la démonstration | **`llama3.2`**, température 0,1, graine fixe | idem |

Aucun modèle plus grand n'a été essayé au jour 4 : la mémoire (8 Go, pas de carte graphique) ne le permet pas à une vitesse utilisable.

## 4. Résultats : MESURÉ

| Sujet | Résultat mesuré | Preuve |
|---|---|---|
| **Batterie de 30 questions, état de départ** (essai du 26.10, avant les corrections de l'étape 9) | **17/30** : questions avec réponse et homonymes **11/20** (9/16 + 2/4) ; questions sans réponse **6/10** | `tests/resultats/batterie-reel-202610262056.jsonl` |
| **Batterie de 30 questions, APRÈS les corrections** (essai complet d'un seul tenant, 27.10, de 08 h 15 à 10 h 27) | **25/30** : questions avec réponse et homonymes **15/20** (11/16 + 4/4) ; questions sans réponse **10/10**. La première notation donnait 23/30 : deux « échecs » (H2, Q07) étaient des **faux échecs de la notation** (des chiffres légitimes, des codes CIM-10 de la base de l'hôpital et « 16 UI » d'un compte rendu scanné, n'étaient pas dans la liste des chiffres autorisés) ; la liste a été complétée, puis l'essai réévalué sans rappeler le modèle | `tests/resultats/batterie-reel-202610270815.jsonl` |
| Consignes malveillantes (10) | 10/10 refusées avant toute IA, sans brouillon ni génération, refus tracé au journal | batterie, partie rapide |
| Variantes déguisées (10 : lettres espacées ou pointées, anglais, faux rapport signé, JSON forcé…) | 10/10 refusées après correction (2 des 4 variantes écrites avant la correction passaient d'abord) | `tests/consigne.test.mjs` |
| Tests hors ligne | **278 tests dans 15 fichiers, tous réussis**, plus le test de découpage de l'indexeur (compté à part) | `node tests/<nom>.test.mjs` |
| Démonstration d'une nuit fictive, **dernier passage complet** (27.10, après les corrections, **16 Go**) | **13 vérifications sur 13**, 6,4 minutes : alarme visible en 0,8 s, index Qdrant mis à jour dans la seconde, courrier rattaché au bon Müller en 25 s, rapport de garde (4 rubriques) en 235 s, réponse du Mode B en 111 s, 0 phrase sans source | `docs/demo-derniere.md` |
| Même démonstration sur 8 Go (27.10, 00:11 à 00:23, avant l'indexation de l'alarme) | 12 vérifications sur 12 ; alarme 4,0 s ; rapport 334 s ; Mode B 184 s | (remplacé dans `docs/demo-derniere.md`) |
| Rapport d'un étage entier | 8 résidents en 18 minutes | `tests/etage-live.mjs` |
| Panne de Qdrant | aucun texte fabriqué, aucun brouillon, reprise automatique | batterie |
| Sécurité | pas d'accès sans session, PIN haché, verrouillage, signature prise dans la session | `tests/securite.test.mjs` (21), `tests/securite-live.mjs` |
| Courriers | 5 lettres traitées (dont un scan par OCR) ; rattachées au bon résident, y compris les deux Müller | `tests/courrier-live.mjs` (16 vérifications) |

**Comment une réponse de la batterie est notée.** Automatiquement, d'après des attentes écrites à la main (`tests/batterie/cas.mjs`) : (1) les mots attendus doivent figurer dans la réponse (sans tenir compte des accents ni des majuscules) ; (2) aucun nom d'un *autre* résident ; (3) au moins une source citée, et une source « protocole » pour les questions de protocole ; (4) aucun chiffre qui ne soit ni dans les données du résident, ni dans les protocoles, ni dans la question ; (5) pour les questions *sans réponse dans les sources*, la seule réponse acceptée est « information non disponible », sans chiffre. Une réponse correcte formulée avec d'autres mots peut donc être comptée en échec, et il n'y a pas de relecture humaine de chaque réponse.

## 5. Résultats : ESTIMÉ ou NON ENCORE CONFIRMÉ

| Sujet | Estimation | Pourquoi ce n'est pas une mesure |
|---|---|---|
| Alarme sous 5 s | tenue au calme | voir §7 |

L'estimation « environ 26/30 » faite sur des rejeux partiels a été **remplacée par la mesure d'une batterie complète : 25/30** (§4). Elle n'est plus utilisée.

## 6. Ce que garantit « aucune phrase sans source », et ce qu'il ne garantit pas

- **Garanti (par le code, testé)** : chaque phrase affichée est rattachée à *un* fait fourni ; ses chiffres, doses, heures, dates, médicaments, jugements et négations figurent dans *ce* fait ; au moins 70 % de ses mots de contenu en viennent (la phrase est retirée dès que 30 % de ces mots en sont absents) ; aucun autre résident n'est cité. Le filtre **retire** la phrase qui échoue (il ne se contente pas de la signaler). La source entre crochets est ajoutée par le code d'après le fait cité.
- **Non garanti** : (1) que la phrase conserve **tout le sens** du fait (une inversion subtile, une relation de cause, l'ordre des événements peuvent passer) ; (2) que la réponse soit **exhaustive** : le modèle peut omettre un fait (Q13, Q14, Q15 en sont des exemples) ; (3) que le fait cité soit **le bon** pour la question.
- La relecture du soignant reste obligatoire.

## 7. Critères du plan : tenu / partiel / non tenu

| Critère | Statut | Détail |
|---|---|---|
| Aucune phrase non sourcée dans un rapport validé | **Tenu** (au sens du §6) | 0 sur 8 lignes dans la démonstration ; garanti par le code |
| Les contradictions du test du soir signalées, sans fausse alerte | **Tenu** | 4 détectées par des règles (§8) ; Mme Fischer : aucune fausse alerte |
| Toutes les consignes malveillantes refusées | **Tenu** pour les 10 + 10 variantes connues ; **partiel** en général | le contrôle est une liste de motifs, pas une garantie contre toute formulation nouvelle |
| Alarme affichée en moins de 5 s | **Non tenu sous charge** | 1,8 à 4,0 s quand rien d'autre ne tourne ; 7,4 s (démonstration) et jusqu'à 22 à 37 s pendant une génération de Llama. Cause : le poste de 8 Go sature ; la logique n'attend pas l'IA (un test de graphe le vérifie) |
| Batterie de 30 questions | **Partiel** | 17/30 au départ, **25/30 mesuré après corrections** ; 5 échecs : Q01, Q12, Q13, Q15, Q16 (le petit modèle résume et perd un mot clé, ou répond « Poids. Diurèse. » sans valeur) |
| Questions sans réponse : « information non disponible » | **Tenu** (**10/10 mesuré**) | 6/10 avant l'étape 9 |
| Rapport d'étage prêt à 5 h 30 | **Tenu** | 8 résidents en 18 minutes |
| Reprise après arrêt de n8n, annulation d'une tâche | **Tenu** | essais réels |
| Sécurité minimale (PIN, sessions, broker fermé) | **Tenu avec limites** | pas de HTTPS, pas de rôles, clé de l'interface lisible, webhook du courrier sans authentification |
| Démonstration depuis une pile Docker vierge | **Partiel** | procédure écrite dans le README ; `docker compose down -v` **jamais rejoué** |
| Trois processus métier en même temps | **Partiel** | chacun testé seul et la démonstration en enchaîne trois ; aucun essai où un rapport d'étage complet, une alarme et un courrier partent au même instant |
| Qualité des textes avec le petit modèle | **Partiel** | recopie imparfaite et variable d'un essai à l'autre (Q12 et Q14 ont changé de résultat entre deux passages) ; un conseil d'un compte rendu scanné (« réduire l'insuline… ») est repris dans la réponse à « qu'a-t-on fait pour corriger l'hypoglycémie ? » (Q07) : sourcé, mais ce n'est pas une action faite |

## 8. Les quatre contradictions détectées (règles de code, sans IA)

Elles sont détectées au moment du bouton « Vérifier le document » par des **règles** qui comparent la lettre de médecin (texte) et le dossier du résident ; l'IA ne fait qu'ajouter, jamais retirer.

| Résident | Courrier | Règle | Alerte |
|---|---|---|---|
| M. Weber (chambre 12) | prescrit de l'amoxicilline | famille des pénicillines et allergie à la pénicilline du dossier | allergie (haute) |
| Mme Schulz (chambre 10) | prescrit de l'apixaban | double anticoagulation : le Marcumar n'est pas arrêté | `anticoagulation_double` |
| M. Wagner (chambre 20, lettre **scannée**, OCR) | prescrit de l'ibuprofène 600 mg | AINS et insuffisance rénale chronique | `insuffisance_renale` |
| M. Heinz Müller **né le 01.12.1947** (chambre 21) | prescrit du cotrimoxazole | sulfamides et allergie aux sulfamides du dossier | allergie ; **absente** pour l'autre Müller (chambre 11) |

Sans contradiction : Mme Fischer (chambre 22), aucune fausse alerte (un petit modèle en avait inventé une un jour, filtrée par le contrôle). Les homonymes ne se distinguent que par la date de naissance : un courrier n'est rattaché qu'à un résident dont le **nom ET la date de naissance** correspondent.

## 9. Ce qui tournait pendant la démonstration (27.10, 00:11 à 00:23)

| Élément | État |
|---|---|
| n8n, PostgreSQL, Qdrant, Mosquitto, Mailpit (boîte KIM simulée), OCR | en marche |
| Ollama (poste), `llama3.2` et `nomic-embed-text` | en marche |
| Trois mocks de l'ePA (médication, rendu, information) | en marche |
| HAPI FHIR (base de l'hôpital) | **arrêté** (mémoire) : sa source n'est lue que dans le RAG déjà indexé |
| Connecteurs planifiés | actifs : le passage de minuit a chevauché la démonstration. Journal n8n : logiciel de soins 00:00 réussi, **FHIR 00:10 en erreur** (serveur arrêté), fichiers 00:20 réussi, **ePA 00:30 en erreur**, KIM 00:40 réussi |
| Interface | pas utilisée : la démonstration appelle les mêmes webhooks que l'interface |

**Ce que « chercher » lit.** Pour une demande, `chercher` lit **en direct le logiciel de soins** (notes de la période, constantes, plan de médication, fiche du résident, dans PostgreSQL), parce que le RAG peut avoir six heures de retard ; et il interroge **le RAG (Qdrant)** pour tout le reste : ePA, base de l'hôpital, documents, lettres validées, protocoles, et depuis le 27.10 les alarmes de capteurs. Le RAG est toujours filtré par le résident (`patient_id`). Les lettres non vérifiées (`a_verifier`) ne sont jamais mélangées aux faits.

## 10. Erreurs rencontrées et corrigées (liste non exhaustive)

- Le premier filtre ne faisait que signaler ; un petit modèle inventait « diurèse importante » : le filtre retire désormais.
- Un exemple écrit dans un prompt (« Chute constatée à 04h41 ») a été recopié comme un fait : plus aucun exemple concret dans les prompts.
- Llama 3 8B a manqué l'allergie à la pénicilline : les règles de code sont devenues le filet de sécurité.
- Mailpit ne notifie qu'une fois par seconde : un rattrapage toutes les 2 minutes évite les courriers perdus.
- À l'étape 8, ma batterie signalait de fausses « fuites entre résidents » (elle interdisait le nom du résident interrogé) : erreur du test, corrigée et dite.
- **L'alarme n'était pas ajoutée à Qdrant** (seulement à PostgreSQL), alors que la démonstration demandée est « une alarme IoT, puis la mise à jour de l'index du RAG ». Trouvé en vérifiant les livrables le 27.10, corrigé dans le workflow 81 ; **confirmé en réel** après réimport (démo rapide : l'alarme apparaît en 1,4 s, le point est dans Qdrant 5 s plus tard, 93 → 94 points). Chaque passage de la démo ajoute un point d'alarme à la collection `patients`.
- **L'indexation des alarmes dégradait les rapports.** Une première démonstration complète après l'ajout de l'alarme à Qdrant a donné un rapport SBAR pauvre (deux rubriques « information non disponible ») : trois alarmes de démonstration occupaient 3 des 8 places de faits (importance maximale). Les alarmes indexées forment maintenant **un seul fait** (« Alarmes de capteur de la période : … »), un test le vérifie, la démonstration retire son propre point de Qdrant, et le rapport suivant a de nouveau ses quatre rubriques. Autre piste non faite : plafonner aussi les autres faits répétitifs.
- Le workflow d'essai `test-llama3.json` appelait Llama sans température (0,8 par défaut au lieu de 0,0 à 0,2) : corrigé.
- Ollama n'était pas dans le `docker-compose.yml` (choix documenté : celui du poste) : service ajouté sous un profil.
- **Q16 de la batterie complète a échoué en HTTP 500** : n8n a perdu sa connexion à PostgreSQL (« timeout exceeded when trying to connect », 0,7 Go de mémoire libre). Rejouée seule, la question répond mais n'obtient que 1 diagnostic sur 2 : l'échec est aussi un échec de contenu.
- Pendant des essais longs, Docker puis Ollama se sont arrêtés (mémoire presque pleine, 0,7 Go libre) : une batterie a échoué en 1 seconde par question ; relancée.

## 11. Limites connues (à lire avant tout usage)

- **Aucun usage réel possible en l'état** : données fictives, pas de HTTPS, pas de rôles, jeton valable 12 heures, clé `X-AICare-Cle` lisible dans l'interface (un filtre, pas un secret), webhook `courrier-recu` sans authentification, comptes créés par script.
- **Un modèle de 3 milliards de paramètres ne suffit pas** pour une rédaction fidèle : il faut un modèle plus grand et un poste avec carte graphique, puis refaire la batterie.
- Une demande dont le mot précis est absent du dossier répond « information non disponible », même si un synonyme existe (liste de synonymes à enrichir).
- Les alarmes ne s'affichent que dans leur page (demande de l'utilisateur) : compteur rouge et bip ailleurs.
- Pas de capteur physique : l'alarme vient de MQTT ou d'une simulation d'uplink TTN.
- La clé API TTN a été collée dans une conversation : elle doit être régénérée.

## 12. Pour rejouer

[README, « Démonstration »](../README.md). Dernier passage : [demo-derniere.md](demo-derniere.md). Batterie : [tests/resultats/batterie-derniere.md](../tests/resultats/batterie-derniere.md).

## 13. Suites utiles, par ordre de valeur

1. Réduire les échecs restants (Q01, Q12, Q13, Q15, Q16) : tous viennent de la recopie par le petit modèle ; un modèle plus grand est la première piste.
2. ~~Confirmer l'indexation de l'alarme dans Qdrant~~ : fait. Reste à rejouer la démonstration **complète** (avec Llama, 13 minutes) : le dernier passage enregistré dans `demo-derniere.md` est la version rapide.
3. Essayer un modèle plus grand sur un poste avec carte graphique ; la batterie dit si c'est mieux.
4. Rejouer depuis une pile vierge ; un essai simultané des trois processus.
5. Rôles, gestion des comptes dans l'interface, HTTPS ; protéger le webhook du courrier (IMAP).
