// Dokument prüfen – von der Vorlage (Vergleich) zu « Verfassen ».
const t = $input.first().json;
const d = $('Fakten zum Vergleichen').first().json;
return [{ json: { ...t, faits: d.faits, patient: d.patient, autres: d.autres, mode: 'a', action: 'comparer' } }];
