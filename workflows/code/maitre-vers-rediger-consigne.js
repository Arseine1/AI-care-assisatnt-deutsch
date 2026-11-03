// Modus B – von der Vorlage zu « Verfassen »: der zusammengesetzte Prompt + der für die Prüfung der Antwort nötige Kontext.
const t = $input.first().json;
const c = $('Suchen').first().json;
const consigne = $('Anweisung prüfen').first().json.consigne;
return [{ json: { ...t, faits: c.faits, patient: c.patient, autres: c.autres, mode: 'b', action: 'consigne_guidee', consigne } }];
