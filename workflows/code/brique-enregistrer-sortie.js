// Baustein « Speichern » – Ausgang: das Ergebnis der Bestätigung (ohne das Protokollereignis).
const { evenement_journal, ...resultat } = $('Ergebnis der Bestätigung').first().json;
return [{ json: resultat }];
