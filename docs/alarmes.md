# Alarmes de capteurs (MQTT)

Un capteur publie un message MQTT ; l'interface affiche une alarme en moins d'une seconde (poste au repos), avec les faits du dossier lus par le **code**. Le texte de contexte de l'assistant IA s'ajoute ensuite, quand il est prêt.

## Sujets MQTT

`capteurs/chambre{n}/{type}` avec `type` parmi `chute`, `sortie_lit`, `appel` (`n` : 1 à 3 chiffres). Tout autre sujet est rejeté (ligne `alarme_rejetee` au journal d'audit, sujet nettoyé). Le broker est le Mosquitto du docker-compose : `localhost:1884` depuis le poste, `mosquitto:1883` depuis n8n, accès réservé à deux comptes (voir « Comptes du broker » ci-dessous).

**Le contenu du message n'est jamais lu, ni stocké, ni envoyé à l'IA** : seul le sujet compte. Un capteur défaillant ou piraté ne peut donc injecter aucun texte (testé : `tests/alarmes.test.mjs`).

## Ce qui se passe (workflow `81-alarme-capteur`)

1. **Contrôle du sujet** (code) puis recherche du résident de la chambre.
2. **Faits codés**, sans IA : résident, risques, allergies, diagnostics et **médication à risque** repérée par famille (anticoagulant : saignement ; insuline : hypoglycémie ; sédatif : somnolence, chute ; baisse de tension ou diurétique : chute). Chambre sans résident : l'alarme s'affiche quand même, sans contexte IA.
3. **Alarme enregistrée** (`soins.alarmes`) : c'est le moment où elle devient visible. Une alarme répétée par le capteur pour la même chambre et le même type dans la minute n'en crée pas une seconde.
4. **Contexte de l'assistant IA** (prompt `contexte_alarme`, 7 faits du dossier + la ligne « [Capteurs] » construite par le code, 4 phrases au plus, filtre anti-invention comme partout). **Une seule génération à la fois** : une alarme qui arrive pendant qu'une autre prépare son contexte est marquée « différé » (les faits codés restent affichés).

L'interface interroge `POST /webhook/aicare-alarmes` toutes les 2 secondes ; `{ "acquitter": "<uuid>" }` acquitte, `{ "historique": true }` ajoute les alarmes acquittées des 24 dernières heures. Une alarme reste affichée jusqu'à son acquittement. Un contexte « en préparation » dont n8n s'est arrêté devient « indisponible » (reprise au démarrage, veilleur).

## Dans l'interface

- **Carte d'alarme** (douce, sans bandeau coloré) en haut des pages de travail : titre, heure, faits du dossier, contexte de l'IA, bouton « Acquitter ».
- **Page « Alarmes »** (un onglet à elle, avec compteur) : uniquement les alarmes de capteurs, liste en attente et historique de 24 heures. Les alertes de documents (courriers, ePA) sont sur leur propre page « Documents » (voir docs/documents.md).
- **Connexion perdue** : si l'interface n'obtient plus de réponse de n8n trois fois de suite, elle l'écrit (« Connexion au serveur perdue… ») au lieu de laisser croire qu'il n'y a aucune alarme.
- À chaque nouvelle alarme : deux bips courts (le navigateur peut exiger un premier clic sur la page) et le titre de l'onglet annonce « (n) ALARME ».

## Simuler une alarme

```bash
scripts/simuler-alarme.sh 12 sortie_lit
```
```powershell
.\scripts\simuler-alarme.ps1 -Chambre 12 -Type sortie_lit
```

Les deux utilisent `mosquitto_pub` s'il est installé, sinon celui du conteneur (rien à installer). Essai complet avec mesures : `node tests/alarme-live.mjs` (alarmes sur plusieurs chambres, sujets invalides, doublons, délais, acquittement).

## Délais mesurés (poste de test : 8 Go de RAM, 4 coeurs, sans carte graphique)

| Mesure | Résultat |
|---|---|
| Alarme visible, poste au repos | **0,4 à 0,9 s** (sans la commande `docker exec` qui ajoute 1 à 2 s à la mesure), puis au plus 2 s d'intervalle d'interrogation de l'interface |
| Alarme visible pendant qu'une génération tourne (Ollama normal) | 6,5 s à **43,8 s** |
| Alarme visible pendant qu'une génération tourne (Ollama 3 threads, priorité basse) | médiane **2,4 s**, 4 alarmes sur 5 sous 2,5 s, **une à 13 s** |
| Contexte de l'IA prêt (première mesure, 8 phrases) | **209 s** |
| Contexte de l'IA (4 phrases, 3 threads) | **mesures non fiables** : 320 s, mais pendant la mesure le poste était saturé (modèle presque entièrement sorti de la mémoire, 18 Go de fichier d'échange) |

**Conclusion franche** : le test « alarme affichée en moins de 5 secondes » est tenu **au repos** (moins d'une seconde) et **le plus souvent sous charge** avec les réglages ci-dessous, mais **pas toujours** sur ce poste (13 s mesurés une fois). Le texte de l'IA, lui, prend plusieurs minutes ici.

### Réglages qui protègent l'affichage des alarmes

- `AICARE_THREADS` (3 par défaut) : threads de calcul laissés à Ollama, pour garder un coeur libre.
- `scripts/priorite-ollama.ps1` : Ollama en priorité inférieure pendant qu'il génère (`-Normale` pour revenir). **Compromis** : n8n et PostgreSQL passent devant, mais la génération ralentit dès que le poste fait autre chose. À refaire après chaque redémarrage d'Ollama.

### Pour aller plus vite (voir aussi `docs/vitesse.md`)

1. **16 Go de RAM** : supprime la saturation observée (c'est elle qui fait varier les mesures du simple au triple) ; le texte reste calculé par le processeur.
2. **Carte graphique** : le texte en quelques secondes.
3. **Texte de contexte sans génération** : la mesure du protocole de la maison pourrait être citée directement depuis le RAG par le code (une seconde, sans invention possible) ; non fait, à décider.

## Comptes du broker (accès fermé)

Le broker refuse toute connexion sans compte. Deux comptes, créés par `node scripts/generer-secrets.mjs` (mots de passe aléatoires écrits dans `.env`, jamais dans le dépôt ; le fichier haché `compose/mosquitto/passwd` est ignoré par Git) :

- `capteurs` : publie sur `capteurs/#`, ne peut rien lire ;
- `n8n` : lit `capteurs/#`, ne publie pas.

Les scripts `scripts/simuler-alarme.ps1` et `.sh` lisent le compte `capteurs` dans `.env` : aucune saisie de mot de passe. Aucune clé API n'est nécessaire en local.

## Pont TTN (The Things Stack)

Second point d'entrée du même workflow `81` : le nœud « Alarme TTN » s'abonne à `v3/<application>/devices/+/up` sur votre serveur TTN (MQTT chiffré, port 8883), le nœud « Traduire (TTN) » en tire la chambre et le type d'alarme, puis la suite est identique aux capteurs locaux.

- Configuration dans `.env` : `TTN_SERVEUR`, `TTN_PORT` (8883), `TTN_APPLICATION` (identifiant complet `application@locataire`), `TTN_CLE_API` (clé en lecture du trafic seulement). Puis `node workflows/importer.mjs --seulement=81`. Sans ces valeurs, le nœud reste désactivé.
- Format reconnu : message décodé `{ "alarme": "chute|sortie_lit|appel", "chambre": 12 }` (formateur JavaScript de l'application TTN, voir ci-dessous), ou, à défaut, un nom d'appareil du type `chambre12-sortie-lit`. Synonymes acceptés : `fall`, `bed_exit`, `call`, `sos`, `room`…
- Seuls la chambre (1 à 3 chiffres) et le type (liste fermée) sont repris : aucun autre texte du message TTN n'entre dans le système ni dans le prompt.
- Formateur à coller dans TTN (Payload formatters, Uplink, JavaScript personnalisé) :

```javascript
function decodeUplink(input) {
  var types = { 1: 'chute', 2: 'sortie_lit', 3: 'appel' };
  var t = types[input.bytes[0]];
  return { data: { alarme: t, chambre: input.bytes[1] }, warnings: [], errors: t ? [] : ['type inconnu'] };
}
```

- Essais depuis TTN (Messaging, Simulate uplink, FPort 1) : `010C` chute chambre 12, `020C` sortie de lit chambre 12, `030C` appel chambre 12.
- Limite : seule la connexion à un compte TTN réel prouve le chemin complet ; les tests hors ligne couvrent la traduction (`tests/alarmes.test.mjs`).