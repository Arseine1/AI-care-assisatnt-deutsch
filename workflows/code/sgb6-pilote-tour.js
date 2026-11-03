// Cotisations retraite, agent piloté – UN TOUR (sous-workflow) : la garde contrôle l'appel d'outil choisi par le modèle, puis le code l'exécute
// sur l'état du dossier. Le modèle ne passe ni montant, ni degré, ni résultat de règle ; il n'a aucun outil « valider » ni « refuser ».
// Seule l'extraction par l'IA (outil extraire_champs_par_ia) appelle un modèle ici : Ollama /api/generate, température 0, schéma JSON imposé.
const CAISSE = __CAISSE__;
const { reponse, sess } = $input.first().json;
const appelerIA = async (corps) => {
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'http://host.docker.internal:11434/api/generate', body: corps, json: true, timeout: 240000 });
  return r.response;
};
const { s, ligne } = await tourDeModele(sess, reponse, { caisse: CAISSE, appelerIA, modeleExtraction: __MODELE__ });
return [{ json: { sess: s, ligne } }];