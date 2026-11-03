// Dokument prüfen – Antwort an die Oberfläche (vom Code verfasster Bericht, einem Entwurf zugeordnet) + Prüfereignis.
const f = $('Regeln und Zusammenführung').first().json;
const b = $('Prüfentwurf erstellen').first().json;
const c = $('Schreiben wählen').first().json;
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
