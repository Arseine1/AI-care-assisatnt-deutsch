// Konnektor « Dateien »: eine Datei = ein Dokument.
//  - protocole-*.md          -> Collection « connaissances » (allgemeine Regeln, ohne Patient)
//  - anderes Dokument (Scan) -> EINEM Bewohner zugeordnet, wenn Name UND Geburtsdatum des Textes übereinstimmen
//                               (Namensgleiche unterscheiden sich nur durch das Geburtsdatum);
//                               sonst Collection « a_verifier »: Die Identität wird nie geraten.
const residents = $('Bewohnerliste').all().map((i) => i.json);
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const docs = [];
for (const { json: f } of $input.all()) {
  const nom = f.nom;
  const texte = (f.texte ?? '').trim();
  if (!texte) continue;

  const base = {
    source: 'fichier',
    source_label: 'Dateien',
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

  // Dokument eines einzelnen Bewohners: Identifizierung über Name + Geburtsdatum (TT.MM.JJJJ).
  const t = norm(texte);
  const trouves = residents.filter((r) => t.includes(norm(r.nom)) && texte.includes(r.naissance));
  const m = texte.match(/(\d{2})[./](\d{2})[./](20\d{2})/); // „Datum: TT/MM/JJJJ“ des Dokuments
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
      patient_label: `${r.civilite} ${r.prenom} ${r.nom} (Zimmer ${r.chambre})`,
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
