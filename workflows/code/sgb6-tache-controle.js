// Cotisations retraite – avancement : { tache_id } (UUID).
const id = String($input.first().json?.body?.tache_id ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('tache_id invalide');
return [{ json: { tache_id: id } }];