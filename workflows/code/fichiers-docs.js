// Connecteur « fichiers » : un fichier = un document.
//  - protocole-*.md          -> collection « connaissances » (règles générales, sans patient)
//  - autre document (scan)   -> rattaché à UN résident si le nom ET la date de naissance du texte correspondent
//                               (les homonymes ne se distinguent que par la date de naissance) ;
//                               sinon collection « a_verifier » : on ne devine jamais l'identité.
const residents = $('Résidents').all().map((i) => i.json);
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const docs = [];
for (const { json: f } of $input.all()) {
  const nom = f.nom;
  const texte = (f.texte ?? '').trim();
  if (!texte) continue;

  const base = {
    source: 'fichier',
    source_label: 'Fichiers',
    source_ref: `fichiers/${nom}`,
    titre: nom.replace(/\.[a-z]+$/i, '').replace(/[-_]/g, ' '),
  };

  if (/^protocole-/i.test(nom)) {
    docs.push({
      ...base,
      collection: 'connaissances',
      type: 'protocole',
      theme: nom.replace(/^protocole-/i, '').replace(/\.[a-z]+$/i, ''),
      texte,
    });
    continue;
  }

  // Document propre à un résident : identification par nom + date de naissance (jj.mm.aaaa).
  const t = norm(texte);
  const trouves = residents.filter((r) => t.includes(norm(r.nom)) && texte.includes(r.naissance));
  const m = texte.match(/(\d{2})[./](\d{2})[./](20\d{2})/); // « Date : jj/mm/aaaa » du document
  const date = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12)).toISOString() : new Date().toISOString();

  if (trouves.length === 1) {
    const r = trouves[0];
    docs.push({
      ...base,
      collection: 'patients',
      type: 'document',
      texte,
      patient_id: r.patient_id,
      chambre: r.chambre,
      patient_label: `${r.civilite} ${r.prenom} ${r.nom} (chambre ${r.chambre})`,
      date,
    });
  } else {
    docs.push({
      ...base,
      collection: 'a_verifier',
      type: 'document',
      statut: 'a_verifier',
      motif: trouves.length === 0 ? 'identite_inconnue' : 'identite_ambigue',
      texte,
      date,
    });
  }
}
return docs.map((json) => ({ json }));
