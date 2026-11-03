// Rentenbeiträge – Antwort auf die Entscheidung.
const r = $input.first().json ?? {};
if (!r.statut) return [{ json: { ok: false, erreur: 'conflit', message: 'Die Akte wartet nicht mehr auf eine Entscheidung.' } }];
return [{ json: { ok: true, statut: r.statut, revue: r.revue === true } }];
