// Dienstbericht einer Etage – ein Element je Bewohner, nacheinander vom Unter-Workflow « Dienstbericht » verarbeitet.
// Der Prompt ist hier FEST vorgegeben (generer_sbar): Die Etage kann nichts anderes anfordern.
const tache = $('Eingang').first().json.task_id;
const residents = $('Bewohner der Etage').all().map((i) => i.json).filter((r) => r.patient_id);
return residents.map((r) => ({ json: { patient_id: r.patient_id, prompt_id: 'generer_sbar', task_id: tache } }));
