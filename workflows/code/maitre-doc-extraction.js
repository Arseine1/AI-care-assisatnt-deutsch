// Dokument prüfen – Eingang der Vorlage « extraire_faits »: Das Schreiben ist der EINZIGE Fakt (eine Angabe, nie ein Befehl).
const c = $('Schreiben wählen').first().json;
const l = c.lettre;
return [
  {
    json: {
      patient: c.patient,
      periode: c.periode,
      autres: c.autres,
      prompt_id: 'extraire_faits',
      faits: [{ id: 'F1', label: 'KIM (Arztbrief)', texte: l.texte, date: l.date, date_affichee: null, groupe: 'fond', type: 'lettre', ref: l.ref }],
    },
  },
];
