// Indexeur – branche « rien de nouveau » : tous les morceaux étaient déjà au journal.
const total = $('Découper et hacher').all().filter((m) => m.json.payload).length;
return [{ json: { morceaux_indexes: 0, ignores_deja_importes: total, par_collection: {} } }];
