// TTN-Alarm – übersetzt eine von The Things Stack empfangene Nachricht (« Uplink ») in ein Topic capteurs/chambre{n}/{type}, dasselbe wie das des lokalen Brokers.
// Nur das ZIMMER (1 bis 3 Ziffern) und der TYP (geschlossene Liste: chute, sortie_lit, appel) werden übernommen; kein anderer Text der Nachricht wird übernommen.
// Eine Nachricht, die sich nicht übersetzen lässt, ergibt das Topic « ttn/illisible »: Die nächste Prüfung lehnt es ab und hält es im Protokoll fest.
const TYPES = [
  ['chute', /^(chute|fall|fall_?detected|falling|sturz|gestuerzt|gestürzt|sturz_?erkannt)$/],
  ['sortie_lit', /^(sortie_?lit|sortie|bed_?exit|bed_?exit_?detected|bed_?out|out_?of_?bed|bettausstieg|bett_?verlassen|bett_?aus)$/],
  ['appel', /^(appel|call|call_?button|button|bouton|sos|panic|nurse_?call|ruf|notruf|rufknopf|klingel|schwesternruf)$/],
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

// Typ: Feld der dekodierten Nachricht, sonst ein Wort aus dem Gerätenamen (z. B. « chambre12-sortie-lit »)
let type = typeDe(d.alarme) ?? typeDe(d.alarm) ?? typeDe(d.type) ?? typeDe(d.event) ?? typeDe(d.evenement);
if (!type) {
  for (const mot of idAppareil.split(/[^a-z0-9]+/)) type ??= typeDe(mot);
  type ??= TYPES.find(([nom]) => idAppareil.includes(nom.replace('_', '-')) || idAppareil.includes(nom))?.[0];
}
// Zimmer: Feld der dekodierten Nachricht, sonst « chambre12 » / « room-12 » / « zimmer12 » im Gerätenamen
let chambre = [d.chambre, d.room, d.room_number, d.zimmer].map((v) => String(v ?? '').match(/^\d{1,3}$/)?.[0]).find(Boolean);
chambre ??= idAppareil.match(/(?:chambre|room|ch|zimmer)[-_ ]?(\d{1,3})(?!\d)/)?.[1];

if (!type || !chambre) return [{ json: { topic: 'ttn/illisible', message: '' } }];
return [{ json: { topic: `capteurs/chambre${Number(chambre)}/${type}`, message: '' } }];
