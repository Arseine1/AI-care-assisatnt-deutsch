// Anmeldung – Sitzungstoken: 32 zufällige Bytes (43 Zeichen). Es wird nur einmal zurückgegeben; die Datenbank speichert nur den SHA-256-Hash.
const crypto = require('crypto');
const v = $('PIN überprüfen').first().json;
const jeton = crypto.randomBytes(32).toString('base64url');
return [{ json: { jeton, hash: crypto.createHash('sha256').update(jeton).digest('hex'), identifiant: v.identifiant, nom: v.nom } }];