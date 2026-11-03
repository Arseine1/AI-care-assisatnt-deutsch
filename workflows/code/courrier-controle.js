// Courrier reçu – contrôle de la notification de Mailpit. Seul l'identifiant du message est lu ; le contenu de la notification est
// ignoré : le message est relu par l'API de Mailpit (même source que le connecteur KIM).
const b = $input.first().json?.body ?? {};
const id = String(b.ID ?? '');
if (!/^[A-Za-z0-9]{6,40}$/.test(id)) throw new Error('identifiant de message invalide');
return [{ json: { id } }];