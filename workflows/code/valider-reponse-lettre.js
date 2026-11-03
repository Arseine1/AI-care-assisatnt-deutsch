// Valider un rapport de vérification – réponse à l'interface : la validation, puis ce qu'est devenue la lettre.
const v = $('Enregistrer').first().json;
const a = $input.first().json ?? {};
return [{ json: { ...v, apres_validation: a.error ? { erreur: String(a.error.message ?? a.error).slice(0, 200) } : { lettre: a.lettre } } }];