// Outils communs aux tests des prompts : exécute, hors n8n, les VRAIS nœuds des workflows générés
// (template verrouillé, préparation de l'appel, contrôle de la réponse) sur les cas de prompts/tests/*.json.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { residents } from '../../data/source/residents.mjs';

export const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

export const workflow = (fichier) => JSON.parse(readFileSync(join(racine, 'workflows', fichier), 'utf8'));
export function jsCode(fichier, nom) {
  const n = workflow(fichier).nodes.find((x) => x.name === nom);
  if (!n) throw new Error(`nœud « ${nom} » introuvable dans ${fichier}`);
  return n.parameters.jsCode;
}

// Exécute le code d'un nœud n8n avec un $input et des $('nœud') simulés.
export function lancer(code, { entree = {}, noeuds = {} } = {}) {
  const enveloppe = (items) => ({ first: () => items[0], all: () => items, last: () => items.at(-1) });
  const $input = enveloppe([{ json: entree }]);
  const $ = (nom) => {
    if (!(nom in noeuds)) throw new Error(`nœud inconnu : ${nom}`);
    return enveloppe(noeuds[nom].map((json) => ({ json })));
  };
  return new Function('$input', '$', 'require', code)($input, $, require).map((x) => x.json);
}

// Les 6 prompts du plan + « consigne_guidee » (modèle du Mode B, où la consigne du soignant remplit le bloc INSTRUCTION SOIGNANT).
export const IDS_PROMPTS = ['generer_sbar', 'resume_epa', 'points_vigilance', 'contexte_alarme', 'extraire_faits', 'comparer', 'consigne_guidee'];

export function prompts() {
  const code = jsCode('61-brique-template.json', 'Template verrouillé');
  const m = code.match(/const PROMPTS = (\{[\s\S]*?\});\n/);
  return JSON.parse(m[1]);
}
export const chargerCas = (id) => JSON.parse(readFileSync(join(racine, 'prompts', 'tests', `${id}.json`), 'utf8'));

// Entrée du template : ce que « chercher » produirait pour le cas.
export function entreeTemplate(cas, promptId) {
  const proprio = residents.find((r) => r.id === cas.patient.patient_id);
  const autres = residents.filter((r) => r.id !== cas.patient.patient_id);
  return {
    patient: cas.patient,
    periode: { depuis: '2026-10-23T00:00:00Z', jusqua: '2026-10-23T12:00:00Z', depuis_affiche: '23.10. 02h00', jusqua_affiche: '23.10. 14h00' },
    faits: cas.faits.map((f, i) => ({ id: `F${i + 1}`, date: null, date_affichee: null, type: 'x', ref: `r${i}`, ...f })),
    autres: {
      noms: [...new Set(autres.map((r) => r.nom))].filter((n) => n.toLowerCase() !== proprio.nom.toLowerCase()),
      chambres: autres.map((r) => r.chambre).filter((c) => c !== cas.patient.chambre),
    },
    prompt_id: promptId,
    ...(cas.instruction_soignant ? { instruction_soignant: cas.instruction_soignant } : {}),
  };
}

export const assembler = (cas, promptId) => lancer(jsCode('61-brique-template.json', 'Template verrouillé'), { entree: entreeTemplate(cas, promptId) })[0];

// Corps de la requête envoyée à Ollama (même code que le nœud « Préparer appel »).
export function preparerAppel(modele) {
  return (sortieTemplate, cas, promptId) => {
    const code = jsCode('62-brique-rediger.json', 'Préparer appel');
    const e = entreeTemplate(cas, promptId);
    return lancer(code, { entree: { ...sortieTemplate, faits: e.faits, patient: e.patient, autres: e.autres } })[0];
  };
}

// Réponse de référence (texte « phrase. [source] ») -> réponse JSON « phrases » telle que le modèle la renverrait :
// chaque ligne est rattachée au fait de la même source qui lui ressemble le plus (mots communs).
export function referenceVersPhrases(cas, prompt) {
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const motsDe = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  const titres = new Map(prompt.sections.map((s) => [s.titre, s.cle]));
  let section = prompt.sections.length ? null : '-';
  const phrases = [];
  for (const brute of cas.reponse_reference.split('\n')) {
    const ligne = brute.trim();
    if (!ligne) continue;
    if (titres.has(ligne)) { section = titres.get(ligne); continue; }
    if (/^information non disponible\.?$/i.test(ligne)) continue;
    const m = ligne.replace(/^\d+[.)]\s+/, '').match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    if (!m) { phrases.push({ r: section ?? '-', t: ligne, f: 'F?' }); continue; }
    const mots = motsDe(m[1]);
    const candidats = cas.faits.map((f, i) => ({ f, id: `F${i + 1}` })).filter((x) => x.f.label === m[2]);
    const meilleur = candidats.sort((a, b) => [...mots].filter((w) => motsDe(b.f.texte).has(w)).length - [...mots].filter((w) => motsDe(a.f.texte).has(w)).length)[0];
    phrases.push({ r: section ?? '-', t: m[1], f: meilleur?.id ?? 'F?' });
  }
  return JSON.stringify({ phrases });
}

// Contrôle de la réponse (même code que le nœud « Contrôler la réponse »).
export function controler(texte, cas, sortieTemplate, promptId, extra = {}) {
  const e = entreeTemplate(cas, promptId);
  return lancer(jsCode('62-brique-rediger.json', 'Contrôler la réponse'), {
    entree: { response: texte, total_duration: 1e9, eval_count: 1, ...extra },
    noeuds: { 'Préparer appel': [{ faits: e.faits, patient: e.patient, autres: e.autres, modele: 'test', sortie: sortieTemplate.sortie, sections: sortieTemplate.sections, cles_json: sortieTemplate.cles_json, listes_json: sortieTemplate.listes_json }] },
  })[0];
}

const norm = (s) => String(s).toLowerCase();
function valeurChemin(objet, chemin) {
  return chemin
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), objet);
}

// Vérifie une réponse par rapport à « attendu » ; renvoie la liste des échecs (vide = conforme).
// `strictAvertissements` : exige exactement les avertissements annoncés (réponse de référence) ;
// sinon (essai réel avec le modèle) ils sont seulement rapportés.
export function verifierAttendu(texte, attendu, controle, { strictAvertissements = true } = {}) {
  const echecs = [];
  for (const s of attendu.contient ?? []) if (!norm(texte).includes(norm(s))) echecs.push(`devrait contenir « ${s} »`);
  for (const s of attendu.ne_contient_pas ?? []) if (norm(texte).includes(norm(s))) echecs.push(`ne devrait pas contenir « ${s} »`);
  if (attendu.json) {
    let objet = null;
    try {
      objet = JSON.parse(texte);
    } catch {
      echecs.push('JSON invalide');
    }
    if (objet) {
      for (const [chemin, v] of Object.entries(attendu.json)) {
        const trouve = valeurChemin(objet, chemin);
        if (trouve === undefined || !norm(trouve).includes(norm(v))) echecs.push(`${chemin} devrait valoir « ${v} » (trouvé : ${JSON.stringify(trouve)})`);
      }
    }
  }
  if (strictAvertissements) {
    const types = controle.avertissements.map((a) => a.type).sort();
    const voulus = [...(attendu.avertissements ?? [])].sort();
    if (JSON.stringify(types) !== JSON.stringify(voulus)) echecs.push(`avertissements : attendu [${voulus}], obtenu [${types}] ${JSON.stringify(controle.avertissements.map((a) => a.detail))}`);
  }
  return echecs;
}

export const nomsResidents = () => [...new Set(residents.flatMap((r) => [r.nom, r.prenom]))];
