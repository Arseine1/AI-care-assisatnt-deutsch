// Fortschritt einer Aufgabe – Prüfung der Anfrage der Oberfläche:
//   { tache_id }                  eine bestimmte Aufgabe (UUID-Kennung)
//   { etage, recent: true }       der letzte Etagenbericht der letzten 16 Stunden (z. B. der von 5:30 Uhr)
const e = $input.first().json?.body ?? {};
if (e.recent === true) {
  const etage = Number(e.etage);
  if (!Number.isInteger(etage) || etage < 0 || etage > 20) throw new Error('Ungültige Etage');
  return [{ json: { tache_id: '', etage: String(etage) } }];
}
const id = String(e.tache_id ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Ungültige tache_id');
return [{ json: { tache_id: id, etage: '' } }];
