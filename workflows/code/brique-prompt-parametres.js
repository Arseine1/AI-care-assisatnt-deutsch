// Paramètres d'un prompt (période, mots de recherche, protocoles) : lus dans prompts/*.md, jamais fournis par
// l'interface. L'interface ne peut donc ni choisir ni modifier ce qui est demandé à l'IA, seulement quelle
// action lancer et pour quel résident.
const PROMPTS = __PROMPTS__;

// Corps de la requête HTTP du webhook, ou objet déjà contrôlé par un workflow d'entrée : seuls patient_id et prompt_id sont lus.
const e = $input.first().json?.body ?? $input.first().json ?? {};
const prompt_id = String(e.prompt_id ?? '');
const p = PROMPTS[prompt_id];
if (!p) throw new Error(`Prompt inconnu : « ${prompt_id} »`);
return [
  {
    json: {
      patient_id: e.patient_id,
      prompt_id,
      heures: p.heures,
      requete: p.requete,
      protocoles: p.protocoles,
      rapports_valides: p.rapports_valides === true,
      max_faits: p.max_faits,
      sources_prioritaires: p.sources_prioritaires,
    },
  },
];
