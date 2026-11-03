// Cotisations retraite – réponse immédiate : l'agent travaille ensuite en tâche de fond.
const t = $input.first().json ?? {};
const v = $('Vérifier le lancement').first().json;
return [{ json: { ok: true, tache_id: t.id, id: v.id, pilote: v.pilote, etapes: ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration'] } }];