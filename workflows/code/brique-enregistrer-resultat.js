// Brique « enregistrer » – résultat de la validation, et événement d'audit associé.
const c = $('Contrôler la validation').first().json;
const v = $('Valider le brouillon').first().json;

const resultat = v.validation_id
  ? {
      ok: true,
      validation_id: v.validation_id,
      brouillon_id: c.brouillon_id,
      patient_id: v.patient_id,
      mode: v.mode,
      action: v.action,
      modifiee: v.modifiee,
      texte: c.texte,
      valide_par: c.valide_par,
      soignant_id: c.soignant_id,
    }
  : { ok: false, erreur: 'Brouillon introuvable ou déjà validé.', brouillon_id: c.brouillon_id };

return [
  {
    json: {
      ...resultat,
      evenement_journal: {
        evenement: resultat.ok ? 'validation' : 'validation_refusee',
        patient_id: resultat.patient_id ?? null,
        mode: resultat.mode ?? null,
        action: resultat.action ?? null,
        details: { brouillon_id: c.brouillon_id, modifiee: resultat.modifiee ?? null, valide_par: c.valide_par, soignant_id: c.soignant_id || null },
      },
    },
  },
];
