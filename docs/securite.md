# Sécurité minimale (jour 4, étape 7)

Cette page décrit ce qui protège l'interface et n8n, **et ce qui ne les protège pas**. Toutes les données sont fictives ; les comptes ci-dessous sont des comptes de démonstration.

## Ce qui est en place

| Protection | Où | Ce qu'elle empêche |
|---|---|---|
| **Connexion du soignant** (identifiant + code PIN) | workflow `88-connexion` | d'utiliser l'assistant IA pour les équipes soignantes sans compte |
| **Session** : jeton aléatoire de 12 heures, contrôlé par n8n AVANT tout traitement | nœuds « Session » de chaque point d'entrée | d'appeler n8n sans être connecté, même en connaissant la clé |
| **Nom du soignant enregistré à chaque validation**, pris dans la session | workflows 72 et 73, table `soins.validations` (colonne `soignant_id`), journal d'audit | de valider « au nom de » quelqu'un d'autre |
| **Origines autorisées** (CORS) : seulement l'adresse de l'interface | option `allowedOrigins` des webhooks | qu'une autre page web dans le navigateur appelle n8n |
| **Clé secrète** en en-tête `X-AICare-Cle` | credential « AI-Care clé des webhooks » | les appels qui ne viennent pas de l'interface ou des scripts du projet |
| **Clé interne** distincte pour le chemin `aicare-verifier-interne` | credential « AI-Care clé interne » | qu'un courrier soit vérifié sans passer par la session d'un soignant |
| **Broker MQTT fermé** (voir `docs/alarmes.md`) | `compose/mosquitto/` | de fausses alarmes envoyées par n'importe qui sur le réseau |

## Les comptes de démonstration

`node scripts/creer-soignants.mjs` crée trois comptes fictifs : `martin`, `keller`, `roth`. Leurs codes PIN (6 chiffres tirés au hasard) sont dans le fichier `.env` (`DEMO_PIN_MARTIN`, `DEMO_PIN_KELLER`, `DEMO_PIN_ROTH`), jamais dans le dépôt. Pour en changer un : modifier la ligne dans `.env`, puis relancer le script.

Mise en route complète : `node scripts/generer-secrets.mjs` (crée les secrets manquants), `node scripts/creer-soignants.mjs`, `node workflows/importer.mjs`, puis démarrer l'interface avec `VITE_MOCK=false` (voir `.env.exemple`). En mode simulé (par défaut), la page de connexion accepte seulement le compte fictif `demo` / `123456` et n'appelle aucun serveur.

## Créer et gérer les comptes

Une seule commande, dans un terminal ouvert à la racine du projet (`C:\xampp\htdocs\IA CARE assistant`), Docker démarré.

**Créer un compte (mode guidé : le script pose les questions)** :

```bash
node scripts/creer-compte.mjs
```

Il demande l'identifiant (ex. `anna`, sans accent ni espace), le nom affiché (ex. `Mme Anna Weiss`) et le code PIN (4 à 8 chiffres ; vide = tiré au hasard et affiché une seule fois).

**Créer un compte en une ligne** :

```bash
node scripts/creer-compte.mjs anna "Mme Anna Weiss" 482913
```

**Autres actions** :

```bash
node scripts/creer-compte.mjs --liste
```
```bash
node scripts/creer-compte.mjs --pin anna
```
```bash
node scripts/creer-compte.mjs --desactiver anna
```
```bash
node scripts/creer-compte.mjs --activer anna
```

- `--liste` : comptes, état (actif / désactivé), date de création, nombre de sessions ouvertes.
- `--pin anna [PIN]` : change le PIN (tiré au hasard s'il est omis) et ferme les sessions ouvertes du compte.
- `--desactiver anna` : le compte ne peut plus se connecter, ses sessions sont fermées ; son historique de validations est conservé (on ne supprime pas un compte qui a validé des rapports : la traçabilité resterait sans nom).

Le nouveau compte fonctionne tout de suite, sans redémarrer n8n ni l'interface. **Pourquoi pas un formulaire dans l'interface ?** Il n'y a pas encore de rôles : n'importe quel soignant connecté pourrait alors créer des comptes. Tant que les rôles n'existent pas, la création reste une opération faite depuis le poste, par la personne qui gère l'installation.
## Comment ça marche

1. **Connexion** : l'interface envoie `{identifiant, pin}`. n8n lit l'empreinte du PIN en base (`scrypt`, sel propre à chaque compte, comparaison à temps constant) et répond par un jeton de 32 octets aléatoires. **Seule l'empreinte SHA-256 du jeton est gardée en base** ; le jeton lui-même n'existe que dans l'onglet du soignant (`sessionStorage`, effacé à la fermeture de l'onglet).
2. **Chaque appel** porte `Authorization: Bearer <jeton>`. Le premier nœud après le webhook calcule l'empreinte, cherche une session non expirée d'un compte actif. Sinon la réponse est `{ "erreur": "session" }`, aucun autre nœud n'est exécuté, et l'interface rouvre la page de connexion (message « votre session a expiré »).
3. **Validation** : le nom et l'identifiant du soignant qui valide viennent de la session (nœud « Session »), jamais du corps de la requête. Ils sont écrits dans `soins.validations` et dans le journal d'audit.
4. **Verrouillage** : 5 échecs en 5 minutes sur un même compte verrouillent ce compte 5 minutes, même avec le bon PIN. Un identifiant inconnu reçoit exactement le même refus qu'un mauvais PIN et fait le même calcul : on ne peut pas deviner quels comptes existent. Seuls les comptes existants sont comptés (la table des échecs ne grossit pas avec des identifiants inventés).

## Ce qui NE protège PAS (limites, dites franchement)

- **La clé `X-AICare-Cle` n'est pas un secret.** L'interface l'envoie, donc n'importe qui qui ouvre l'interface dans un navigateur peut la lire dans le code. Elle filtre seulement le bruit (appels qui ne viennent pas de l'interface) ; **la vraie protection est la session**.
- **Le webhook `courrier-recu` n'a aucune authentification.** Mailpit le déclenche et ne sait pas envoyer d'en-tête. N'importe qui sur le réseau peut donc le déclencher, mais il ne fait que **demander à n8n de relire la boîte Mailpit** : il ne transmet aucune donnée et ne permet de lire ni de modifier quoi que ce soit. En production, la boîte de réception serait lue par n8n (IMAP) avec ses propres identifiants.
- **Pas de HTTPS** : tout circule en HTTP sur le poste (`localhost`). Le jeton et le PIN seraient lisibles sur un réseau partagé. À mettre derrière un proxy HTTPS avant tout usage hors du poste de test.
- **Le jeton de session reste valable 12 heures** même si le soignant ferme l'onglet sans se déconnecter. Le bouton « Se déconnecter » le ferme tout de suite côté n8n.
- **Pas de gestion des comptes dans l'interface** (création, changement de PIN) : elle se fait par script (voir ci-dessus), faute de rôles.
- **Pas de rôles** : tous les soignants connectés peuvent tout faire dans l'interface. La traçabilité (qui a validé) existe, la séparation des droits non.
- **Les PIN de démonstration** (6 chiffres) sont faibles par nature ; le verrouillage limite l'essai en masse, ce qui n'est pas équivalent à un mot de passe solide.
- **Alarmes de capteurs affichées seulement dans leur page** (demande de l'utilisateur) : un soignant resté sur une autre page voit le compteur rouge de l'onglet et entend le bip, pas la carte.

## Vérifier

```bash
node tests/securite.test.mjs        # structure, session, PIN, signature, absence de secret dans le dépôt (hors n8n)
node tests/securite-live.mjs        # contre n8n : refus sans clé, sans session, avec une fausse session, verrouillage, CORS, signature
```
