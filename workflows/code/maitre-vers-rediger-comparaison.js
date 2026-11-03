// Vérifier le document – du template (comparaison) vers « rédiger ».
const t = $input.first().json;
const d = $('Faits pour comparer').first().json;
return [{ json: { ...t, faits: d.faits, patient: d.patient, autres: d.autres, mode: 'a', action: 'comparer' } }];
