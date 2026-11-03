// KIM-Konnektor: Arztbrief (PDF-Text oder OCR) -> Dokument der Collection « a_verifier ».
//
// Ein Arztbrief wird IMMER in « a_verifier » abgelegt: Solange er nicht geprüft wurde (Widerspruch zu
// Allergie, Behandlung, Nierenfunktion …), wird sein Inhalt nicht als verlässlich dargestellt.
// Zuordnung zum Bewohner: Name UND Geburtsdatum (TT.MM.JJJJ) des Schreibens müssen zu GENAU EINEM
// Bewohner passen (die beiden „Heinz Müller“ unterscheiden sich nur durch das Datum). Sonst wird nicht geraten:
// Der Brief bleibt ohne patient_id, mit dem Motiv identite_inconnue oder identite_ambigue.
const residents = $('Bewohnerliste').all().map((i) => i.json);
const pieces = $('Anhänge').all();
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
    source_label: 'KIM (Arztbrief)',
    // Stabile Referenz (Absender + Dateiname): Das erneute Senden desselben Schreibens erzeugt kein Duplikat.
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
      patient_label: `${r.civilite} ${r.prenom} ${r.nom} (Zimmer ${r.chambre})`,
    });
  } else {
    docs.push({ ...base, motif: trouves.length === 0 ? 'identite_inconnue' : 'identite_ambigue' });
  }
});
return docs.map((json) => ({ json }));
