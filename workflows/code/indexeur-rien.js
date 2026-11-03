// Indexer – Zweig „Nichts Neues“: Alle Abschnitte standen bereits im Protokoll.
const total = $('Zerlegen und Hashen').all().filter((m) => m.json.payload).length;
return [{ json: { morceaux_indexes: 0, ignores_deja_importes: total, par_collection: {} } }];
