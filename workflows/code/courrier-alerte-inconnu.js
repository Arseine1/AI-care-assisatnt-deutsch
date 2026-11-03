// Eingegangene Post – Meldung zu einem NICHT zugeordneten Schreiben: Name und Geburtsdatum passen zu keinem oder zu mehreren Bewohnern.
// Das Schreiben bleibt in « a_verifier », ohne Bewohner: Es wird nie geraten.
const alertes = $input.all().map((i) => i.json).map((l) => ({
  topic: `courrier/${l.source_ref}`,
  chambre: '',
  libelle: 'Schreiben nicht zugeordnet',
  patient_id: '',
  faits: {
    gravite: 'attention',
    courrier: { titre: l.titre, expediteur: l.expediteur, date: l.date, ref: l.source_ref },
    avertissement: l.motif === 'identite_ambigue'
      ? 'Name und Geburtsdatum des Schreibens passen zu mehreren Bewohnern: Das Schreiben ist niemandem zugeordnet.'
      : 'Name und Geburtsdatum des Schreibens passen zu keinem Bewohner: Das Schreiben ist niemandem zugeordnet.',
    source: 'KIM (Arztbrief)',
  },
}));
return [{ json: { alertes } }];