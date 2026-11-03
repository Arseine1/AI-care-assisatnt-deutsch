// Nach der Bestätigung – Ausgang des Unter-Workflows (ohne die Protokollereignisse).
const { evenements_journal, ...resultat } = $('Zusammenfassung').first().json;
return [{ json: resultat }];
