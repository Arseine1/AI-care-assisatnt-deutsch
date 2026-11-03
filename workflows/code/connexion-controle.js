// Anmeldung – Prüfung der Form der Zugangsdaten. Die Kennung ist ein Kontoname (Kleinbuchstaben, Ziffern, . _ -), die PIN hat 4 bis 8 Ziffern.
const b = $input.first().json?.body ?? {};
const identifiant = String(b.identifiant ?? '').trim().toLowerCase();
const pin = String(b.pin ?? '');
const forme = /^[a-z0-9._-]{2,40}$/.test(identifiant) && /^\d{4,8}$/.test(pin);
return [{ json: { identifiant: forme ? identifiant : 'format-invalide', pin: forme ? pin : '', forme } }];