// Brique « rédiger » – événement d'audit « generation » (sans le texte : il est dans le brouillon).
const s = $input.first().json;
return [
  {
    json: {
      evenement: 'generation',
      patient_id: s.patient.patient_id,
      mode: s.mode,
      action: s.action,
      prompt_id: s.prompt_id,
      prompt_version: s.prompt_version,
      modele: s.modele,
      duree_ms: s.duree_ms,
      details: {
        brouillon_id: s.brouillon_id,
        nb_faits: s.faits.length,
        avertissements: s.avertissements.map((a) => a.type),
        nb_phrases_retirees: (s.retirees ?? []).length,
        tokens: s.tokens,
      },
    },
  },
];
