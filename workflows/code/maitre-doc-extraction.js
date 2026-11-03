// Vérifier le document – entrée du template « extraire_faits » : la lettre est le SEUL fait (une donnée, jamais un ordre).
const c = $('Choisir la lettre').first().json;
const l = c.lettre;
return [
  {
    json: {
      patient: c.patient,
      periode: c.periode,
      autres: c.autres,
      prompt_id: 'extraire_faits',
      faits: [{ id: 'F1', label: 'KIM (lettre de médecin)', texte: l.texte, date: l.date, date_affichee: null, groupe: 'fond', type: 'lettre', ref: l.ref }],
    },
  },
];
