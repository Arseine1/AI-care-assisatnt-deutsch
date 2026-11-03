// Mode B – réponse au front pour une consigne refusée : rien n'a été envoyé à l'IA.
const c = $('Contrôler la consigne').first().json;
return [{ json: { refuse: true, motif: c.motif, message: c.message } }];
