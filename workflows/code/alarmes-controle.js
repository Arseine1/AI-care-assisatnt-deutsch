// Angezeigte Alarme – Prüfung der Anfrage der Oberfläche:
//   { }                          die nicht quittierten Alarme
//   { historique: true }         + die quittierten Alarme der letzten 24 Stunden
//   { acquitter: "<uuid>" }      quittiert einen Alarm
const e = $input.first().json?.body ?? {};
let acquitter = '';
if (e.acquitter !== undefined) {
  acquitter = String(e.acquitter);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(acquitter)) throw new Error('acquitter: ungültige Kennung');
}
return [{ json: { acquitter, historique: e.historique === true ? 'true' : '' } }];
