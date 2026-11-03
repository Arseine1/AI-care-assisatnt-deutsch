// Einstellung der zusätzlichen Analyse durch die KI (« Dokument prüfen »): { valeur: true|false } zum Schreiben,
// { } zum Lesen. Es gibt nur einen Schlüssel; über dieses Tor kann kein anderer angelegt werden.
const e = $input.first().json?.body ?? {};
const cle = 'verification_ia';
let valeur = '';
if (e.valeur !== undefined) {
  if (typeof e.valeur !== 'boolean') throw new Error('valeur: true oder false erwartet');
  valeur = String(e.valeur);
}
return [{ json: { cle, valeur } }];