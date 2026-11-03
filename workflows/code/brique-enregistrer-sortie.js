// Brique « enregistrer » – sortie : le résultat de la validation (sans l'événement de journal).
const { evenement_journal, ...resultat } = $('Résultat de la validation').first().json;
return [{ json: resultat }];
