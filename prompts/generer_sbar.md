---
id: generer_sbar
version: 1.1.0
sortie: phrases
sections: S=S – Situation :|B=B – Background (contexte) :|A=A – Assessment (évaluation) :|R=R – Recommendation :
temperature: 0.1
heures: 12
requete: incident chute douleur tension pouls température glycémie traitement médicament observation risque surveillance
protocoles: false
---
## INSTRUCTION
Rédige la transmission SBAR des {periode_heures} dernières heures pour ce résident, à l'attention de l'équipe suivante. Reprends uniquement les faits de cette période et classe-les par importance pour la sécurité du résident : incidents d'abord, puis constantes, traitements et observations. Pour chaque incident, donne l'heure, la valeur mesurée et ce qui a été fait. Reformule chaque fait en une phrase courte : ne recopie jamais les lignes des faits ni leurs dates en tête de ligne. Les informations de fond (diagnostics, allergies, risques, plan de médication) ne servent qu'à la rubrique B.

## FORMAT DE SORTIE
Les phrases sont réparties dans quatre rubriques : S (situation : l'incident ou l'événement principal), B (contexte du résident : fond, allergies, antécédents), A (évaluation : constantes et observations de la période), R (recommandation). Chaque rubrique contient 1 à 4 phrases au plus. N'écris que des heures, des valeurs et des actions qui figurent dans les faits : n'invente aucun contrôle, aucun rendez-vous et aucune date. Une glycémie de contrôle après un resucrage n'est pas une nouvelle hypoglycémie. Ne regroupe jamais plusieurs faits sur une seule phrase. Dans R, ne reprends que des actions ou des consignes déjà présentes dans les faits (surveillance, protocole, contrôle prévu) ; ne propose aucun traitement, aucune dose et aucun diagnostic nouveau. Si une rubrique n'a aucun fait, ne lui donne aucune phrase.
