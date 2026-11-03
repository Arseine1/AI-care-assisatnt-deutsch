// Connexion – contrôle de la forme des identifiants. L'identifiant est un nom de compte (minuscules, chiffres, . _ -), le code PIN a 4 à 8 chiffres.
const b = $input.first().json?.body ?? {};
const identifiant = String(b.identifiant ?? '').trim().toLowerCase();
const pin = String(b.pin ?? '');
const forme = /^[a-z0-9._-]{2,40}$/.test(identifiant) && /^\d{4,8}$/.test(pin);
return [{ json: { identifiant: forme ? identifiant : 'format-invalide', pin: forme ? pin : '', forme } }];