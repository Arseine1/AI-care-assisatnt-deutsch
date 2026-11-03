// Aufgabe abbrechen – Prüfung der Anfrage: Nur die Kennung (UUID) der Aufgabe wird gelesen.
const e = $input.first().json?.body ?? {};
const id = String(e.tache_id ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Ungültige tache_id');
return [{ json: { tache_id: id } }];