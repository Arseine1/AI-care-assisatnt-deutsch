// Sensoralarm – vom Template zu « Verfassen »: der zusammengesetzte Prompt + die Fakten (Alarm eingeschlossen) für die Prüfung.
const t = $input.first().json;
const c = $('Alarm zu den Fakten hinzufügen').first().json;
return [{ json: { ...t, faits: c.faits, patient: c.patient, autres: c.autres, mode: 'a', action: 'contexte_alarme' } }];
