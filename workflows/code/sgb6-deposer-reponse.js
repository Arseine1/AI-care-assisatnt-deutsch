// Cotisations retraite – réponse au dépôt : { ok: true, id } ou { ok: false, erreur, message }. Aucun contenu du fichier n'est renvoyé.
const r = $input.first().json ?? {};
if (r.refus) return [{ json: { ok: false, erreur: r.refus, message: r.message } }];
if (!r.id) return [{ json: { ok: false, erreur: 'enregistrement', message: "Le dossier n'a pas pu être enregistré." } }];
return [{ json: { ok: true, id: r.id } }];