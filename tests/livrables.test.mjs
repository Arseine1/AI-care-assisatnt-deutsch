// Tests ohne n8n zu den LIEFERGEGENSTÄNDEN des Pflichtenhefts (siehe docs/LIVRABLES.md):
//   1. docker-compose: n8n, Qdrant, Ollama (Profil « ollama »), Mosquitto;
//   2. 3 als JSON exportierte Workflows (Dienstbericht und Weitergabe, Sensoralarme, Dokumentenimport), RAG nach Bewohner gefiltert,
//      Temperatur jedes Aufrufs von Llama zwischen 0,0 und 0,2;
//   3. die Demonstration « IoT-Alarm, dann Aktualisierung des Qdrant-Index »: Der Alarm wird indexiert, ohne auf die KI zu warten.
// Start: node tests/livrables.test.mjs   (nach node workflows/generer.mjs)
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

test('docker-compose: n8n, Qdrant, Ollama und Mosquitto sind deklariert', () => {
  const c = lire('compose', 'docker-compose.yml');
  for (const s of ['n8n', 'qdrant', 'ollama', 'mosquitto']) assert.match(c, new RegExp(`^  ${s}:`, 'm'), `Dienst ${s} fehlt`);
  assert.match(c, /ollama:[\s\S]*?profiles: \["ollama"\]/, 'Ollama liegt im Profil « ollama » (der Rechner hat bereits eines)');
  assert.match(c, /ollama:[\s\S]*?"11434:11434"/, 'Ollama veröffentlicht 11434, die von n8n bereits verwendete Adresse');
});

test('3 Workflows: Dienstbericht + Weitergabe, Sensoralarme, Dokumentenimport (JSON in workflows/)', () => {
  const ensembles = {
    'Dienstbericht und Weitergabe': ['67-brique-rapport-garde.json', '68-brique-etage-complet.json', '66-brique-apres-validation.json', '74-maitre-etage.json', '76-etage-automatique.json'],
    'Sensoralarme': ['81-alarme-capteur.json', '82-maitre-alarmes.json'],
    'Dokumentenimport': ['00-indexeur.json', '10-connecteur-logiciel-soins.json', '20-connecteur-fhir-hopital.json', '30-connecteur-fichiers.json', '40-connecteur-epa.json', '50-connecteur-kim.json', '83-courrier-automatique.json', '85-brique-courrier.json'],
  };
  for (const [nom, fichiers] of Object.entries(ensembles)) for (const f of fichiers) {
    assert.ok(existsSync(join(racine, 'workflows', f)), `${nom}: ${f} fehlt`);
    assert.ok(Array.isArray(workflow(f).nodes) && workflow(f).nodes.length > 0, `${f} ist kein n8n-Export`);
  }
});

test('Temperatur JEDES Aufrufs von Llama zwischen 0,0 und 0,2', () => {
  // 1. alle Prompts
  const prompts = readdirSync(join(racine, 'prompts')).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md');
  assert.ok(prompts.length >= 7);
  for (const f of prompts) {
    const t = Number(/^temperature:\s*([0-9.]+)/m.exec(lire('prompts', f))?.[1]);
    assert.ok(t >= 0 && t <= 0.2, `${f}: Temperatur ${t}`);
  }
  // 2. der Baustein « Verfassen » gibt die Temperatur des Prompts weiter (standardmäßig 0,1), nie einen fest codierten Wert über 0,2
  const rediger = JSON.stringify(workflow('62-brique-rediger.json'));
  assert.match(rediger, /temperature: e\.temperature \?\? 0\.1/);
  // 3. jeder andere Workflow, der /api/generate aufruft, legt die Temperatur selbst fest
  for (const f of readdirSync(join(racine, 'workflows')).filter((x) => x.endsWith('.json'))) {
    const texte = lire('workflows', f);
    if (!texte.includes('api/generate') || f === '62-brique-rediger.json') continue;
    const t = Number(/temperature: ([0-9.]+)/.exec(texte)?.[1]);
    assert.ok(t >= 0 && t <= 0.2, `${f} ruft Llama ohne Temperatur zwischen 0 und 0,2 auf`);
  }
});

test('RAG-Suche nach Bewohner (patient_id) gefiltert in « Suchen »', () => {
  const noeuds = workflow('60-brique-chercher.json').nodes;
  for (const nom of ['Qdrant Zeitraum', 'Qdrant Hintergrund']) {
    const n = noeuds.find((x) => x.name === nom);
    assert.ok(n, `${nom} nicht gefunden`);
    assert.match(JSON.stringify(n.parameters), /patient_id/, `${nom} ist nicht nach patient_id gefiltert`);
  }
  assert.match(JSON.stringify(workflow('60-brique-chercher.json')), /Ungültige patient_id/, 'patient_id geprüft (PAT-001…)');
});

test('Demonstration: Der Alarm wird gespeichert, dann in Qdrant INDEXIERT, vor jeder Erzeugung', () => {
  const w = workflow('81-alarme-capteur.json');
  const suite = (nom) => (w.connections[nom]?.main?.[0] ?? []).map((x) => x.node);
  assert.ok(suite("Alarm erstellen").includes('RAG-Dokument (Alarm)'));
  assert.ok(suite('RAG-Dokument (Alarm)').includes('Indizieren (Alarm)'));
  assert.ok(suite('Indizieren (Alarm)').includes('Alarm gespeichert'));
  assert.ok(suite('Alarm gespeichert').includes('Kontext erzeugen?'));
  const indexeur = JSON.stringify(workflow('00-indexeur.json'));
  assert.match(indexeur, /api\/embed/, 'die Indexierung verwendet das Embedding-Modell');
  assert.doesNotMatch(indexeur, /api\/generate/, 'die Indexierung erzeugt keinen Text');
  const indexer = w.nodes.find((n) => n.name === 'Indizieren (Alarm)');
  assert.equal(indexer.onError, 'continueRegularOutput', 'ein Indexierungsfehler darf den Alarm nicht stoppen');
});

test('Die Liefer-Dokumente existieren (README, LIVRABLES, RAPPORT, architecture)', () => {
  for (const f of ['README.md', 'docs/LIVRABLES.md', 'docs/RAPPORT.md', 'docs/architecture.md']) assert.ok(existsSync(join(racine, f)), `${f} fehlt`);
});

console.log(`\n${nb} Tests bestanden.`);
