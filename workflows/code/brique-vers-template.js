// Prüfstand – von « Suchen » zu « Template »: Es wird die Kennung des Prompts hinzugefügt, sonst nichts.
const faits = $input.first().json;
const prm = $('Prompt-Parameter').first().json;
return [{ json: { ...faits, prompt_id: prm.prompt_id } }];
