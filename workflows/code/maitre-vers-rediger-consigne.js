// Mode B – du template vers « rédiger » : le prompt assemblé + le contexte nécessaire au contrôle de la réponse.
const t = $input.first().json;
const c = $('Chercher').first().json;
const consigne = $('Contrôler la consigne').first().json.consigne;
return [{ json: { ...t, faits: c.faits, patient: c.patient, autres: c.autres, mode: 'b', action: 'consigne_guidee', consigne } }];
