// Cotisations retraite – lancer l'agent : { id, lecture_ia, pilote, modele }. Aucun texte libre : un identifiant de dossier, un booléen, et le pilote
// (« modele » = piloté par un modèle local ; « guidee » = mission guidée par le code, défaut).
const e = $input.first().json?.body ?? {};
const id = String(e.id ?? '');
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error('id de dossier invalide');
const pilote = e.pilote === undefined ? 'guidee' : String(e.pilote);
if (!['modele', 'guidee'].includes(pilote)) throw new Error('pilote invalide');
// modele : le modèle local qui pilote l'agent, choisi dans la page. Liste FERMÉE (jamais un nom libre : il part dans une requête vers Ollama).
const PERMIS = __SGB6_MODELES__;
const modele = e.modele === undefined || e.modele === '' ? __SGB6_MODELE__ : String(e.modele);
if (!PERMIS.includes(modele)) throw new Error(`modèle non permis : ${modele.slice(0, 40)}`);
return [{ json: { id, lecture_ia: e.lecture_ia === true, pilote, modele } }];