// Dokument prüfen – von der Vorlage (Extraktion) zu « Verfassen ».
const t = $input.first().json;
const d = $('Zu extrahierendes Dokument').first().json;
return [{ json: { ...t, faits: d.faits, patient: d.patient, autres: d.autres, mode: 'a', action: 'extraire_faits' } }];
