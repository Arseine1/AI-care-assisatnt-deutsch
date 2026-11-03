// TEST DU SOIR (jour 2) : lance 3 passages des 5 connecteurs puis vérifie
//   1. aucun doublon (nombre de points stable, aucun couple source/référence/morceau en double, journal stable) ;
//   2. les passages 2 et 3 n'indexent plus rien (anti-doublon par empreinte) ;
//   3. la recherche « M. Weber chute » renvoie des morceaux d'au moins 3 sources différentes ;
//   4. les 5 lettres KIM sont rattachées au bon résident (dont les homonymes Müller et la lettre scannée).
//
// Prérequis : services démarrés, workflows importés (node workflows/importer.mjs), données chargées (cd data && npm run tout && npm run qdrant).
// Usage : node tests/test-du-soir.mjs [nombre de passages]   (défaut : 3)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const N8N = 'http://localhost:5679/webhook';
const QDRANT = 'http://localhost:6335';
const OLLAMA = 'http://localhost:11434';
const PASSAGES = Number(process.argv[2] || 3);
const CONNECTEURS = ['import-soins', 'import-fhir', 'import-epa', 'import-fichiers', 'import-kim'];

let echecs = 0;
const verifier = (condition, message) => {
  console.log(`${condition ? 'OK   ' : 'ÉCHEC'} ${message}`);
  if (!condition) echecs++;
};

async function json(url, options) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${options?.method ?? 'GET'} ${url} -> HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function lancer(connecteur) {
  for (let essai = 0; essai < 18; essai++) {
    const res = await appelN8n(`${N8N}/${connecteur}`, { method: 'POST' });
    if (res.status === 404) { await new Promise((r) => setTimeout(r, 10000)); continue; } // n8n démarre
    if (!res.ok) throw new Error(`${connecteur} : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const corps = await res.json();
    return Array.isArray(corps) ? corps[0] : corps;
  }
  throw new Error(`${connecteur} : webhook introuvable (workflows importés ?)`);
}

const points = async (collection) => (await json(`${QDRANT}/collections/${collection}`)).result.points_count;

async function tousLesPoints(collection) {
  const res = [];
  let offset = null;
  do {
    const r = await json(`${QDRANT}/collections/${collection}/points/scroll`, {
      method: 'POST',
      body: JSON.stringify({ limit: 200, with_payload: ['source', 'source_ref', 'chunk_index'], with_vector: false, ...(offset ? { offset } : {}) }),
    });
    res.push(...r.result.points);
    offset = r.result.next_page_offset;
  } while (offset);
  return res;
}

function journal() {
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -c "SELECT count(*), count(DISTINCT (source, empreinte)) FROM soins.journal_imports"'],
    { cwd: join(racine, 'compose'), encoding: 'utf8' },
  );
  const [total, distincts] = r.stdout.trim().split('|').map(Number);
  return { total, distincts };
}

console.log(`Test du soir : ${PASSAGES} passages des ${CONNECTEURS.length} connecteurs\n`);
const bilans = [];
for (let p = 1; p <= PASSAGES; p++) {
  let nouveaux = 0;
  let ignores = 0;
  for (const c of CONNECTEURS) {
    const r = await lancer(c);
    nouveaux += r.morceaux_indexes ?? 0;
    ignores += r.ignores_deja_importes ?? 0;
  }
  const b = { passage: p, nouveaux, ignores, patients: await points('patients'), connaissances: await points('connaissances'), a_verifier: await points('a_verifier'), journal: journal() };
  bilans.push(b);
  console.log(`passage ${p} : nouveaux=${b.nouveaux} ignorés=${b.ignores} | points patients=${b.patients} connaissances=${b.connaissances} a_verifier=${b.a_verifier} | journal=${b.journal.total} lignes`);
}

console.log('');
const dernier = bilans.at(-1);
const premier = bilans[0];
verifier(dernier.patients === premier.patients && dernier.connaissances === premier.connaissances, `nombre de points identique entre le passage 1 et le passage ${PASSAGES}`);
verifier(bilans.slice(1).every((b) => b.nouveaux === 0), `les passages 2 à ${PASSAGES} n'indexent plus rien (anti-doublon par empreinte)`);
verifier(dernier.journal.total === premier.journal.total && dernier.journal.total === dernier.journal.distincts, 'le journal des imports ne grossit plus et n\'a aucune empreinte en double');

for (const c of ['patients', 'connaissances', 'a_verifier']) {
  const pts = await tousLesPoints(c);
  const cles = pts.map((x) => `${x.payload.source}|${x.payload.source_ref}|${x.payload.chunk_index}`);
  verifier(new Set(cles).size === cles.length, `${c} : aucun doublon (${cles.length} points, ${new Set(cles).size} morceaux distincts)`);
}

// Recherche « M. Weber chute » : vecteur de la requête (préfixe nomic search_query), puis recherche dans patients et connaissances.
const { embeddings } = await json(`${OLLAMA}/api/embed`, { method: 'POST', body: JSON.stringify({ model: 'nomic-embed-text', input: 'search_query: M. Weber chute' }) });
const cherche = async (collection, limit) =>
  (await json(`${QDRANT}/collections/${collection}/points/search`, { method: 'POST', body: JSON.stringify({ vector: embeddings[0], limit, with_payload: true }) })).result;
const trouves = [...(await cherche('patients', 8)), ...(await cherche('connaissances', 2))];
console.log('\nRecherche « M. Weber chute » :');
for (const t of trouves) console.log(`  ${t.score.toFixed(3)}  [${t.payload.source_label}] ${t.payload.patient_id ?? '—'}  ${t.payload.titre}`);
const sources = [...new Set(trouves.map((t) => t.payload.source))];
verifier(sources.length >= 3, `la recherche renvoie des morceaux d'au moins 3 sources différentes (${sources.join(', ')})`);
verifier(trouves.some((t) => t.payload.patient_id === 'PAT-003' && /chute/i.test(t.payload.texte)), 'un morceau de M. Weber (PAT-003) parle de la chute');


// Lettres KIM : rattachement attendu (nom ET date de naissance ; l'homonyme Müller est celui né le 01.12.1947).
const lettres = (
  await json(`${QDRANT}/collections/a_verifier/points/scroll`, {
    method: 'POST',
    body: JSON.stringify({ limit: 50, with_payload: ['patient_id', 'source_ref', 'motif', 'statut'], with_vector: false }),
  })
).result.points;
const attendu = {
  'arztbrief-weber.pdf': 'PAT-003',
  'arztbrief-schulz.pdf': 'PAT-001',
  'arztbrief-mueller.pdf': 'PAT-006',
  'arztbrief-fischer.pdf': 'PAT-007',
  'arztbrief-wagner-scan.pdf': 'PAT-005',
};
verifier(lettres.length === 5, `a_verifier contient les 5 lettres KIM (${lettres.length})`);
for (const [fichier, patient] of Object.entries(attendu)) {
  const l = lettres.find((x) => x.payload.source_ref.endsWith(`/${fichier}`));
  verifier(l?.payload.patient_id === patient && l.payload.statut === 'a_verifier', `${fichier} rattachée à ${patient} (statut à vérifier)`);
}
console.log(echecs === 0 ? '\nTEST DU SOIR : RÉUSSI' : `\nTEST DU SOIR : ${echecs} échec(s)`);
process.exit(echecs === 0 ? 0 : 1);
