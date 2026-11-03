---
id: comparer
version: 1.0.1
sortie: json
cles_json: contradictions,aucune_contradiction
listes_json: contradictions:type|gravite|description|element_lettre|element_source|sources
temperature: 0.1
heures: 24
requete: allergie médication anticoagulant insuffisance rénale contre-indication risque
protocoles: true
max_faits: 40
---
## INSTRUCTION
Compare la lettre à vérifier (le fait de source [KIM (lettre de médecin)]) avec les autres faits du résident : allergies, plan de médication, risques, diagnostics, fonction rénale et protocoles de la maison. Signale une contradiction seulement si DEUX faits précis s'opposent, l'un venant de la lettre, l'autre d'une autre source.

Correspondances à utiliser pour comparer (liste fermée, n'en ajoute aucune) :
- pénicillines : pénicilline, amoxicilline, ampicilline, flucloxacilline ;
- sulfamides : sulfamides, cotrimoxazole, sulfaméthoxazole ;
- anticoagulants : Marcumar, phenprocoumon, apixaban, rivaroxaban, dabigatran, héparine ;
- anti-inflammatoires (AINS) : ibuprofène, diclofénac, naproxène, kétoprofène.

Contradictions admises : un médicament de la lettre de la même famille qu'une allergie connue ; un second anticoagulant alors que le résident en prend déjà un, sans que l'arrêt du premier soit mentionné ; un AINS chez un résident dont les faits indiquent une insuffisance rénale ou « AINS contre-indiqués ». Si la lettre ne s'oppose à aucun fait, ne signale rien. Ne juge pas la décision du médecin : tu signales, un soignant décide.

## FORMAT DE SORTIE
Réponds par UN SEUL objet JSON valide, sans texte avant ni après et sans bloc de code, avec exactement ces clés :
- "contradictions" : liste, vide s'il n'y en a pas, d'objets avec "type" ("allergie", "anticoagulation_double", "insuffisance_renale" ou "autre"), "gravite" ("haute" ou "moyenne"), "description" (une phrase), "element_lettre" (le texte de la lettre concerné), "element_source" (le texte du fait qui s'y oppose) et "sources" (liste des sources des deux faits, telles qu'écrites entre crochets dans les faits) ;
- "aucune_contradiction" : true si et seulement si la liste "contradictions" est vide ; false dès qu'elle contient au moins une contradiction.
Écris les clés exactement comme ci-dessus, sans accent, et renseigne les six clés de chaque contradiction.
