// Indexeur – dernière étape : résumé renvoyé au workflow appelant.
const lots = $('Construire les points').all();
const total = $('Découper et hacher').all().filter((m) => m.json.payload).length;
const parCollection = {};
for (const l of lots) parCollection[l.json.collection] = (parCollection[l.json.collection] ?? 0) + l.json.n;
const importes = Object.values(parCollection).reduce((a, b) => a + b, 0);
return [{ json: { morceaux_indexes: importes, ignores_deja_importes: total - importes, par_collection: parCollection } }];
