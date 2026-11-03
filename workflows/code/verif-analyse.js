// Vérifier le document – ANALYSE COMPLÉMENTAIRE (tâche de fond) : ce que l'assistant IA ajoute aux règles de contrôle.
// Les règles et le texte déjà donnés ne changent pas ; seules les remarques s'ajoutent, marquées « à confirmer ».
const f = $('Règles et fusion').first().json;
const tache = $('Créer la tâche d\'analyse').first().json.id;
const lu = (nom) => {
  try {
    return $(nom).first().json ?? {};
  } catch {
    return {};
  }
};
const echecIA = !lu('Rédiger (extraction)').texte && !lu('Rédiger (comparaison)').texte; // les deux étapes ont échoué
const remarques = (f.contradictions_modele ?? []).map((c) => ({
  type: c.type, gravite: c.gravite, description: c.description, element_lettre: c.element_lettre, element_source: c.element_source, sources: c.sources,
}));
const c = $('Choisir la lettre').first().json;
return [
  {
    json: {
      task_id: tache,
      statut: echecIA ? 'termine_avec_erreurs' : 'termine',
      resultat: {
        remarques,
        alertes: remarques.map((r) => ({ type: 'contradiction', message: r.description })),
        avertissements: f.avertissements ?? [],
        ecartees: f.ecartees_modele ?? 0,
        indisponible: echecIA,
        modele: f.modele ?? null,
      },
      evenement_journal: {
        evenement: 'analyse_complementaire',
        patient_id: c.patient.patient_id,
        mode: 'a',
        action: 'verifier_document',
        prompt_id: 'verifier_document',
        prompt_version: f.prompt_versions,
        modele: f.modele,
        details: { tache_id: tache, remarques_modele: remarques.length, ecartees: f.ecartees_modele ?? 0, indisponible: echecIA },
      },
    },
  },
];