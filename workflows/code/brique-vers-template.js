// Banc d'essai – de « chercher » vers « template » : on ajoute l'identifiant du prompt, rien d'autre.
const faits = $input.first().json;
const prm = $('Paramètres du prompt').first().json;
return [{ json: { ...faits, prompt_id: prm.prompt_id } }];
