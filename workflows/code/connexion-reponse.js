// Connexion – réponse : jeton, soignant et fin de validité de la session.
const j = $('Créer le jeton').first().json;
const s = $input.first().json ?? {};
return [{ json: { jeton: j.jeton, soignant: { identifiant: j.identifiant, nom: j.nom }, expire_le: s.expire_le } }];