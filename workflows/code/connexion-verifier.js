// Connexion – vérification du PIN : scrypt (haché avec un sel propre à chaque soignant), comparaison à temps constant.
// Un identifiant inconnu fait le même calcul que s'il existait : la durée ne révèle pas si le compte existe.
const crypto = require('crypto');
const demande = $('Contrôler la connexion').first().json;
const s = $input.first().json ?? {};
const FAUX = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(32);
const [, sel, attendu] = String(s.pin_hash && s.actif ? s.pin_hash : FAUX).split('$');
const calcule = crypto.scryptSync(demande.pin, Buffer.from(sel, 'hex'), 32);
const bon = crypto.timingSafeEqual(calcule, Buffer.from(attendu, 'hex'));
const existe = Boolean(s.identifiant && s.actif && s.pin_hash);
let motif = 'ok';
if (!demande.forme) motif = 'format';
else if (!existe || !bon) motif = 'identifiants';
else if (s.verrouille) motif = 'verrouille'; // même avec le bon PIN : compte verrouillé 5 minutes après 5 échecs
return [{ json: { autorise: motif === 'ok', motif, identifiant: demande.identifiant, nom: motif === 'ok' ? s.nom : null } }];