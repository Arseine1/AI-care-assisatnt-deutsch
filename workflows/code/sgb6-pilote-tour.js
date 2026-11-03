// Rentenbeiträge, gesteuerter Agent – EINE RUNDE (Unterworkflow): Der Wächter prüft den vom Modell gewählten Werkzeugaufruf, dann führt der Code ihn
// auf dem Zustand der Akte aus. Das Modell übergibt weder Betrag noch Pflegegrad noch Regelergebnis; es hat kein Werkzeug « valider » oder « refuser ».
// Nur die Extraktion durch die KI (Werkzeug extraire_champs_par_ia) ruft hier ein Modell auf: Ollama /api/generate, Temperatur 0, JSON-Schema vorgegeben.
const CAISSE = __CAISSE__;
const { reponse, sess } = $input.first().json;
const appelerIA = async (corps) => {
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'http://host.docker.internal:11434/api/generate', body: corps, json: true, timeout: 240000 });
  return r.response;
};
const { s, ligne } = await tourDeModele(sess, reponse, { caisse: CAISSE, appelerIA, modeleExtraction: __MODELE__ });
return [{ json: { sess: s, ligne } }];
