// Crée les 3 collections Qdrant du RAG (768 dimensions = nomic-embed-text, distance Cosine)
// et leurs index de payload. Rejouable : ne supprime jamais de données.
//
//   patients      morceaux de texte rattachés à un résident (notes, FHIR, ePA, lettres, scans)
//   connaissances protocoles et documents généraux de la maison (sans patient)
//   a_verifier    documents entrants à contrôler avant d'être considérés comme fiables
//                 (lettres de médecin, identité ambiguë ou contradiction détectée)
//
// Usage : node scripts/creer-collections.mjs [url]   (défaut : http://localhost:6335)
const QDRANT = (process.argv[2] || 'http://localhost:6335').replace(/\/$/, '');
const DIMENSION = 768;
const DISTANCE = 'Cosine';

// Champs du payload sur lesquels on filtre (voir docs/ pour le schéma complet).
const INDEX_COMMUNS = {
  source: 'keyword',      // logiciel_soins | fhir | epa | fichier | kim
  type: 'keyword',        // note | diagnostic | allergie | medication | analyse | lettre | protocole …
  empreinte: 'keyword',   // SHA-256 du morceau (anti-doublon)
  date: 'datetime',       // date de l'information (filtre « 12 dernières heures »)
};
const COLLECTIONS = {
  patients: { ...INDEX_COMMUNS, patient_id: 'keyword', chambre: 'keyword' },
  connaissances: { ...INDEX_COMMUNS, theme: 'keyword' },
  a_verifier: { ...INDEX_COMMUNS, patient_id: 'keyword', statut: 'keyword', motif: 'keyword' },
};

async function api(chemin, options = {}) {
  const res = await fetch(`${QDRANT}${chemin}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  const texte = await res.text();
  return { ok: res.ok, status: res.status, json: texte ? JSON.parse(texte) : null };
}

try {
  const r = await api('/collections');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.error(`Qdrant injoignable sur ${QDRANT} (${e.message}). Lancez « docker compose up -d » dans compose/.`);
  process.exit(1);
}

for (const [nom, index] of Object.entries(COLLECTIONS)) {
  const existante = await api(`/collections/${nom}`);
  if (existante.status === 404) {
    const c = await api(`/collections/${nom}`, {
      method: 'PUT',
      body: JSON.stringify({ vectors: { size: DIMENSION, distance: DISTANCE }, on_disk_payload: true }),
    });
    if (!c.ok) throw new Error(`création de ${nom} : ${JSON.stringify(c.json)}`);
    console.log(`créée      ${nom}`);
  } else {
    const v = existante.json.result.config.params.vectors;
    if (v.size !== DIMENSION || v.distance !== DISTANCE) {
      console.error(`${nom} existe avec une autre configuration (${v.size}, ${v.distance}) : à supprimer à la main si c'est voulu.`);
      process.exit(1);
    }
    console.log(`existe déjà ${nom} (${existante.json.result.points_count} points)`);
  }
  for (const [champ, schema] of Object.entries(index)) {
    const i = await api(`/collections/${nom}/index?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ field_name: champ, field_schema: schema }),
    });
    if (!i.ok) throw new Error(`index ${nom}.${champ} : ${JSON.stringify(i.json)}`);
  }
}
console.log(`Collections prêtes : ${Object.keys(COLLECTIONS).join(', ')} (${DIMENSION} dimensions, ${DISTANCE}).`);
