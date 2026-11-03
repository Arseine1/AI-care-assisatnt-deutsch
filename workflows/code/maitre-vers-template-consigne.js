// Mode B – de « chercher » vers le template : la consigne contrôlée entre ICI, et seulement ici,
// dans l'emplacement INSTRUCTION SOIGNANT du template verrouillé.
const faits = $input.first().json;
const c = $('Contrôler la consigne').first().json;
if (c.accepte !== true) throw new Error('Consigne non acceptée.');
return [{ json: { ...faits, prompt_id: 'consigne_guidee', instruction_soignant: c.consigne } }];
