// Indexer – jedes Embedding seinem Abschnitt zuordnen und die Qdrant-Abfragen vorbereiten
// (ein Stapel mit höchstens 50 Punkten je Collection).
const morceaux = $('Neuigkeiten behalten').all();
const embeddings = $input.all();

if (morceaux.length !== embeddings.length) {
  throw new Error(`${morceaux.length} Abschnitte, aber ${embeddings.length} Embeddings: Zuordnung nicht möglich.`);
}

const parCollection = {};
morceaux.forEach((m, i) => {
  const vecteur = embeddings[i].json.embeddings?.[0];
  if (!Array.isArray(vecteur) || vecteur.length !== 768) {
    throw new Error(`Ungültiges Embedding für ${m.json.payload.source_ref} (erwartet: 768 Dimensionen).`);
  }
  (parCollection[m.json.collection] ??= []).push({ id: m.json.id, vector: vecteur, payload: m.json.payload });
});

const sortie = [];
for (const [collection, points] of Object.entries(parCollection)) {
  for (let i = 0; i < points.length; i += 50) {
    const lot = points.slice(i, i + 50);
    sortie.push({ json: { collection, n: lot.length, body: { points: lot } } });
  }
}
return sortie;
