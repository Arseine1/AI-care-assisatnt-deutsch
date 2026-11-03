// Erstellt die 3 Qdrant-Collections des RAG (768 Dimensionen = nomic-embed-text, Distanz Cosine)
// und ihre Payload-Indizes. Wiederholbar: löscht nie Daten.
//
//   patients      Textabschnitte, die einem Bewohner zugeordnet sind (Notizen, FHIR, ePA, Briefe, Scans)
//   connaissances Protokolle und allgemeine Dokumente des Hauses (ohne Patient)
//   a_verifier    eingehende Dokumente, die zu prüfen sind, bevor sie als verlässlich gelten
//                 (Arztbriefe, mehrdeutige Identität oder erkannter Widerspruch)
//
// Aufruf: node scripts/creer-collections.mjs [url]   (Standard: http://localhost:6335)
const QDRANT = (process.argv[2] || 'http://localhost:6335').replace(/\/$/, '');
const DIMENSION = 768;
const DISTANCE = 'Cosine';

// Payload-Felder, nach denen gefiltert wird (vollständiges Schema siehe docs/).
const INDEX_COMMUNS = {
  source: 'keyword',      // logiciel_soins | fhir | epa | fichier | kim
  type: 'keyword',        // note | diagnostic | allergie | medication | analyse | lettre | protocole …
  empreinte: 'keyword',   // SHA-256 des Abschnitts (gegen Duplikate)
  date: 'datetime',       // Datum der Information (Filter „letzte 12 Stunden“)
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
  console.error(`Qdrant nicht erreichbar unter ${QDRANT} (${e.message}). Starten Sie „docker compose up -d“ in compose/.`);
  process.exit(1);
}

for (const [nom, index] of Object.entries(COLLECTIONS)) {
  const existante = await api(`/collections/${nom}`);
  if (existante.status === 404) {
    const c = await api(`/collections/${nom}`, {
      method: 'PUT',
      body: JSON.stringify({ vectors: { size: DIMENSION, distance: DISTANCE }, on_disk_payload: true }),
    });
    if (!c.ok) throw new Error(`Erstellung von ${nom}: ${JSON.stringify(c.json)}`);
    console.log(`erstellt     ${nom}`);
  } else {
    const v = existante.json.result.config.params.vectors;
    if (v.size !== DIMENSION || v.distance !== DISTANCE) {
      console.error(`${nom} existiert mit einer anderen Konfiguration (${v.size}, ${v.distance}): bei Bedarf von Hand löschen.`);
      process.exit(1);
    }
    console.log(`existiert bereits ${nom} (${existante.json.result.points_count} Punkte)`);
  }
  for (const [champ, schema] of Object.entries(index)) {
    const i = await api(`/collections/${nom}/index?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ field_name: champ, field_schema: schema }),
    });
    if (!i.ok) throw new Error(`index ${nom}.${champ} : ${JSON.stringify(i.json)}`);
  }
}
console.log(`Collections bereit: ${Object.keys(COLLECTIONS).join(', ')} (${DIMENSION} Dimensionen, ${DISTANCE}).`);
