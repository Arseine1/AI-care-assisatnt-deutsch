// « Vérifier le document » – FILET DE RÈGLES déterministe + fusion avec l'assistant IA.
//
// Pourquoi : un modèle de langage peut rater une contradiction grave (Llama 3 a laissé passer une amoxicilline
// chez une résidente allergique à la pénicilline). Ces règles ne dépendent pas du modèle : elles lisent le TEXTE
// de la lettre et les faits du dossier, avec une liste fermée de familles de médicaments (noms français, allemands
// et anglais). Les alertes du modèle s'y ajoutent ; une alerte d'un côté ou de l'autre suffit.
//
// Règles (gravité haute) :
//   allergie                 un médicament de la lettre appartient à une famille dont une allergie est connue
//   anticoagulation_double   un anticoagulant de la lettre alors que le résident en prend déjà un autre, sans arrêt du premier
//   insuffisance_renale      un anti-inflammatoire (AINS) alors que le dossier ou la lettre indique une insuffisance rénale
const ctx = $('Choisir la lettre').first().json;
const lettre = ctx.lettre;
// Deux appels : « Règles seules » (réponse immédiate : les étapes d'IA n'ont PAS encore tourné) et « Règles et fusion »
// (analyse complémentaire en tâche de fond : les étapes d'IA ont tourné, avec ou sans succès).
const sortie = (nom) => {
  try {
    return { executee: true, json: $(nom).first().json ?? {} };
  } catch {
    return { executee: false, json: {} };
  }
};
const iaExecutee = sortie('Rédiger (comparaison)').executee || sortie('Rédiger (extraction)').executee;
const extraction = sortie('Rédiger (extraction)').json;
const comparaison = sortie('Rédiger (comparaison)').json;

const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tl = norm(lettre.texte);
const motsLettre = String(lettre.texte).split(/\s+/);
const SRC_LETTRE = 'KIM (lettre de médecin)';

// Les faits du dossier du résident : ni les protocoles (règles générales), ni la lettre elle-même.
const faitsDossier = (ctx.faits ?? []).filter((f) => f.label !== 'Fichiers' && f.label !== SRC_LETTRE);

const FAMILLES = {
  penicillines: {
    allergie: ['penicillin', 'penicilline'],
    medicaments: ['penicillin', 'penicilline', 'amoxicillin', 'amoxicilline', 'ampicillin', 'ampicilline', 'flucloxacillin', 'flucloxacilline', 'piperacillin', 'piperacilline'],
    libelle: 'pénicillines',
  },
  sulfamides: {
    allergie: ['sulfamide', 'sulfonamid', 'cotrimoxazol', 'sulfamethoxazol'],
    medicaments: ['cotrimoxazol', 'cotrimoxazole', 'sulfamethoxazol', 'sulfamethoxazole', 'sulfamide', 'sulfonamid'],
    libelle: 'sulfamides',
  },
};
// anticoagulants : nom -> substance (les synonymes forment une même substance)
const ANTICOAGULANTS = {
  marcumar: 'phenprocoumon', phenprocoumon: 'phenprocoumon', phenprocoumone: 'phenprocoumon',
  apixaban: 'apixaban', rivaroxaban: 'rivaroxaban', dabigatran: 'dabigatran', edoxaban: 'edoxaban',
  heparine: 'heparine', heparin: 'heparine', enoxaparin: 'enoxaparine', enoxaparine: 'enoxaparine',
};
const AINS = ['ibuprofen', 'ibuprofene', 'diclofenac', 'naproxen', 'naproxene', 'ketoprofen', 'ketoprofene', 'indometacin', 'etoricoxib'];
const RENAL = /insuffisance renale|niereninsuffizienz|nierenerkrank|ains contre indiques|ains contre-indiques|\bdfg\b|\begfr\b|nephropath/;
const ARRET = /(absetz|abgesetz|pausier|beend|stopp|arret|arreter|discontinu|ersetz|ablos|nicht mehr|supprim)/;

const trouve = (noms, t) => noms.filter((n) => new RegExp(`\\b${n}`).test(t));
const extrait = (nom) => {
  const i = motsLettre.findIndex((w) => norm(w).startsWith(nom));
  return i < 0 ? '' : motsLettre.slice(Math.max(0, i - 1), i + 6).join(' ').slice(0, 120);
};
const court = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 160);

const regles = [];

// ---- allergie ----
for (const [cle, fam] of Object.entries(FAMILLES)) {
  const faitAllergie = faitsDossier.find((f) => /allergi/.test(norm(f.texte)) && fam.allergie.some((k) => norm(f.texte).includes(k)));
  const meds = trouve(fam.medicaments, tl);
  if (faitAllergie && meds.length) {
    regles.push({
      type: 'allergie',
      gravite: 'haute',
      description: `La lettre cite ${meds[0]}, une ${fam.libelle === 'pénicillines' ? 'pénicilline' : 'molécule de la famille des ' + fam.libelle}, alors qu'une allergie à cette famille est connue.`,
      element_lettre: extrait(meds[0]),
      element_source: court(faitAllergie.texte),
      sources: [SRC_LETTRE, faitAllergie.label],
      origine: 'regles',
      cle,
    });
  }
}

// ---- anticoagulation double ----
const substancesLettre = [...new Set(trouve(Object.keys(ANTICOAGULANTS), tl).map((n) => ANTICOAGULANTS[n]))];
const dossierAnticoag = new Map(); // substance -> fait
for (const f of faitsDossier) {
  const tf = norm(f.texte);
  for (const n of trouve(Object.keys(ANTICOAGULANTS), tf)) if (!dossierAnticoag.has(ANTICOAGULANTS[n])) dossierAnticoag.set(ANTICOAGULANTS[n], f);
}
const arrete = (substance) => {
  const noms = Object.keys(ANTICOAGULANTS).filter((n) => ANTICOAGULANTS[n] === substance);
  return noms.some((n) => {
    for (const m of tl.matchAll(new RegExp(`\\b${n}`, 'g'))) {
      const fenetre = tl.slice(Math.max(0, m.index - 100), m.index + 100);
      if (ARRET.test(fenetre)) return true;
    }
    return false;
  });
};
for (const nouvelle of substancesLettre) {
  if (dossierAnticoag.has(nouvelle) || dossierAnticoag.size === 0) continue;
  if ([...dossierAnticoag.keys()].every((ancienne) => !arrete(ancienne))) {
    const [ancienne, fait] = [...dossierAnticoag.entries()][0];
    const nomLettre = Object.keys(ANTICOAGULANTS).find((n) => ANTICOAGULANTS[n] === nouvelle && new RegExp(`\\b${n}`).test(tl));
    regles.push({
      type: 'anticoagulation_double',
      gravite: 'haute',
      description: `La lettre cite l'anticoagulant ${nomLettre}, alors que le résident prend déjà un autre anticoagulant (${ancienne}) et que la lettre ne mentionne pas son arrêt : risque de double anticoagulation.`,
      element_lettre: extrait(nomLettre),
      element_source: court(fait.texte),
      sources: [SRC_LETTRE, fait.label],
      origine: 'regles',
    });
  }
}

// ---- AINS et insuffisance rénale ----
const ainsLettre = trouve(AINS, tl);
if (ainsLettre.length) {
  const faitRenal = faitsDossier.find((f) => RENAL.test(norm(f.texte)));
  const renalLettre = /niereninsuffizienz|insuffisance renale|nierenerkrank/.test(tl);
  if (faitRenal || renalLettre) {
    regles.push({
      type: 'insuffisance_renale',
      gravite: 'haute',
      description: `La lettre cite ${ainsLettre[0]}, un anti-inflammatoire (AINS), alors qu'une insuffisance rénale est indiquée : les AINS sont à éviter, voire contre-indiqués.`,
      element_lettre: extrait(ainsLettre[0]),
      element_source: faitRenal ? court(faitRenal.texte) : 'Mention d\'une insuffisance rénale dans la lettre elle-même',
      sources: faitRenal ? [SRC_LETTRE, faitRenal.label] : [SRC_LETTRE],
      origine: 'regles',
    });
  }
}

// ---- alertes de l'assistant IA (jamais prises telles quelles : JSON contrôlé, champs complétés) ----
let modele = [];
try {
  const o = JSON.parse(comparaison.texte ?? '');
  if (Array.isArray(o.contradictions)) modele = o.contradictions.filter((c) => c && typeof c === 'object');
} catch {
  /* sortie illisible : les règles suffisent */
}
// Une alerte du modèle n'est retenue que si elle s'appuie sur un fait RÉEL du dossier (élément source) et sur un
// passage RÉEL de la lettre (élément lettre) : le modèle peut inventer une contradiction, ce qui fatiguerait les soignants.
const motsDe = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
const part = (mots, cible) => (mots.size ? [...mots].filter((w) => cible.has(w)).length / mots.size : 0);
const motsLettre2 = motsDe(lettre.texte);
const soutenue = (c) => {
  const src = motsDe(c.element_source ?? '');
  const let_ = motsDe(c.element_lettre ?? '');
  if (src.size < 2 || let_.size < 1) return false;
  return faitsDossier.some((f) => part(src, motsDe(f.texte)) >= 0.6) && part(let_, motsLettre2) >= 0.6;
};
const candidatsModele = modele.filter((c) => !regles.some((r) => r.type === c.type && r.type !== 'autre'));
const ecartes = candidatsModele.filter((c) => !soutenue(c));
const deModele = candidatsModele
  .filter(soutenue)
  .map((c) => ({
    type: ['allergie', 'anticoagulation_double', 'insuffisance_renale'].includes(c.type) ? c.type : 'autre',
    gravite: c.gravite === 'haute' ? 'haute' : 'moyenne',
    description: `${String(c.description ?? 'Contradiction signalée par l\'assistant IA').slice(0, 220)} (à confirmer : signalé par l'assistant IA seulement).`,
    element_lettre: court(c.element_lettre ?? ''),
    element_source: court(c.element_source ?? ''),
    sources: [SRC_LETTRE, ...(Array.isArray(c.sources) ? c.sources.map((s) => String(s).replace(/^\[|\]$/g, '')).filter((s) => s !== SRC_LETTRE) : [])],
    origine: 'modele',
  }));

const contradictions = [...regles, ...deModele];

// ---- rapport rédigé par le code (jamais par le modèle) ----
const lignes = [`Document analysé : ${lettre.titre ?? 'lettre de médecin'} (expéditeur : ${lettre.expediteur ?? 'inconnu'}). [${SRC_LETTRE}]`];
if (!contradictions.length) {
  lignes.push(`Aucune contradiction détectée par les règles de contrôle${iaExecutee ? " ni par l'assistant IA" : ''} ; cela ne remplace pas la relecture du soignant. [${SRC_LETTRE}]`);
} else {
  lignes.push(`${contradictions.length} contradiction(s) à clarifier avec le médecin avant toute administration :`);
  contradictions.forEach((c, i) => {
    lignes.push(`${i + 1}. ${c.description} Lettre : « ${c.element_lettre} ». Dossier : « ${c.element_source} ». ${[...new Set(c.sources)].map((s) => `[${s}]`).join(' ')}`);
  });
}

const avertissements = [];
const heriter = (etape, r) => {
  if (!r || !r.texte) avertissements.push({ type: `${etape}_indisponible`, detail: `L'étape « ${etape} » de l'assistant IA n'a pas abouti : seules les règles de contrôle ont été appliquées.` });
  else {
    for (const a of r.avertissements ?? []) {
      // clés facultatives manquantes dans l'extraction : étape interne, sans intérêt pour le soignant (valeur lue comme « null »)
      if (etape === 'extraction' && a.type === 'json_incomplet') continue;
      avertissements.push({ type: a.type, detail: `${etape} : ${a.detail ?? ''}`.slice(0, 200) });
    }
  }
};
if (ecartes.length) {
  avertissements.push({ type: 'contradiction_modele_ecartee', detail: `${ecartes.length} contradiction(s) signalée(s) par l'assistant IA écartée(s) : elles ne s'appuient sur aucun fait du dossier.` });
}
if (iaExecutee) {
  heriter('extraction', extraction);
  heriter('comparaison', comparaison);
}
if (regles.length && !modele.length && comparaison.texte) {
  avertissements.push({ type: 'modele_a_rate', detail: 'L\'assistant IA n\'a signalé aucune contradiction ; elles viennent des règles de contrôle.' });
}

return [
  {
    json: {
      texte: lignes.join('\n'),
      contradictions,
      sources: [...new Set(contradictions.flatMap((c) => c.sources).concat(SRC_LETTRE))],
      alertes: contradictions.map((c) => ({ type: 'contradiction', message: c.description })),
      avertissements,
      nb_regles: regles.length,
      nb_modele: deModele.length,
      ia_executee: iaExecutee,
      contradictions_modele: deModele,
      ecartees_modele: ecartes.length,
      lettre_ref: lettre.ref,
      modele: comparaison.modele ?? extraction.modele ?? null,
      prompt_versions: iaExecutee ? `extraire_faits@${extraction.prompt_version ?? '?'}+comparer@${comparaison.prompt_version ?? '?'}+regles@1.0.0` : 'regles@1.0.0',
    },
  },
];
