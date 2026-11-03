// Bestätigter Arztbrief – Ausgang des Unter-Workflows (ohne das Protokollereignis).
const { evenement_journal, ...r } = $('Ergebnis').first().json;
return [{ json: r }];