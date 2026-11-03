// Banc d'essai – du template vers « rédiger » : le prompt assemblé + le contexte nécessaire au contrôle.
const t = $input.first().json;
const c = $('Chercher').first().json;
return [{ json: { ...t, faits: c.faits, patient: c.patient, autres: c.autres, mode: 'a', action: t.prompt_id } }];
