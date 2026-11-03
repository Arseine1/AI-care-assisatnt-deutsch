// Vérifier le document – réponse au front (rapport rédigé par le code, rattaché à un brouillon) + événement d'audit.
const f = $('Règles et fusion').first().json;
const b = $('Créer le brouillon de vérification').first().json;
const c = $('Choisir la lettre').first().json;
return [
  {
    json: {
      brouillon_id: b.id,
      texte: f.texte,
      sources: f.sources,
      alertes: f.alertes,
      avertissements: f.avertissements,
      evenement_journal: {
        evenement: 'verification',
        patient_id: c.patient.patient_id,
        mode: 'a',
        action: 'verifier_document',
        prompt_id: 'verifier_document',
        prompt_version: f.prompt_versions,
        modele: f.modele,
        details: {
          brouillon_id: b.id,
          lettre: f.lettre_ref,
          contradictions_regles: f.nb_regles,
          contradictions_modele_seul: f.nb_modele,
          avertissements: f.avertissements.map((a) => a.type),
        },
      },
    },
  },
];
