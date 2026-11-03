// Vérifier le document – faits du prompt « comparer » : les faits du résident + la lettre (données extraites par
// l'IA, ou texte brut si l'extraction a échoué : les règles, elles, lisent toujours le texte de la lettre).
const c = $('Choisir la lettre').first().json;
const r = $('Rédiger (extraction)').first().json ?? {};
let objet = null;
try {
  objet = JSON.parse(r.texte ?? '');
} catch {
  /* extraction illisible : on retombe sur le texte brut */
}
const l = c.lettre;
let texteLettre;
if (objet && typeof objet === 'object' && !Array.isArray(objet)) {
  const meds = (Array.isArray(objet.medicaments) ? objet.medicaments : []).map(
    (m) => `${m?.nom ?? '?'}${m?.dose ? ' ' + m.dose : ''}${m?.frequence ? ', ' + m.frequence : ''}${m?.duree ? ', ' + m.duree : ''}${m?.action ? ' (' + m.action + ')' : ''}`,
  );
  const liste = (a) => (Array.isArray(a) && a.length ? a.join(' ; ') : null);
  texteLettre =
    `Lettre à vérifier (données extraites) : patient ${[objet.patient?.prenom, objet.patient?.nom].filter(Boolean).join(' ') || 'inconnu'}, né le ${objet.patient?.naissance ?? 'date inconnue'}. ` +
    `Diagnostics : ${liste(objet.diagnostics) ?? 'aucun'}. Médicaments : ${meds.join(' ; ') || 'aucun'}. Recommandations : ${liste(objet.autres_recommandations) ?? 'aucune'}.`;
} else {
  texteLettre = `Lettre à vérifier (texte brut) : ${String(l.texte).slice(0, 1500)}`;
}
const faits = [
  ...c.faits,
  { id: `F${c.faits.length + 1}`, label: 'KIM (lettre de médecin)', texte: texteLettre, date: l.date, date_affichee: null, groupe: 'fond', type: 'lettre', ref: l.ref },
];
return [{ json: { patient: c.patient, periode: c.periode, autres: c.autres, faits, prompt_id: 'comparer' } }];
