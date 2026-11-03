// Vérifier le document – du template (extraction) vers « rédiger ».
const t = $input.first().json;
const d = $('Document à extraire').first().json;
return [{ json: { ...t, faits: d.faits, patient: d.patient, autres: d.autres, mode: 'a', action: 'extraire_faits' } }];
