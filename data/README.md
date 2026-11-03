# Données de test (100 % fictives)

Maison de soins fictive « Haus Sonnenhof » : 8 résidents, chambres 10–14 (étage 1) et 20–23 (étage 2).
Aucun nom, aucune valeur ni aucun document ne provient de personnes réelles.

## Source unique

`source/residents.mjs` est la **seule** source des résidents (diagnostics, allergies, médication, régime, risques, notes, constantes, analyses). Le SQL, le bundle FHIR et la liste du front en sont **générés** : on ne les modifie pas à la main.
`source/lettres.mjs` décrit les 5 lettres de médecin.

## Scénarios prévus exprès

| Résident | Scénario | Où le trouver |
|---|---|---|
| M. Hans Weber, ch. 12 | Allergie à la **pénicilline** ; **chute cette nuit** (il y a 5 h) ; lettre prescrivant de l'**amoxicilline** → contradiction | notes de soins, FHIR, lettre KIM |
| Mme Greta Schulz, ch. 10 | Sous **Marcumar** ; lettre prescrivant l'**apixaban** sans mentionner le Marcumar → double anticoagulation | plan de médication, lettre KIM |
| M. Otto Wagner, ch. 20 | **Insuffisance rénale stade 4** (DFG 22) ; lettre **scannée** (image) prescrivant l'**ibuprofène** → contradiction rénale, OCR obligatoire | notes, FHIR, lettre KIM scannée |
| M. Karl Becker, ch. 14 | **Hypoglycémies nocturnes** (52 mg/dl cette nuit, 3 en 5 jours) ; compte rendu scanné du diabétologue | notes, signes vitaux, `fichiers/` |
| M. Heinz Müller, ch. 11 (né le 09.05.1934) et ch. 21 (né le 01.12.1947) | **Homonymes**. La lettre « Herr Müller » ne se rattache au bon résident que par la **date de naissance** : le Müller de la chambre 21 est allergique aux sulfamides, la lettre prescrit du cotrimoxazole | lettre KIM |
| Mme Elisabeth Fischer, ch. 22 | Lettre **sans contradiction** : sert à vérifier l'absence de fausse alerte | lettre KIM |
| Mme Lotte Hoffmann, ch. 23 | Escarre stade 1, dénutrition, allergie au latex | notes, FHIR |

## Horodatages relatifs

Les notes et constantes sont enregistrées « il y a N minutes » (`now() - interval …`) : rejouer le chargement remet les **12 dernières heures** à jour. Quelques notes de plusieurs jours servent à tester le filtre.
L'heure affichée dans le texte est calculée (ex. « Chute constatée à 04h41 ») : elle correspond toujours à l'horodatage de la note (fuseau Europe/Berlin).

## Commandes

Prérequis : `docker compose up -d` dans `compose/`, puis `npm install` dans `data/`.

```bash
cd data
```
```bash
npm run generer    # régénère data/sql/02_seed.sql et front/src/mock/residents.json
```
```bash
npm run postgres   # logiciel de soins fictif : schéma « soins » + données (rejouable)
```
```bash
npm run fhir       # base de l'hôpital : bundle FHIR + PUT dans HAPI (idempotent)
```
```bash
npm run kim        # boîte KIM simulée : 5 lettres PDF dans Mailpit (sans doublon)
```
```bash
npm run lettres    # régénère les PDF des lettres (data/lettres/)
```
```bash
npm run scan       # régénère le compte rendu scanné (data/fichiers/)
```

`npm run epa` charge l'eML et les diagnostics des résidents dans les mocks ePA de gematik (voir README racine).
`npm run qdrant` crée les 3 collections du RAG (patients, connaissances, a_verifier ; 768 dimensions, Cosine) : rejouable, sans suppression.

`npm run tout` enchaîne generer, postgres, fhir, kim et epa.

## Contenu

| Dossier | Contenu |
|---|---|
| `sql/` | `01_schema.sql` (schéma `soins`), `02_seed.sql` (généré) |
| `fhir/` | `bundle.json` (généré : Patient, Condition, AllergyIntolerance, MedicationStatement, Observation) |
| `lettres/` | 4 lettres PDF (texte) + 1 lettre scannée (image), en allemand |
| `fichiers/` | 5 protocoles (`.md`) + 1 compte rendu scanné (`.pdf` image) |
| `scripts/` | générateurs et chargeurs (Node, sans dépendance native) |

Les scans sont dessinés avec une police système (Arial sous Windows, DejaVu sous Linux). Le texte des PDF « scannés » n'est pas sélectionnable : il faut un OCR pour le lire.
