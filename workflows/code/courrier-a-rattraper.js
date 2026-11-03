// Rattrapage des courriers – messages de Mailpit avec une pièce jointe, arrivés il y a plus d'une minute (le webhook s'en occupe
// peut-être) et ni traités ni déjà pris. Le verrou (soins.courriers_traites, état « en_cours » pendant 15 minutes) évite tout double traitement.
const traites = new Set($('Courriers déjà traités').all().map((i) => i.json.message_id).filter(Boolean));
const messages = $input.first().json?.messages ?? [];
return messages
  .filter((m) => m.Attachments > 0 && !traites.has(m.ID) && Date.now() - new Date(m.Created).getTime() > 60000)
  .map((m) => ({ json: { id: m.ID } }));