# Documents en automatique (courriers de médecin, nouveautés de l'ePA)

Un courrier arrive dans la boîte KIM (simulée par Mailpit) : n8n le lit, extrait son texte (OCR si c'est un scan), le rattache à un résident, applique les règles de sécurité et crée une alerte sur la page **Documents**. Rien n'est ajouté aux sources d'intelligence tant qu'un soignant n'a pas validé.

## Déclenchement

| Mécanisme | Rôle |
|---|---|
| **Notification de Mailpit** (webhook `courrier-recu`, workflow `83`) | traite un courrier dès son arrivée (27 à 33 s mesurés) |
| **Rattrapage toutes les 2 minutes** (workflow `86`) | traite tout courrier non encore traité : notification perdue, n8n arrêté à l'arrivée du courrier, **rafale** |
| **Verrou par courrier** (`soins.courriers_traites`) | un courrier pris depuis moins de 15 minutes n'est pas repris : jamais deux traitements en même temps |

**Pourquoi pas un « Email Trigger (IMAP) »** : Mailpit n'a pas de serveur IMAP (seulement SMTP et POP3). Il prévient n8n par webhook (`MP_WEBHOOK_URL`) ; n8n relit ensuite le message par l'API de Mailpit et **n'utilise que son identifiant**, jamais le contenu de la notification. Avec une vraie boîte KIM, il suffirait de remplacer le nœud « Webhook » du workflow `83` par un « Email Trigger (IMAP) » : le reste ne change pas.

**Piège mesuré** : Mailpit n'envoie qu'**une notification par seconde** et abandonne les suivantes (5 lettres d'un coup = 1 notification). La valeur de réglage `MP_WEBHOOK_LIMIT` n'est pas à toucher : à 50, même des messages espacés de 6 s sont perdus. C'est le rattrapage qui couvre les rafales.

## Le traitement d'un courrier (sous-workflow `85`)

1. **Verrou**, puis lecture du message dans Mailpit : seules les pièces jointes PDF comptent (un message de transmission n'en a pas : rien ne se passe).
2. **Texte du PDF** par le service OCR (OCRmyPDF : le texte d'un PDF, l'OCR pour un scan ; 2 à 3 minutes pour un scan sur ce poste).
3. **Identification par le code** : le nom **et** la date de naissance du courrier doivent correspondre à UN seul résident (les deux « Heinz Müller » ne se distinguent que par la date). Sinon le courrier reste sans résident : « identité inconnue » ou « identité ambiguë ». **On ne devine jamais**, et l'identification ne dépend pas du modèle de langue.
4. **Indexation** dans la collection `a_verifier` (le contenu d'une lettre n'est pas présenté comme fiable avant contrôle).
5. **Règles de sécurité** (allergie, double anticoagulation, AINS avec insuffisance rénale) par le point d'entrée « Vérifier le document » (`aicare-verifier`) : réponse en quelques secondes, l'analyse de l'IA suit en tâche de fond si le réglage est activé.
6. **Alerte** (une seule par courrier) sur la page Documents :

| Gravité | Cas |
|---|---|
| **rouge** | contradiction détectée par les règles |
| **attention** | courrier non identifié, ou vérification automatique impossible |
| **info** | aucune contradiction : le courrier reste à valider |

## Validation et ajout au RAG (workflow `84`)

Dans « Vérifier un document » (ou par le bouton « Ouvrir la vérification » d'une alerte), le soignant relit le rapport et le valide. **Seule la validation d'un rapport de vérification** peut faire entrer la lettre dans le RAG, et seulement si les règles n'y ont trouvé **aucune contradiction** :

- sans contradiction : la lettre est ajoutée à la collection `patients` (type `lettre_validee`, source « KIM (lettre de médecin) ») et n'est plus « à vérifier » ;
- avec contradiction : la validation du rapport est enregistrée, mais la lettre **reste à vérifier** tant que le médecin n'a pas clarifié le point.

Le texte vient de la base (collection `a_verifier`), pas de la requête ; le résident de la lettre doit être celui de la validation ; la décision est tracée au journal d'audit (`lettre_validee` ou `lettre_non_ajoutee`).

## Nouveautés de l'ePA

À la fin du connecteur ePA (workflow `40`, planifié 4 fois par jour), un résident dont l'ePA avait **déjà** été importée et dont du contenu nouveau ou modifié vient d'être indexé reçoit une alerte d'information sur la page Documents. La première importation d'un résident ne notifie rien. Vérifié sur la requête réelle, dans une transaction annulée (les mocks ePA, arrêtés pour économiser la mémoire, n'ont pas été relancés pour cet essai).

## Essais

```bash
node tests/courriers.test.mjs    # hors ligne : identification, alertes, chemins, validation, rattrapage, verrou
node tests/courrier-live.mjs     # réel : de vrais PDF envoyés dans Mailpit (dont un scan), validations, ePA ; 8 à 12 minutes
```