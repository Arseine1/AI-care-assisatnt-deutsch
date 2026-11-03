// Comparatif des modèles locaux qui PILOTENT l'agent des cotisations (workflows/code/sgb6/agent.js), sur les 9 questionnaires fictifs.
// Pour chaque modèle et chaque cas : statut final conforme à data/sgb6/attendus.json (oui ou non), nombre de tours, appels refusés par la garde,
// abandon du pilotage ou non, durée, mémoire du modèle. Le statut et les montants viennent du code, jamais du modèle : « conforme » mesure donc
// surtout si le modèle MÈNE le traitement jusqu'au bout sans abandon (un abandon donne la mission guidée, conforme mais signalé).
//
// Lancer : node tests/sgb6-modeles.mjs                                  (qwen2.5:7b, llama3.1:8b, qwen3:8b ; 9 cas chacun, plusieurs heures sans carte graphique)
//          node tests/sgb6-modeles.mjs --modeles=llama3.2 --cas=a,d     (un modèle, quelques cas)
//          node tests/sgb6-modeles.mjs --tableau                        (réécrit seulement le tableau Markdown à partir du dernier résultat)
// Un modèle absent d'Ollama est noté « absent » (rien n'est téléchargé : `ollama pull <nom>` se fait à la main). qwen3 : mode réflexion désactivé (think: false).
// Résultats : tests/resultats/sgb6-modeles.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { freemem } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { piloterOuReplier } from '../workflows/code/sgb6/agent.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const argument = (nom, defaut) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? defaut;
const modeles = argument('modeles', 'qwen2.5:7b,llama3.1:8b,qwen3:8b').split(',').filter(Boolean);
const filtreCas = argument('cas', '').split(',').filter(Boolean);
const modeleExtraction = argument('extraction', 'llama3.2');
const fichierSortie = join(racine, 'tests', 'resultats', 'sgb6-modeles.json');
const data = join(racine, 'data', 'sgb6');
const attendus = JSON.parse(readFileSync(join(data, 'attendus.json'), 'utf8'));
const caisse = JSON.parse(readFileSync(join(data, 'caisse.json'), 'utf8'));
const ids = Object.keys(attendus).filter((k) => !k.startsWith('_') && (!filtreCas.length || filtreCas.includes(k.split('-')[0])));

const json = async (chemin, corps, delaiMs = 600000) => {
  const rep = await fetch(`${OLLAMA}${chemin}`, { method: corps ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(delaiMs) });
  if (!rep.ok) throw new Error(`Ollama ${chemin} : HTTP ${rep.status} ${(await rep.text()).slice(0, 200)}`);
  return rep.json();
};
const dansOllama = (installes, nom) => installes.find((m) => m === nom || m === `${nom}:latest` || (!nom.includes(':') && m.startsWith(`${nom}:`)));

function tableau(resultats) {
  const lignes = ['| Modèle | Cas | Conforme | Tours | Refus garde | Abandon | Durée | Contradictions |', '|---|---|---|---|---|---|---|---|'];
  for (const [modele, m] of Object.entries(resultats)) {
    if (m.absent) {
      lignes.push(`| ${modele} | (9 cas) | **modèle absent d'Ollama** | | | | | |`);
      continue;
    }
    if (m.sans_outils) {
      lignes.push(`| ${modele} | (9 cas) | **sans la capacité « tools » : inutilisable** (${m.capacites.join(', ')}) | | | | | |`);
      continue;
    }
    for (const [cas, r] of Object.entries(m.cas)) lignes.push(`| ${modele} | ${cas.split('-')[0]} | ${r.conforme ? 'oui' : 'non'} | ${r.tours} | ${r.refus} | ${r.abandon ?? 'non'} | ${Math.round(r.secondes)} s | ${r.contradictions} |`);
    const rs = Object.values(m.cas);
    if (rs.length) lignes.push(`| **${modele}** | **${rs.length} cas** | **${rs.filter((r) => r.conforme && !r.abandon).length} conformes sans abandon** | ${(rs.reduce((s, r) => s + r.tours, 0) / rs.length).toFixed(1)} en moyenne | ${rs.reduce((s, r) => s + r.refus, 0)} | ${rs.filter((r) => r.abandon).length} | ${Math.round(rs.reduce((s, r) => s + r.secondes, 0) / rs.length)} s en moyenne | ${rs.reduce((s, r) => s + r.contradictions, 0)} |`);
  }
  return lignes.join('\n');
}

let resultats = {};
try {
  resultats = JSON.parse(readFileSync(fichierSortie, 'utf8')).modeles ?? {};
} catch {
  /* premier passage */
}
if (process.argv.includes('--tableau')) {
  console.log(tableau(resultats));
  process.exit(0);
}

const installes = (await json('/api/tags')).models.map((m) => m.name);
console.log(`Modèles installés dans Ollama : ${installes.join(', ')}`);
for (const nom of modeles) {
  const reel = dansOllama(installes, nom);
  if (!reel) {
    console.log(`\n== ${nom} : ABSENT d'Ollama (rien n'est téléchargé : « ollama pull ${nom} » à la main) ==`);
    resultats[nom] = { absent: true, essaye_le: new Date().toISOString() };
    continue;
  }
  const info = await json('/api/show', { model: reel });
  const capacites = info.capabilities ?? [];
  if (!capacites.includes('tools')) {
    console.log(`\n== ${nom} : pas de capacité « tools » (${capacites.join(', ')}) : inutilisable ==`);
    resultats[nom] = { sans_outils: true, capacites, essaye_le: new Date().toISOString() };
    continue;
  }
  console.log(`\n== ${nom} (${info.details?.parameter_size}, ${info.details?.quantization_level}) ; capacités : ${capacites.join(', ')} ==`);
  const m = (resultats[nom] = { ...(resultats[nom]?.absent || resultats[nom]?.sans_outils ? {} : resultats[nom]), parametres: info.details?.parameter_size, quantification: info.details?.quantization_level, capacites, cas: resultats[nom]?.cas ?? {} });
  for (const id of ids) {
    const attendu = attendus[id];
    const texte = readFileSync(join(data, 'questionnaires', `${id}.txt`), 'utf8');
    let memMin = freemem();
    const releve = setInterval(() => (memMin = Math.min(memMin, freemem())), 3000);
    let memoireModele = null;
    const chat = async (corps) => {
      const r = await json('/api/chat', corps, 300000);
      if (memoireModele === null) memoireModele = (await json('/api/ps').catch(() => ({ models: [] }))).models?.find((x) => x.name === reel || x.model === reel)?.size ?? null;
      return r;
    };
    const appelerIA = async (corps) => (await json('/api/generate', corps, 240000)).response;
    const debut = Date.now();
    let sortie;
    try {
      sortie = await piloterOuReplier({ texte, caisse, annee: 2026, dossier_id: id, modele: reel, chat, appelerIA, modeleExtraction });
    } catch (e) {
      clearInterval(releve);
      console.log(`     ${id} : ERREUR ${e.message}`);
      m.cas[id] = { conforme: false, tours: 0, refus: 0, abandon: `erreur : ${e.message.slice(0, 80)}`, secondes: (Date.now() - debut) / 1000, contradictions: 0 };
      continue;
    }
    clearInterval(releve);
    const res = sortie.resultat;
    const conforme = res.statut === attendu.statut && (res.calcul?.cotisation ?? null) === attendu.cotisation;
    m.cas[id] = {
      conforme, statut: res.statut, cotisation: res.calcul?.cotisation ?? null, tours: sortie.session.tours, refus: sortie.session.refus, abandon: sortie.session.abandon,
      secondes: (Date.now() - debut) / 1000, contradictions: res.pilote.contradictions?.length ?? 0, mode: res.pilote.mode, outils: sortie.session.journal.map((l) => `${l.outil}${l.accepte ? '' : ' (refusé)'}`),
      memoire_modele_go: memoireModele ? Math.round(memoireModele / 1e8) / 10 : null, ram_libre_min_go: Math.round((memMin / 1e9) * 10) / 10,
    };
    const r = m.cas[id];
    console.log(`     ${id.split('-')[0]} : ${conforme ? 'conforme' : 'NON conforme'} (${res.statut}, ${r.cotisation ?? '-'} €) ; ${r.tours} tours, ${r.refus} refus, abandon : ${r.abandon ?? 'non'}, ${Math.round(r.secondes)} s, RAM libre min ${r.ram_libre_min_go} Go, modèle ${r.memoire_modele_go ?? '?'} Go`);
    mkdirSync(dirname(fichierSortie), { recursive: true });
    writeFileSync(fichierSortie, JSON.stringify({ date: new Date().toISOString(), extraction: modeleExtraction, modeles: resultats }, null, 2));
  }
  await json('/api/generate', { model: reel, keep_alive: 0 }).catch(() => {}); // libère la mémoire avant le modèle suivant
}
mkdirSync(dirname(fichierSortie), { recursive: true });
writeFileSync(fichierSortie, JSON.stringify({ date: new Date().toISOString(), extraction: modeleExtraction, modeles: resultats }, null, 2));
console.log(`\n${tableau(resultats)}\n\nRésultats : tests/resultats/sgb6-modeles.json`);
