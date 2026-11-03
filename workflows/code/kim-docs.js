// Connecteur « KIM » : lettre de médecin (texte du PDF ou OCR) -> document de la collection « a_verifier ».
//
// Une lettre est TOUJOURS déposée dans « a_verifier » : tant qu'elle n'a pas été contrôlée (contradiction avec
// l'allergie, le traitement, la fonction rénale…), son contenu n'est pas présenté comme fiable.
// Rattachement au résident : le nom ET la date de naissance (jj.mm.aaaa) du courrier doivent correspondre à UN
// seul résident (les deux « Heinz Müller » ne se distinguent que par la date). Sinon on ne devine pas :
// la lettre reste sans patient_id, avec le motif identite_inconnue ou identite_ambigue.
const residents = $('Résidents').all().map((i) => i.json);
const pieces = $('Pièces jointes').all();
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const docs = [];
$input.all().forEach((item, i) => {
  const p = pieces[i].json;
  const texte = String(item.json.texte ?? '').trim();
  if (!texte) return;

  const t = norm(texte);
  const trouves = residents.filter((r) => t.includes(norm(r.nom)) && texte.includes(r.naissance));
  const base = {
    collection: 'a_verifier',
    source: 'kim',
    source_label: 'KIM (lettre de médecin)',
    // Référence stable (expéditeur + nom du fichier) : renvoyer le même courrier ne crée pas de doublon.
    source_ref: `kim/${p.from}/${p.fileName}`,
    type: 'lettre',
    titre: p.subject,
    expediteur: p.expediteur,
    statut: 'a_verifier',
    texte,
    date: new Date(p.date).toISOString(),
  };

  if (trouves.length === 1) {
    const r = trouves[0];
    docs.push({
      ...base,
      motif: 'lettre_a_verifier',
      patient_id: r.patient_id,
      chambre: r.chambre,
      patient_label: `${r.civilite} ${r.prenom} ${r.nom} (chambre ${r.chambre})`,
    });
  } else {
    docs.push({ ...base, motif: trouves.length === 0 ? 'identite_inconnue' : 'identite_ambigue' });
  }
});
return docs.map((json) => ({ json }));
