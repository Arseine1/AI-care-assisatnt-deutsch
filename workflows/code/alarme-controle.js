// Sensoralarm – Prüfung der MQTT-Nachricht. NUR das Topic zählt: capteurs/chambre{n}/{type}.
// Der Inhalt der Nachricht wird NIE gelesen: Ein defekter oder manipulierter Sensor kann also keinen Text in das
// System oder in den Prompt der KI einschleusen.
const TYPES = { chute: 'Sturz erkannt', sortie_lit: 'Bettausstieg', appel: 'Ruf des Bewohners' };
const e = $input.first().json ?? {};
const topic = String(e.topic ?? '').slice(0, 80);
const m = topic.match(/^capteurs\/chambre(\d{1,3})\/(chute|sortie_lit|appel)$/);
if (!m) {
  // unbekanntes Topic: kein Alarm, aber die Spur bleibt im Protokoll (das Topic wird bereinigt, der Inhalt nie verwendet)
  return [{ json: { rejete: true, topic: topic.replace(/[^a-z0-9/_-]/gi, '?') } }];
}
return [{ json: { rejete: false, topic, chambre: String(Number(m[1])), type: m[2], libelle: TYPES[m[2]], recue_le: new Date().toISOString() } }];
