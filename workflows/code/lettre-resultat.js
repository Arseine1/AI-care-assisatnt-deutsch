// Lettre validée – résultat renvoyé à l'appelant, et événement d'audit.
const d = $('Décider').first().json;
const ajoutee = d.ajouter === true;
return [
  {
    json: {
      lettre: { ajoutee, motif: ajoutee ? 'lettre validée ajoutée aux sources d\'intelligence' : d.motif },
      evenement_journal: {
        evenement: ajoutee ? 'lettre_validee' : 'lettre_non_ajoutee',
        patient_id: d.patient_id ?? null,
        mode: 'a',
        action: 'verifier_document',
        details: { lettre: d.lettre_ref ?? null, motif: ajoutee ? 'ajoutee' : d.motif },
      },
    },
  },
];