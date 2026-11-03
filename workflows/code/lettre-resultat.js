// Bestätigter Arztbrief – an den Aufrufer zurückgegebenes Ergebnis und Audit-Ereignis.
const d = $('Entscheiden').first().json;
const ajoutee = d.ajouter === true;
return [
  {
    json: {
      lettre: { ajoutee, motif: ajoutee ? 'Bestätigter Arztbrief zu den Wissensquellen hinzugefügt' : d.motif },
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