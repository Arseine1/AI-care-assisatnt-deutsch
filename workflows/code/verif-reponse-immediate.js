// Dokument prüfen – SOFORTIGE ANTWORT: der Bericht der Kontrollregeln (Code, ohne KI), einem Entwurf zugeordnet.
// Die zusätzliche Analyse des KI-Assistenten läuft, falls aktiviert, anschließend als Hintergrundaufgabe weiter (tache_id).
const f = $('Nur Regeln').first().json;
const b = $('Prüfentwurf erstellen').first().json;
const c = $('Schreiben wählen').first().json;
let tache = null;
try {
  tache = $('Analyseaufgabe erstellen').first().json.id ?? null;
} catch {
  /* KI-Analyse deaktiviert: keine Aufgabe */
}
return [
  {
    json: {
      reponse: {
        brouillon_id: b.id,
        texte: f.texte,
        sources: f.sources,
        alertes: f.alertes,
        avertissements: f.avertissements,
        retirees: [],
        analyse: tache ? { statut: 'en_cours', tache_id: tache } : { statut: 'desactivee' },
      },
      evenement_journal: {
        evenement: 'verification',
        patient_id: c.patient.patient_id,
        mode: 'a',
        action: 'verifier_document',
        prompt_id: 'verifier_document',
        prompt_version: f.prompt_versions,
        details: { brouillon_id: b.id, lettre: f.lettre_ref, contradictions_regles: f.nb_regles, analyse_ia: tache ? 'en_cours' : 'desactivee', tache_id: tache },
      },
    },
  },
];