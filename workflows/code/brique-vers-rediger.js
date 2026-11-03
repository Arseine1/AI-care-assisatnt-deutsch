// Prüfstand – vom Template zu « Verfassen »: der zusammengesetzte Prompt + der für die Prüfung nötige Kontext.
const t = $input.first().json;
const c = $('Suchen').first().json;
return [{ json: { ...t, faits: c.faits, patient: c.patient, autres: c.autres, mode: 'a', action: t.prompt_id } }];
