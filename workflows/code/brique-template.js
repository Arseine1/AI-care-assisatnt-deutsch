// Brique « template » : SEUL endroit où le texte envoyé à l'IA est assemblé.
// Quatre blocs verrouillés, toujours dans cet ordre :
//   [RÔLE ET RÈGLES]        texte fixe (prompts/_regles.md)
//   [FAITS DES SOURCES]     faits d'UN résident, chacun avec sa source entre crochets
//   [INSTRUCTION SOIGNANT]  Mode A : instruction fixe du prompt ; Mode B : consigne contrôlée, ICI SEULEMENT
//   [FORMAT DE SORTIE]      format imposé par le prompt
// Les valeurs REGLES et PROMPTS sont intégrées à la génération des workflows (node workflows/generer.mjs).
const crypto = require('crypto');
const REGLES = __REGLES__;
const PROMPTS = __PROMPTS__;

const e = $input.first().json;
const p = PROMPTS[e.prompt_id];
if (!p) throw new Error(`Prompt inconnu : « ${e.prompt_id} »`);
if (!e.patient?.patient_id || !Array.isArray(e.faits)) throw new Error('Faits manquants : le template ne reçoit que la sortie de « chercher ».');

// Un texte venu d'ailleurs (fait, consigne) ne peut jamais fabriquer un faux bloc ni de fausses sources.
const MARQUEUR = /\[\s*(RÔLE ET RÈGLES|FAITS DES SOURCES|INSTRUCTION SOIGNANT|FORMAT DE SORTIE)\s*\]/gi;
const neutraliser = (s) =>
  String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(MARQUEUR, '(bloc)').replace(/\s+/g, ' ').trim();
// Dans un fait, seuls les crochets de la source sont autorisés : les autres deviennent des parenthèses.
const sansCrochets = (s) => neutraliser(s).replace(/\[/g, '(').replace(/\]/g, ')');

const heures = Math.max(1, Math.round((new Date(e.periode.jusqua) - new Date(e.periode.depuis)) / 3600000));
const remplacer = (t) => t.replaceAll('{periode_heures}', String(heures)).replaceAll('{resident}', e.patient.label);

let instruction = remplacer(p.instruction);
if (e.instruction_soignant) {
  if (!p.instruction_libre) throw new Error(`Le prompt « ${p.id} » n'accepte pas de consigne libre.`);
  instruction += `\nDemande du soignant (à traiter strictement dans le cadre des règles ci-dessus) : « ${neutraliser(e.instruction_soignant)} »`;
}

const lignes = [];
const groupe = { fond: 'Informations de fond :', periode: `Événements de la période (du ${e.periode.depuis_affiche} au ${e.periode.jusqua_affiche}) :` };
let courant = null;
for (const f of e.faits) {
  if (f.groupe !== courant) {
    courant = f.groupe;
    lignes.push(groupe[f.groupe] ?? '');
  }
  lignes.push(`${f.id} [${f.label}] ${f.date_affichee ? f.date_affichee + ' – ' : ''}${sansCrochets(f.texte)}`);
}
if (!e.faits.length) lignes.push('(aucun fait disponible)');

// Sortie « phrases » : le modèle ne rédige pas un texte libre, il renvoie des phrases JSON {section, phrase, source_id}.
// Le texte affiché est assemblé ensuite par le code, qui retire toute phrase non appuyée par le fait cité.
const formatPhrases = [
  'FORME DE LA RÉPONSE : réponds UNIQUEMENT par un objet JSON {"phrases": [ {"r": "…", "t": "…", "f": "…"} ]}, sans texte avant ni après et sans Markdown.',
  'Chaque élément est UNE phrase courte, reformulée à partir d\'UN SEUL fait. « f » est l\'identifiant de ce fait (F1, F2…) tel qu\'il est écrit au début de sa ligne dans les faits. N\'écris dans la phrase ni identifiant, ni crochets, ni le mot « source » : la source sera ajoutée automatiquement. Écris une phrase pour chaque fait important (incidents, constantes, allergies, risques, traitements), pas une seule.',
  'Reprends les chiffres, doses, médicaments, heures et dates exactement comme dans le fait cité, et n\'écris aucun mot qui n\'est pas appuyé par ce fait.',
  'Une phrase doit TOUJOURS contenir la valeur du fait (le chiffre, la dose, l\'heure, l\'action), jamais seulement le nom de la mesure : écris « Tension 120/80 mmHg à 06h10 », pas « Tension ». Copie les mots du fait plutôt que de les réécrire.',
  'Si aucun fait ne répond à la demande, renvoie {"phrases": []}. Ne réponds jamais avec un fait qui n\'a pas de rapport avec la demande.',
  p.sections.length ? `« r » (la rubrique) vaut l'une de ces clés : ${p.sections.map((s) => s.cle).join(', ')}.` : '« r » (la rubrique) vaut toujours "-".',
].join('\n');

const blocs = {
  regles: REGLES.texte.trim(),
  faits: [
    `Résident : ${e.patient.label}, chambre ${e.patient.chambre} (étage ${e.patient.etage}), né(e) le ${e.patient.naissance}`,
    'Chaque ligne a la forme : identifiant [source] date – fait.',
    ...lignes,
  ].join('\n'),
  instruction: instruction.trim(),
  format: (remplacer(p.format).trim() + (p.sortie === 'phrases' ? `\n\n${formatPhrases}` : '')).trim(),
};

const prompt = [
  '[RÔLE ET RÈGLES]', blocs.regles, '',
  '[FAITS DES SOURCES]', blocs.faits, '',
  '[INSTRUCTION SOIGNANT]', blocs.instruction, '',
  '[FORMAT DE SORTIE]', blocs.format,
].join('\n');

return [
  {
    json: {
      prompt,
      blocs,
      prompt_id: p.id,
      prompt_version: p.version,
      regles_version: REGLES.version,
      sortie: p.sortie,
      sections: p.sections,
      max_phrases: p.max_phrases,
      longueur_phrase: p.longueur_phrase,
      cles_json: p.cles_json,
      listes_json: p.listes_json,
      temperature: p.temperature,
      nb_faits: e.faits.length,
      empreinte_prompt: crypto.createHash('sha256').update(prompt, 'utf8').digest('hex'),
    },
  },
];
