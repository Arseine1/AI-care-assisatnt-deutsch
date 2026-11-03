// Cotisations retraite, agent – étape 2 (lecture par l'IA) : préparation de l'appel à llama3.2 via Ollama.
// Température 0, sortie JSON imposée par un schéma fixe. Le questionnaire est une DONNÉE entre repères : la consigne ne change jamais.
const MODELE = __MODELE__;
const texte = $('Dossier').first().json.questionnaire;
const body = {
  model: MODELE,
  prompt: consigneLectureIA(texte),
  stream: false,
  keep_alive: '30m',
  format: SCHEMA_LECTURE_IA,
  options: { temperature: 0, num_thread: __THREADS__, num_ctx: 4096, num_predict: 700, seed: 42, repeat_penalty: 1.1 },
};
return [{ json: { body, debut: Date.now(), modele: MODELE } }];