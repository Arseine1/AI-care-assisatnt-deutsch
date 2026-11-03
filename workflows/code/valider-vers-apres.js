// Valider un rapport – seule une validation de RAPPORT DE GARDE est ajoutée au RAG et transmise à l'équipe suivante.
const v = $input.first().json;
return [{ json: { portee: 'resident', validation_ids: [v.validation_id] } }];
