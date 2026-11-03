// Rapport de garde d'un étage – un élément par résident, traités l'un après l'autre par le sous-workflow « rapport de garde ».
// Le prompt est FIXÉ ici (generer_sbar) : l'étage ne peut demander rien d'autre.
const tache = $('Entrée').first().json.task_id;
const residents = $('Résidents de l\'étage').all().map((i) => i.json).filter((r) => r.patient_id);
return residents.map((r) => ({ json: { patient_id: r.patient_id, prompt_id: 'generer_sbar', task_id: tache } }));
