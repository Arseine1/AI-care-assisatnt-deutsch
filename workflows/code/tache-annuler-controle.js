// Annuler une tâche – contrôle de la demande : seul l'identifiant (UUID) de la tâche est lu.
const e = $input.first().json?.body ?? {};
const id = String(e.tache_id ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('tache_id invalide');
return [{ json: { tache_id: id } }];