// Rentenbeiträge – Antwort auf den Upload: { ok: true, id } oder { ok: false, erreur, message }. Vom Inhalt der Datei wird nichts zurückgegeben.
const r = $input.first().json ?? {};
if (r.refus) return [{ json: { ok: false, erreur: r.refus, message: r.message } }];
if (!r.id) return [{ json: { ok: false, erreur: 'enregistrement', message: 'Die Akte konnte nicht gespeichert werden.' } }];
return [{ json: { ok: true, id: r.id } }];
