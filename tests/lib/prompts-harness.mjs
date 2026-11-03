// Gemeinsame Werkzeuge für die Prompt-Tests: führt außerhalb von n8n die ECHTEN Knoten der erzeugten Workflows aus
// (gesperrte Vorlage, Vorbereitung des Aufrufs, Kontrolle der Antwort) an den Fällen aus prompts/tests/*.json.
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
  if (!n) throw new Error(`Knoten « ${nom} » in ${fichier} nicht gefunden`);
  return n.parameters.jsCode;
}

// Führt den Code eines n8n-Knotens mit simuliertem $input und simulierten $('Knoten') aus.
export function lancer(code, { entree = {}, noeuds = {} } = {}) {
  const enveloppe = (items) => ({ first: () => items[0], all: () => items, last: () => items.at(-1) });
  const $input = enveloppe([{ json: entree }]);
  const $ = (nom) => {
    if (!(nom in noeuds)) throw new Error(`Unbekannter Knoten: ${nom}`);
    return enveloppe(noeuds[nom].map((json) => ({ json })));
  };
  return new Function('$input', '$', 'require', code)($input, $, require).map((x) => x.json);
}

// Die 6 Prompts des Plans + « consigne_guidee » (Vorlage des Modus B, in dem die Anweisung der Pflegekraft den Block ANWEISUNG PFLEGEKRAFT füllt).
export const IDS_PROMPTS = ['generer_sbar', 'resume_epa', 'points_vigilance', 'contexte_alarme', 'extraire_faits', 'comparer', 'consigne_guidee'];

export function prompts() {
  const code = jsCode('61-brique-template.json', 'Gesperrte Vorlage');
  const m = code.match(/const PROMPTS = (\{[\s\S]*?\});\n/);
  return JSON.parse(m[1]);
}
export const chargerCas = (id) => JSON.parse(readFileSync(join(racine, 'prompts', 'tests', `${id}.json`), 'utf8'));

// Eingabe der Vorlage: das, was « Suchen » für den Fall liefern würde.
export function entreeTemplate(cas, promptId) {
  const proprio = residents.find((r) => r.id === cas.patient.patient_id);
  const autres = residents.filter((r) => r.id !== cas.patient.patient_id);
  return {
    patient: cas.patient,
    periode: { depuis: '2026-10-23T00:00:00Z', jusqua: '2026-10-23T12:00:00Z', depuis_affiche: '23.10. 02:00 Uhr', jusqua_affiche: '23.10. 14:00 Uhr' },
    faits: cas.faits.map((f, i) => ({ id: `F${i + 1}`, date: null, date_affichee: null, type: 'x', ref: `r${i}`, ...f })),
    autres: {
      noms: [...new Set(autres.map((r) => r.nom))].filter((n) => n.toLowerCase() !== proprio.nom.toLowerCase()),
      chambres: autres.map((r) => r.chambre).filter((c) => c !== cas.patient.chambre),
    },
    prompt_id: promptId,
    ...(cas.instruction_soignant ? { instruction_soignant: cas.instruction_soignant } : {}),
  };
}

export const assembler = (cas, promptId) => lancer(jsCode('61-brique-template.json', 'Gesperrte Vorlage'), { entree: entreeTemplate(cas, promptId) })[0];

// Rumpf der an Ollama gesendeten Anfrage (derselbe Code wie der Knoten « Aufruf vorbereiten »).
export function preparerAppel(modele) {
  return (sortieTemplate, cas, promptId) => {
    const code = jsCode('62-brique-rediger.json', 'Aufruf vorbereiten');
    const e = entreeTemplate(cas, promptId);
    return lancer(code, { entree: { ...sortieTemplate, faits: e.faits, patient: e.patient, autres: e.autres } })[0];
  };
}

// Referenzantwort (Text « Satz. [Quelle] ») -> JSON-Antwort « phrases », wie das Modell sie liefern würde:
// Jede Zeile wird dem Fakt derselben Quelle zugeordnet, der ihr am ähnlichsten ist (gemeinsame Wörter).
export function referenceVersPhrases(cas, prompt) {
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const motsDe = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  const titres = new Map(prompt.sections.map((s) => [s.titre, s.cle]));
  let section = prompt.sections.length ? null : '-';
  const phrases = [];
  for (const brute of cas.reponse_reference.split('\n')) {
    const ligne = brute.trim();
    if (!ligne) continue;
    // Überschrift der Rubrik: genauer Titel, oder (Referenzen in alter, französischer Schreibweise) Titel mit denselben ersten Buchstaben
    // (« Diagnostics : » ~ « Diagnosen : », « Médication » ~ « Medikation », « S – Situation » ~ « S – Situation »).
    if (titres.has(ligne)) { section = titres.get(ligne); continue; }
    if (ligne.endsWith(':')) {
      const kopf = (t) => norm(t).replace(/[^a-z]/g, '').slice(0, 4);
      const gleich = [...titres].find(([titel]) => kopf(titel) === kopf(ligne));
      if (gleich) { section = gleich[1]; continue; }
    }
    if (/^information (?:non disponible|nicht verf(?:ü|ue|u)gbar)\.?$/i.test(ligne)) continue;
    const m = ligne.replace(/^\d+[.)]\s+/, '').match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    if (!m) { phrases.push({ r: section ?? '-', t: ligne, f: 'F?' }); continue; }
    const mots = motsDe(m[1]);
    const candidats = cas.faits.map((f, i) => ({ f, id: `F${i + 1}` })).filter((x) => x.f.label === m[2]);
    const meilleur = candidats.sort((a, b) => [...mots].filter((w) => motsDe(b.f.texte).has(w)).length - [...mots].filter((w) => motsDe(a.f.texte).has(w)).length)[0];
    phrases.push({ r: section ?? '-', t: m[1], f: meilleur?.id ?? 'F?' });
  }
  return JSON.stringify({ phrases });
}

// Kontrolle der Antwort (derselbe Code wie der Knoten « Antwort prüfen »).
export function controler(texte, cas, sortieTemplate, promptId, extra = {}) {
  const e = entreeTemplate(cas, promptId);
  return lancer(jsCode('62-brique-rediger.json', 'Antwort prüfen'), {
    entree: { response: texte, total_duration: 1e9, eval_count: 1, ...extra },
    noeuds: { 'Aufruf vorbereiten': [{ faits: e.faits, patient: e.patient, autres: e.autres, modele: 'test', sortie: sortieTemplate.sortie, sections: sortieTemplate.sections, cles_json: sortieTemplate.cles_json, listes_json: sortieTemplate.listes_json }] },
  })[0];
}

// « Information nicht verfügbar » (Ausgabe des Codes) und « information non disponible » (alte Erwartungen der Testfälle) gelten als gleichwertig.
const norm = (s) => String(s).toLowerCase().replace(/information nicht verf(?:ü|ue|u)gbar/g, 'information non disponible');
function valeurChemin(objet, chemin) {
  return chemin
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), objet);
}

// Prüft eine Antwort gegen « attendu »; liefert die Liste der Fehlschläge (leer = konform).
// `strictAvertissements`: verlangt genau die angekündigten Warnungen (Referenzantwort);
// sonst (echter Versuch mit dem Modell) werden sie nur berichtet.
export function verifierAttendu(texte, attendu, controle, { strictAvertissements = true } = {}) {
  const echecs = [];
  for (const s of attendu.contient ?? []) if (!norm(texte).includes(norm(s))) echecs.push(`sollte « ${s} » enthalten`);
  for (const s of attendu.ne_contient_pas ?? []) if (norm(texte).includes(norm(s))) echecs.push(`sollte « ${s} » nicht enthalten`);
  if (attendu.json) {
    let objet = null;
    try {
      objet = JSON.parse(texte);
    } catch {
      echecs.push('JSON ungültig');
    }
    if (objet) {
      for (const [chemin, v] of Object.entries(attendu.json)) {
        const trouve = valeurChemin(objet, chemin);
        if (trouve === undefined || !norm(trouve).includes(norm(v))) echecs.push(`${chemin} sollte « ${v} » lauten (gefunden: ${JSON.stringify(trouve)})`);
      }
    }
  }
  if (strictAvertissements) {
    const types = controle.avertissements.map((a) => a.type).sort();
    const voulus = [...(attendu.avertissements ?? [])].sort();
    if (JSON.stringify(types) !== JSON.stringify(voulus)) echecs.push(`Warnungen: erwartet [${voulus}], erhalten [${types}] ${JSON.stringify(controle.avertissements.map((a) => a.detail))}`);
  }
  return echecs;
}

export const nomsResidents = () => [...new Set(residents.flatMap((r) => [r.nom, r.prenom]))];
