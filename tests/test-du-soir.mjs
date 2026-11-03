// TEST AM ABEND (Tag 2): startet 3 Durchläufe der 5 Konnektoren und prüft dann
//   1. keine Dubletten (Punktzahl stabil, kein doppeltes Tripel Quelle/Referenz/Abschnitt, Protokoll stabil);
//   2. Die Durchläufe 2 und 3 indizieren nichts mehr (Dublettenschutz per Fingerabdruck);
//   3. Die Suche „Herr Weber Sturz“ liefert Abschnitte aus mindestens 3 verschiedenen Quellen;
//   4. Die 5 KIM-Schreiben sind dem richtigen Bewohner zugeordnet (darunter die Namensvettern Müller und das gescannte Schreiben).
//
// Voraussetzungen: Dienste gestartet, Workflows importiert (node workflows/importer.mjs), Daten geladen (cd data && npm run tout && npm run qdrant).
// Aufruf: node tests/test-du-soir.mjs [Anzahl Durchläufe]   (Standard: 3)
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
  console.log(`${condition ? 'OK   ' : 'FEHLER'} ${message}`);
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
    if (res.status === 404) { await new Promise((r) => setTimeout(r, 10000)); continue; } // n8n startet
    if (!res.ok) throw new Error(`${connecteur}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const corps = await res.json();
    return Array.isArray(corps) ? corps[0] : corps;
  }
  throw new Error(`${connecteur}: Webhook nicht gefunden (Workflows importiert?)`);
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

console.log(`Test am Abend: ${PASSAGES} Durchläufe der ${CONNECTEURS.length} Konnektoren\n`);
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
  console.log(`Durchlauf ${p}: neu=${b.nouveaux} ignoriert=${b.ignores} | Punkte patients=${b.patients} connaissances=${b.connaissances} a_verifier=${b.a_verifier} | Protokoll=${b.journal.total} Zeilen`);
}

console.log('');
const dernier = bilans.at(-1);
const premier = bilans[0];
verifier(dernier.patients === premier.patients && dernier.connaissances === premier.connaissances, `gleiche Punktzahl zwischen Durchlauf 1 und Durchlauf ${PASSAGES}`);
verifier(bilans.slice(1).every((b) => b.nouveaux === 0), `die Durchläufe 2 bis ${PASSAGES} indizieren nichts mehr (Dublettenschutz per Fingerabdruck)`);
verifier(dernier.journal.total === premier.journal.total && dernier.journal.total === dernier.journal.distincts, 'das Importprotokoll wächst nicht mehr und hat keinen doppelten Fingerabdruck');

for (const c of ['patients', 'connaissances', 'a_verifier']) {
  const pts = await tousLesPoints(c);
  const cles = pts.map((x) => `${x.payload.source}|${x.payload.source_ref}|${x.payload.chunk_index}`);
  verifier(new Set(cles).size === cles.length, `${c}: keine Dubletten (${cles.length} Punkte, ${new Set(cles).size} verschiedene Abschnitte)`);
}

// Suche „Herr Weber Sturz“: Vektor der Anfrage (Präfix nomic search_query), dann Suche in patients und connaissances.
const { embeddings } = await json(`${OLLAMA}/api/embed`, { method: 'POST', body: JSON.stringify({ model: 'nomic-embed-text', input: 'search_query: Herr Weber Sturz' }) });
const cherche = async (collection, limit) =>
  (await json(`${QDRANT}/collections/${collection}/points/search`, { method: 'POST', body: JSON.stringify({ vector: embeddings[0], limit, with_payload: true }) })).result;
const trouves = [...(await cherche('patients', 8)), ...(await cherche('connaissances', 2))];
console.log('\nSuche „Herr Weber Sturz“:');
for (const t of trouves) console.log(`  ${t.score.toFixed(3)}  [${t.payload.source_label}] ${t.payload.patient_id ?? '—'}  ${t.payload.titre}`);
const sources = [...new Set(trouves.map((t) => t.payload.source))];
verifier(sources.length >= 3, `die Suche liefert Abschnitte aus mindestens 3 verschiedenen Quellen (${sources.join(', ')})`);
verifier(trouves.some((t) => t.payload.patient_id === 'PAT-003' && /sturz/i.test(t.payload.texte)), 'ein Abschnitt von Herrn Weber (PAT-003) handelt vom Sturz');


// KIM-Schreiben: erwartete Zuordnung (Name UND Geburtsdatum; der Namensvetter Müller ist der am 01.12.1947 geborene).
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
verifier(lettres.length === 5, `a_verifier enthält die 5 KIM-Schreiben (${lettres.length})`);
for (const [fichier, patient] of Object.entries(attendu)) {
  const l = lettres.find((x) => x.payload.source_ref.endsWith(`/${fichier}`));
  verifier(l?.payload.patient_id === patient && l.payload.statut === 'a_verifier', `${fichier} dem Bewohner ${patient} zugeordnet (Status zu prüfen)`);
}
console.log(echecs === 0 ? '\nTEST AM ABEND: BESTANDEN' : `\nTEST AM ABEND: ${echecs} Fehler`);
process.exit(echecs === 0 ? 0 : 1);
