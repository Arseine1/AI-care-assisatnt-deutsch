// Avancement d'une tâche – contrôle de la demande de l'interface :
//   { tache_id }                  une tâche précise (identifiant UUID)
//   { etage, recent: true }       le dernier rapport d'étage des 16 dernières heures (par exemple celui de 5h30)
const e = $input.first().json?.body ?? {};
if (e.recent === true) {
  const etage = Number(e.etage);
  if (!Number.isInteger(etage) || etage < 0 || etage > 20) throw new Error('étage invalide');
  return [{ json: { tache_id: '', etage: String(etage) } }];
}
const id = String(e.tache_id ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('tache_id invalide');
return [{ json: { tache_id: id, etage: '' } }];
