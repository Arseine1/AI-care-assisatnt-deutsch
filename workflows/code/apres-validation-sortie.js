// Après validation – sortie du sous-workflow (sans les événements de journal).
const { evenements_journal, ...resultat } = $('Résumé').first().json;
return [{ json: resultat }];
