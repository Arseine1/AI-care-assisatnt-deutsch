---
id: resume_epa
version: 1.1.0
sortie: phrases
sections: D=Diagnostics :|A=Allergies :|M=Médication (liste eML) :
temperature: 0.1
heures: 24
requete: diagnostics allergies médication liste eML traitement dossier ePA
protocoles: false
sources_prioritaires: ePA|Base hôpital (FHIR)
---
## INSTRUCTION
Résume le dossier ePA de ce résident à l'attention d'un soignant. Utilise les faits dont la source est [ePA] ; les faits de la base de l'hôpital ne complètent que ce que l'ePA ne dit pas, avec leur propre source. Les allergies sont toujours reprises, quelle que soit leur source, car elles sont essentielles à la sécurité. Ne reprends ni les notes de soins ni les événements de la période.

## FORMAT DE SORTIE
Les phrases sont réparties dans trois rubriques : D (diagnostics), A (allergies), M (médication, liste eML). Une phrase par élément. Pour la médication, donne pour chaque médicament le nom, la dose et le schéma de prise tels qu'ils figurent dans le fait cité, sans rien ajouter. Si une rubrique n'a aucun fait, ne lui donne aucune phrase. Ne propose aucun traitement et ne juge aucune valeur.
