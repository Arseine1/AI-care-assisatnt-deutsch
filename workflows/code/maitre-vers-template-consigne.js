// Modus B – von « Suchen » zur Vorlage: Die geprüfte Anweisung gelangt HIER, und nur hier,
// in den Platz INSTRUCTION SOIGNANT der gesperrten Vorlage.
const faits = $input.first().json;
const c = $('Anweisung prüfen').first().json;
if (c.accepte !== true) throw new Error('Anweisung nicht akzeptiert.');
return [{ json: { ...faits, prompt_id: 'consigne_guidee', instruction_soignant: c.consigne } }];
