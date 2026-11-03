// Indexeur – associer chaque embedding à son morceau et préparer les requêtes Qdrant
// (un lot de 50 points maximum par collection).
const morceaux = $('Garder les nouveautés').all();
const embeddings = $input.all();

if (morceaux.length !== embeddings.length) {
  throw new Error(`${morceaux.length} morceaux mais ${embeddings.length} embeddings : correspondance impossible.`);
}

const parCollection = {};
morceaux.forEach((m, i) => {
  const vecteur = embeddings[i].json.embeddings?.[0];
  if (!Array.isArray(vecteur) || vecteur.length !== 768) {
    throw new Error(`Embedding invalide pour ${m.json.payload.source_ref} (attendu : 768 dimensions).`);
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
