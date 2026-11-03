// Anmeldung – Antwort: Token, Pflegekraft und Ablauf der Sitzung.
const j = $('Token erstellen').first().json;
const s = $input.first().json ?? {};
return [{ json: { jeton: j.jeton, soignant: { identifiant: j.identifiant, nom: j.nom }, expire_le: s.expire_le } }];