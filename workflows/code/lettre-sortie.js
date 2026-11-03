// Lettre validée – sortie du sous-workflow (sans l'événement de journal).
const { evenement_journal, ...r } = $('Résultat').first().json;
return [{ json: r }];