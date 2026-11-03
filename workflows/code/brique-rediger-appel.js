// Brique « rédiger » – préparation de l'appel au modèle de langue (Ollama), température 0,1.
// L'entrée est la sortie du template (champ « prompt ») : aucun autre texte n'est envoyé à l'IA.
const e = $input.first().json;
if (typeof e.prompt !== 'string' || !e.prompt.includes('[RÔLE ET RÈGLES]') || !e.prompt.includes('[FORMAT DE SORTIE]')) {
  throw new Error('Prompt non verrouillé : seul le template peut fournir le texte envoyé à l\'IA.');
}
// Modèle intégré à la génération (workflows/generer.mjs, variable d'environnement AICARE_MODELE).
const MODELE = __MODELE__;
// Nombre de threads de calcul laissés à Ollama (AICARE_THREADS, 3 par défaut) : sur un poste de 4 coeurs, en garder au moins un libre pour n8n et PostgreSQL
// évite qu'une alarme de capteur attende la fin d'une génération (voir docs/vitesse.md).
const THREADS = __THREADS__;

// Sortie « phrases » : Ollama IMPOSE ce schéma JSON à la génération (sortie structurée), pas seulement le prompt.
// source_id est limité aux identifiants des faits réellement fournis ; minItems oblige à écrire plusieurs phrases
// (sans cela, un petit modèle s'arrête après la première). Le filtre retire ensuite tout ce qui n'est pas appuyé.
const idsFaits = (e.faits ?? []).map((f) => f.id);
const schemaPhrases = {
  type: 'object',
  properties: {
    phrases: {
      type: 'array',
      minItems: Math.min(4, idsFaits.length || 1, e.max_phrases ?? 8),
      maxItems: e.max_phrases ?? 8,
      items: {
        type: 'object',
        // clés d'une lettre : chaque clé est réécrite à chaque phrase, et le modèle écrit ~3 mots par seconde sur ce poste
        // r = rubrique, t = texte de la phrase, f = identifiant du fait
        properties: {
          r: { type: 'string', enum: (e.sections ?? []).length ? e.sections.map((s) => s.cle) : ['-'] },
          t: { type: 'string', maxLength: e.longueur_phrase ?? 220 }, // 140 coupait des phrases en plein mot
          f: idsFaits.length ? { type: 'string', enum: idsFaits } : { type: 'string' },
        },
        required: ['r', 't', 'f'],
      },
    },
  },
  required: ['phrases'],
};
const format = e.sortie === 'phrases' ? schemaPhrases : e.sortie === 'json' ? 'json' : undefined;

const body = {
  model: MODELE,
  prompt: e.prompt,
  stream: false,
  keep_alive: '30m', // le modèle reste chargé 30 minutes : pas de rechargement entre deux rapports d'un même étage
  // repeat_penalty : sans lui, un petit modèle à température basse peut boucler en répétant les mêmes lignes.
  // num_predict : une réponse en phrases JSON est plus longue qu'un texte brut (clés répétées).
  options: { temperature: e.temperature ?? 0.1, num_thread: THREADS, num_ctx: 4096, num_predict: e.sortie === 'phrases' ? 450 : 500, seed: 42, repeat_penalty: 1.2, repeat_last_n: 128 },
  ...(format ? { format } : {}),
};
return [{ json: { ...e, modele: MODELE, body } }];
