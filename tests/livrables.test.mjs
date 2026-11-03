// Tests hors n8n des LIVRABLES du cahier des charges (voir docs/LIVRABLES.md) :
//   1. docker-compose : n8n, Qdrant, Ollama (profil « ollama »), Mosquitto ;
//   2. 3 workflows exportés en JSON (rapport de garde et transmission, alarmes de capteurs, import des documents), RAG filtré par résident,
//      température de chaque appel à Llama entre 0,0 et 0,2 ;
//   3. la démonstration « alarme IoT puis mise à jour de l'index Qdrant » : l'alarme est indexée sans attendre l'IA.
// Lancer : node tests/livrables.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...c) => readFileSync(join(racine, ...c), 'utf8');
const workflow = (f) => JSON.parse(lire('workflows', f));
let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

test('docker-compose : n8n, Qdrant, Ollama et Mosquitto sont déclarés', () => {
  const c = lire('compose', 'docker-compose.yml');
  for (const s of ['n8n', 'qdrant', 'ollama', 'mosquitto']) assert.match(c, new RegExp(`^  ${s}:`, 'm'), `service ${s} absent`);
  assert.match(c, /ollama:[\s\S]*?profiles: \["ollama"\]/, 'Ollama est dans le profil « ollama » (le poste en a déjà un)');
  assert.match(c, /ollama:[\s\S]*?"11434:11434"/, 'Ollama publie 11434, l\'adresse déjà utilisée par n8n');
});

test('3 workflows : rapport de garde + transmission, alarmes de capteurs, import des documents (JSON dans workflows/)', () => {
  const ensembles = {
    'rapport de garde et transmission': ['67-brique-rapport-garde.json', '68-brique-etage-complet.json', '66-brique-apres-validation.json', '74-maitre-etage.json', '76-etage-automatique.json'],
    'alarmes de capteurs': ['81-alarme-capteur.json', '82-maitre-alarmes.json'],
    'import des documents': ['00-indexeur.json', '10-connecteur-logiciel-soins.json', '20-connecteur-fhir-hopital.json', '30-connecteur-fichiers.json', '40-connecteur-epa.json', '50-connecteur-kim.json', '83-courrier-automatique.json', '85-brique-courrier.json'],
  };
  for (const [nom, fichiers] of Object.entries(ensembles)) for (const f of fichiers) {
    assert.ok(existsSync(join(racine, 'workflows', f)), `${nom} : ${f} manque`);
    assert.ok(Array.isArray(workflow(f).nodes) && workflow(f).nodes.length > 0, `${f} n'est pas un export n8n`);
  }
});

test('température de CHAQUE appel à Llama entre 0,0 et 0,2', () => {
  // 1. tous les prompts
  const prompts = readdirSync(join(racine, 'prompts')).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md');
  assert.ok(prompts.length >= 7);
  for (const f of prompts) {
    const t = Number(/^temperature:\s*([0-9.]+)/m.exec(lire('prompts', f))?.[1]);
    assert.ok(t >= 0 && t <= 0.2, `${f} : température ${t}`);
  }
  // 2. la brique « rédiger » transmet la température du prompt (0,1 par défaut), jamais une valeur codée en dur au-dessus de 0,2
  const rediger = JSON.stringify(workflow('62-brique-rediger.json'));
  assert.match(rediger, /temperature: e\.temperature \?\? 0\.1/);
  // 3. tout autre workflow qui appelle /api/generate fixe lui-même la température
  for (const f of readdirSync(join(racine, 'workflows')).filter((x) => x.endsWith('.json'))) {
    const texte = lire('workflows', f);
    if (!texte.includes('api/generate') || f === '62-brique-rediger.json') continue;
    const t = Number(/temperature: ([0-9.]+)/.exec(texte)?.[1]);
    assert.ok(t >= 0 && t <= 0.2, `${f} appelle Llama sans température entre 0 et 0,2`);
  }
});

test('recherche RAG filtrée par résident (patient_id) dans « chercher »', () => {
  const noeuds = workflow('60-brique-chercher.json').nodes;
  for (const nom of ['Qdrant période', 'Qdrant fond']) {
    const n = noeuds.find((x) => x.name === nom);
    assert.ok(n, `${nom} introuvable`);
    assert.match(JSON.stringify(n.parameters), /patient_id/, `${nom} n'est pas filtré par patient_id`);
  }
  assert.match(JSON.stringify(workflow('60-brique-chercher.json')), /patient_id invalide/, 'patient_id contrôlé (PAT-001…)');
});

test('démonstration : l\'alarme est enregistrée, puis INDEXÉE dans Qdrant, avant toute génération', () => {
  const w = workflow('81-alarme-capteur.json');
  const suite = (nom) => (w.connections[nom]?.main?.[0] ?? []).map((x) => x.node);
  assert.ok(suite("Créer l'alarme").includes('Document RAG (alarme)'));
  assert.ok(suite('Document RAG (alarme)').includes('Indexer (alarme)'));
  assert.ok(suite('Indexer (alarme)').includes('Alarme enregistrée'));
  assert.ok(suite('Alarme enregistrée').includes('Contexte à générer ?'));
  const indexeur = JSON.stringify(workflow('00-indexeur.json'));
  assert.match(indexeur, /api\/embed/, 'l\'indexation utilise le modèle d\'embeddings');
  assert.doesNotMatch(indexeur, /api\/generate/, 'l\'indexation ne génère aucun texte');
  const indexer = w.nodes.find((n) => n.name === 'Indexer (alarme)');
  assert.equal(indexer.onError, 'continueRegularOutput', 'une erreur d\'indexation ne doit pas arrêter l\'alarme');
});

test('les documents livrables existent (README, LIVRABLES, RAPPORT, architecture)', () => {
  for (const f of ['README.md', 'docs/LIVRABLES.md', 'docs/RAPPORT.md', 'docs/architecture.md']) assert.ok(existsSync(join(racine, f)), `${f} manque`);
});

console.log(`\n${nb} tests réussis.`);
