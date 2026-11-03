// Eingegangene Post – ein Element je indexiertem PDF-Schreiben (zugeordnet oder nicht).
const docs = $('KIM-Dokumente').all().map((i) => i.json).filter((d) => d.source_ref);
return docs.map((d) => ({
  json: {
    source_ref: d.source_ref,
    titre: d.titre ?? 'Arztbrief',
    expediteur: d.expediteur ?? 'Absender unbekannt',
    date: d.date,
    motif: d.motif,
    patient_id: d.patient_id ?? '',
    chambre: d.chambre ?? '',
    patient_label: d.patient_label ?? '',
  },
}));