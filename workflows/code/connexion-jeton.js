// Connexion – jeton de session : 32 octets aléatoires (43 caractères). Il n'est renvoyé qu'une fois ; la base ne garde que son SHA-256.
const crypto = require('crypto');
const v = $('Vérifier le PIN').first().json;
const jeton = crypto.randomBytes(32).toString('base64url');
return [{ json: { jeton, hash: crypto.createHash('sha256').update(jeton).digest('hex'), identifiant: v.identifiant, nom: v.nom } }];