// Rentenbeiträge – sofortige Antwort: Der Agent arbeitet danach als Hintergrundaufgabe weiter.
const t = $input.first().json ?? {};
const v = $('Start überprüfen').first().json;
return [{ json: { ok: true, tache_id: t.id, id: v.id, pilote: v.pilote, etapes: ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration'] } }];
