// Anmeldung – PIN-Prüfung: scrypt (Hash mit eigenem Salt je Pflegekraft), Vergleich in konstanter Zeit.
// Eine unbekannte Kennung führt dieselbe Berechnung aus, als gäbe es sie: Die Dauer verrät nicht, ob das Konto existiert.
const crypto = require('crypto');
const demande = $('Anmeldung prüfen').first().json;
const s = $input.first().json ?? {};
const FAUX = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(32);
const [, sel, attendu] = String(s.pin_hash && s.actif ? s.pin_hash : FAUX).split('$');
const calcule = crypto.scryptSync(demande.pin, Buffer.from(sel, 'hex'), 32);
const bon = crypto.timingSafeEqual(calcule, Buffer.from(attendu, 'hex'));
const existe = Boolean(s.identifiant && s.actif && s.pin_hash);
let motif = 'ok';
if (!demande.forme) motif = 'format';
else if (!existe || !bon) motif = 'identifiants';
else if (s.verrouille) motif = 'verrouille'; // auch mit richtiger PIN: Konto nach 5 Fehlversuchen 5 Minuten gesperrt
return [{ json: { autorise: motif === 'ok', motif, identifiant: demande.identifiant, nom: motif === 'ok' ? s.nom : null } }];