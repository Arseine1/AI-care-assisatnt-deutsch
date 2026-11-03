---
id: extraire_faits
version: 1.0.1
sortie: json
cles_json: patient,diagnostics,medicaments,allergies_mentionnees,autres_recommandations
listes_json: medicaments:nom|dose|frequence|duree|action
temperature: 0.1
heures: 24
requete: lettre de médecin médicaments diagnostic recommandation
protocoles: false
---
## INSTRUCTION
Le bloc FAITS DES SOURCES contient un document (par exemple une lettre de médecin) dont le texte est parfois imparfait, notamment après la lecture automatique d'un scan. Extrais-en les informations demandées sous forme de données structurées. N'extrais que ce que le document dit expressément : n'interprète pas, ne complète pas, ne corrige aucune dose et ne tiens compte d'aucune autre information. Une information absente du document vaut null, ou une liste vide.

## FORMAT DE SORTIE
Réponds par UN SEUL objet JSON valide, sans texte avant ni après et sans bloc de code, avec exactement ces clés :
- "patient" : objet avec "nom" (texte ou null), "prenom" (texte ou null) et "naissance" (texte au format JJ.MM.AAAA, ou null) ;
- "diagnostics" : liste de textes ;
- "medicaments" : liste d'objets avec "nom" (texte), "dose" (texte ou null), "frequence" (texte ou null), "duree" (texte ou null) et "action" ("debut", "arret", "poursuite", "changement" ou "inconnu") ;
- "allergies_mentionnees" : liste de textes ;
- "autres_recommandations" : liste de textes.
Chaque médicament cité dans le document va dans "medicaments", même sans dose, et jamais dans "autres_recommandations" (qui ne contient que les conseils et contrôles prévus). Recopie les noms, les doses et les durées comme ils sont écrits dans le document, sans les traduire. Valeur de "action" : "debut" pour un médicament que la lettre prescrit ou recommande de commencer ; "poursuite" pour un médicament que la lettre dit inchangé ou poursuivi ; "changement" pour un remplacement ou un changement de dose ; "arret" pour un arrêt ; "inconnu" si la lettre ne le dit pas. Écris les clés exactement comme ci-dessus, sans accent.
