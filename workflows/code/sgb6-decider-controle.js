// Cotisations retraite – décision humaine : { id, decision: valider | revue | refuser, motif }.
// Le soignant n'est PAS lu ici : il vient de la session (nœud « Session »), jamais du corps de la requête.
const e = $input.first().json?.body ?? {};
const id = String(e.id ?? '');
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error('id de dossier invalide');
const decision = String(e.decision ?? '');
if (!['valider', 'revue', 'refuser'].includes(decision)) throw new Error('décision inconnue');
return [{ json: { id, decision, motif: String(e.motif ?? '').trim().slice(0, 500) } }];