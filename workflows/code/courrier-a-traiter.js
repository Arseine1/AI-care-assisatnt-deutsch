// Courrier reçu – un élément par lettre PDF indexée (identifiée ou non).
const docs = $('Documents KIM').all().map((i) => i.json).filter((d) => d.source_ref);
return docs.map((d) => ({
  json: {
    source_ref: d.source_ref,
    titre: d.titre ?? 'Lettre de médecin',
    expediteur: d.expediteur ?? 'expéditeur inconnu',
    date: d.date,
    motif: d.motif,
    patient_id: d.patient_id ?? '',
    chambre: d.chambre ?? '',
    patient_label: d.patient_label ?? '',
  },
}));