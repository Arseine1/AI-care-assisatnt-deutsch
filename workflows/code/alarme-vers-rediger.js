// Alarme de capteur – du template vers « rédiger » : le prompt assemblé + les faits (alarme comprise) pour le contrôle.
const t = $input.first().json;
const c = $('Ajouter l\'alarme aux faits').first().json;
return [{ json: { ...t, faits: c.faits, patient: c.patient, autres: c.autres, mode: 'a', action: 'contexte_alarme' } }];