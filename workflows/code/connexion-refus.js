// Connexion – refus : un message identique pour un mauvais identifiant et un mauvais PIN ; seul le verrouillage est signalé.
const v = $('Vérifier le PIN').first().json;
return [{ json: { erreur: v.motif === 'verrouille' ? 'verrouille' : 'identifiants' } }];