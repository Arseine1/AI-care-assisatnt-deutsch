// Courrier reçu – alerte d'un courrier RATTACHÉ à un résident. Le rapport des règles de contrôle (sans IA) donne la gravité :
// contradiction = rouge ; aucune contradiction = information (le courrier reste à valider par un soignant).
const lettres = $('Courriers à traiter').all().map((i) => i.json).filter((d) => d.patient_id);
const alertes = $input.all().map((item, i) => {
  const l = lettres[i];
  const r = item.json ?? {};
  const courrier = { titre: l.titre, expediteur: l.expediteur, date: l.date, ref: l.source_ref };
  const resident = l.patient_label.replace(/\s*\(chambre[^)]*\)\s*$/, '');
  const base = { resident, chambre: l.chambre, courrier, source: 'KIM (lettre de médecin)' };
  const contradictions = (Array.isArray(r.alertes) ? r.alertes : []).map((a) => String(a.message ?? '').slice(0, 300));
  if (!r.brouillon_id) {
    return {
      topic: `courrier/${l.source_ref}`, chambre: l.chambre, libelle: 'Courrier reçu : vérification impossible', patient_id: l.patient_id,
      faits: { ...base, gravite: 'attention', avertissement: 'La vérification automatique de ce courrier n\'a pas abouti. Ouvrez « Vérifier le document » pour la relancer.' },
    };
  }
  return {
    topic: `courrier/${l.source_ref}`,
    chambre: l.chambre,
    libelle: contradictions.length ? 'Contradiction dans un courrier' : 'Courrier à valider : aucune contradiction',
    patient_id: l.patient_id,
    faits: { ...base, gravite: contradictions.length ? 'rouge' : 'info', contradictions, brouillon_id: r.brouillon_id },
  };
});
return [{ json: { alertes } }];