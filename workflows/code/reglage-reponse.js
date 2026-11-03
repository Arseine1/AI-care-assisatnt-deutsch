// Réglage de l'analyse complémentaire – réponse à l'interface.
const r = $input.first().json ?? {};
return [{ json: { cle: 'verification_ia', valeur: r.valeur !== false } }];