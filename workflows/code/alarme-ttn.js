// Alarme TTN – traduit un message reçu de The Things Stack (« uplink ») en sujet capteurs/chambre{n}/{type}, le même que celui du broker local.
// Seuls la CHAMBRE (1 à 3 chiffres) et le TYPE (liste fermée : chute, sortie_lit, appel) sont retenus ; aucun autre texte du message n'est repris.
// Un message qui ne se laisse pas traduire donne le sujet « ttn/illisible » : le contrôle suivant le refuse et le trace au journal.
const TYPES = [
  ['chute', /^(chute|fall|fall_?detected|falling)$/],
  ['sortie_lit', /^(sortie_?lit|sortie|bed_?exit|bed_?exit_?detected|bed_?out|out_?of_?bed)$/],
  ['appel', /^(appel|call|call_?button|button|bouton|sos|panic|nurse_?call)$/],
];
const normalise = (v) => String(v ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
const typeDe = (v) => TYPES.find(([, re]) => re.test(normalise(v)))?.[0];

const e = $input.first().json ?? {};
let msg = e.message ?? {};
if (typeof msg === 'string') {
  try { msg = JSON.parse(msg); } catch { msg = {}; }
}
const d = msg?.uplink_message?.decoded_payload ?? {};
const idAppareil = String(msg?.end_device_ids?.device_id ?? '').toLowerCase();

// type : champ du message décodé, sinon un mot du nom de l'appareil (ex. « chambre12-sortie-lit »)
let type = typeDe(d.alarme) ?? typeDe(d.alarm) ?? typeDe(d.type) ?? typeDe(d.event) ?? typeDe(d.evenement);
if (!type) {
  for (const mot of idAppareil.split(/[^a-z0-9]+/)) type ??= typeDe(mot);
  type ??= TYPES.find(([nom]) => idAppareil.includes(nom.replace('_', '-')) || idAppareil.includes(nom))?.[0];
}
// chambre : champ du message décodé, sinon « chambre12 » / « room-12 » dans le nom de l'appareil
let chambre = [d.chambre, d.room, d.room_number].map((v) => String(v ?? '').match(/^\d{1,3}$/)?.[0]).find(Boolean);
chambre ??= idAppareil.match(/(?:chambre|room|ch|zimmer)[-_ ]?(\d{1,3})(?!\d)/)?.[1];

if (!type || !chambre) return [{ json: { topic: 'ttn/illisible', message: '' } }];
return [{ json: { topic: `capteurs/chambre${Number(chambre)}/${type}`, message: '' } }];
