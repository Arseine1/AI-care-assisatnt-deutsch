// Sensoralarm – Aktualisierung des RAG-Index: Der gespeicherte Alarm wird ein Dokument der Sammlung « patients »
// (Quelle « Sensoren », Typ « alarme »), dem Bewohner des Zimmers zugeordnet. So sieht ein Dienstbericht oder eine Frage
// im Modus B den Alarm auch ohne Umweg über die Alarmdatenbank.
// Der Text wird vom CODE aus dem MQTT-Topic (Typ, Zimmer, Uhrzeit) gebaut: Der Inhalt der Sensornachricht wird nie gelesen.
// Ohne Bewohner im Zimmer wird nichts indexiert (die Sammlung « patients » enthält nur zugeordnete Dokumente).
const a = $input.first().json ?? {};
const r = $('Bewohner des Zimmers').first().json ?? {};
if (!a.id || !a.patient_id || !r.patient_id) return [];
const TYPES = { chute: 'Sturz', sortie_lit: 'Bettausstieg', appel: 'Ruf' };
const type = TYPES[a.type] ?? 'Alarm';
const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(a.recue_le));
const g = (t) => p.find((x) => x.type === t).value;
const quand = `am ${g('day')}.${g('month')}. um ${g('hour')}:${g('minute')} Uhr`;
return [
  {
    json: {
      collection: 'patients',
      texte: `Sensoralarm (${type}) ${quand}, Zimmer ${a.chambre}.`,
      titre: `Sensoralarm: ${type}`,
      source: 'capteurs',
      source_label: 'Sensoren',
      source_ref: `alarme-${a.id}`,
      type: 'alarme',
      date: new Date(a.recue_le).toISOString(),
      patient_id: r.patient_id,
      chambre: String(r.chambre),
      patient_label: `${r.civilite} ${r.prenom} ${r.nom} (Zimmer ${r.chambre})`,
    },
  },
];
