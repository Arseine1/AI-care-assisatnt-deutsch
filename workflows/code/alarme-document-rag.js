// Alarme de capteur – mise à jour de l'index du RAG : l'alarme enregistrée devient un document de la collection « patients »
// (source « Capteurs », type « alarme »), rattaché au résident de la chambre. Ainsi un rapport de garde ou une question
// du Mode B voit l'alarme même sans passer par la base de l'alarme.
// Le texte est construit par le CODE à partir du sujet MQTT (type, chambre, heure) : le contenu du message du capteur n'est jamais lu.
// Sans résident dans la chambre, rien n'est indexé (la collection « patients » ne contient que des documents rattachés).
const a = $input.first().json ?? {};
const r = $('Résident de la chambre').first().json ?? {};
if (!a.id || !a.patient_id || !r.patient_id) return [];
const TYPES = { chute: 'chute', sortie_lit: 'sortie de lit', appel: 'appel' };
const type = TYPES[a.type] ?? 'alarme';
const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(a.recue_le));
const g = (t) => p.find((x) => x.type === t).value;
const quand = `${g('day')}.${g('month')}. à ${g('hour')}h${g('minute')}`;
return [
  {
    json: {
      collection: 'patients',
      texte: `Alarme de capteur (${type}) le ${quand}, chambre ${a.chambre}.`,
      titre: `Alarme de capteur : ${type}`,
      source: 'capteurs',
      source_label: 'Capteurs',
      source_ref: `alarme-${a.id}`,
      type: 'alarme',
      date: new Date(a.recue_le).toISOString(),
      patient_id: r.patient_id,
      chambre: String(r.chambre),
      patient_label: `${r.civilite} ${r.prenom} ${r.nom} (chambre ${r.chambre})`,
    },
  },
];
