// Vérifier le document – RÉPONSE IMMÉDIATE : le rapport des règles de contrôle (code, sans IA), rattaché à un brouillon.
// L'analyse complémentaire de l'assistant IA, si elle est activée, continue ensuite en tâche de fond (tache_id).
const f = $('Règles seules').first().json;
const b = $('Créer le brouillon de vérification').first().json;
const c = $('Choisir la lettre').first().json;
let tache = null;
try {
  tache = $('Créer la tâche d\'analyse').first().json.id ?? null;
} catch {
  /* analyse IA désactivée : pas de tâche */
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