// Alarmes affichées – contrôle de la demande de l'interface :
//   { }                          les alarmes non acquittées
//   { historique: true }         + les alarmes acquittées des 24 dernières heures
//   { acquitter: "<uuid>" }      acquitte une alarme
const e = $input.first().json?.body ?? {};
let acquitter = '';
if (e.acquitter !== undefined) {
  acquitter = String(e.acquitter);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(acquitter)) throw new Error('acquitter : identifiant invalide');
}
return [{ json: { acquitter, historique: e.historique === true ? 'true' : '' } }];