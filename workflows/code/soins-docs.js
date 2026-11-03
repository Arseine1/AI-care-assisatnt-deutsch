// Konnektor « Pflegesoftware »: wandelt die Notizen und Bewohnerakten in zu indexierende Dokumente um.
// Eine kurze Notiz bleibt ein ganzer Abschnitt (das genaue Datum zu behalten erlaubt das Filtern nach „den letzten 12 Stunden“);
// die Zerlegung des Indexers in 300–500 Wörter gilt nur für längere Texte.
const iso = (d) => new Date(d).toISOString();
const etiquette = (r) => `${r.civilite} ${r.prenom} ${r.nom} (Zimmer ${r.chambre})`;
const base = { source: 'logiciel_soins', source_label: 'Pflegesoftware', collection: 'patients' };

const docs = [];

for (const { json: n } of $('Aktuelle Notizen').all()) {
  docs.push({
    ...base,
    type: 'note',
    titre: `Pflegenotiz (${n.categorie}) von ${n.auteur}`,
    texte: n.texte,
    source_ref: `note-${n.id}`,
    patient_id: n.patient_id,
    chambre: n.chambre,
    patient_label: etiquette(n),
    categorie: n.categorie,
    date: iso(n.horodatage),
  });
}

for (const { json: f } of $('Bewohnerakten').all()) {
  const liste = (a, vide) => (a && a.length ? a.join(' ; ') : vide);
  const texte = [
    `Bewohnerakte: ${etiquette(f)}, geboren am ${f.naissance}, Etage ${f.etage}.`,
    `Diagnosen: ${liste(f.diagnostics, 'keine')}.`,
    `Allergien: ${liste(f.allergies, 'keine bekannt')}.`,
    `Ernährung: ${(f.regime ?? 'nicht angegeben').replace(/\.\s*$/, '')}.`,
    `Risiken: ${liste(f.risques, 'keine gemeldet')}.`,
    `Medikationsplan: ${f.medication ?? 'keiner'}.`,
    `Letzte Vitalwerte: ${f.vitaux ?? 'keine'}.`,
  ].join('\n');
  docs.push({
    ...base,
    type: 'fiche',
    titre: 'Bewohnerakte (Pflegesoftware)',
    texte,
    source_ref: `fiche-${f.patient_id}`,
    patient_id: f.patient_id,
    chambre: f.chambre,
    patient_label: etiquette(f),
    date: iso(f.maj ?? f.admission),
  });
}

return docs.map((json) => ({ json }));
