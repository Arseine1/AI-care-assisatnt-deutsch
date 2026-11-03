// Dokument prüfen – ZUSÄTZLICHE ANALYSE (Hintergrundaufgabe): was der KI-Assistent zu den Kontrollregeln hinzufügt.
// Die Regeln und der bereits gelieferte Text ändern sich nicht; nur die Anmerkungen kommen hinzu, als « zu prüfen » gekennzeichnet.
const f = $('Regeln und Zusammenführung').first().json;
const tache = $('Analyseaufgabe erstellen').first().json.id;
const lu = (nom) => {
  try {
    return $(nom).first().json ?? {};
  } catch {
    return {};
  }
};
const echecIA = !lu('Verfassen (Extraktion)').texte && !lu('Verfassen (Vergleich)').texte; // beide Schritte sind fehlgeschlagen
const remarques = (f.contradictions_modele ?? []).map((c) => ({
  type: c.type, gravite: c.gravite, description: c.description, element_lettre: c.element_lettre, element_source: c.element_source, sources: c.sources,
}));
const c = $('Schreiben wählen').first().json;
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