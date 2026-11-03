// Cotisations retraite – réponse à la décision.
const r = $input.first().json ?? {};
if (!r.statut) return [{ json: { ok: false, erreur: 'conflit', message: "Le dossier n'est plus en attente de décision." } }];
return [{ json: { ok: true, statut: r.statut, revue: r.revue === true } }];