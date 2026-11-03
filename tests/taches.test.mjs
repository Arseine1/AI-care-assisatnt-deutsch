// Tests hors n8n de l'étape 4 du jour 4 : tâches de fond fiables (battement de coeur, annulation, reprise au démarrage de n8n).
// Les comportements SQL sont rejoués sur la vraie base par tests/taches-live.mjs.
// Lancer : node tests/taches.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { racine, workflow, jsCode, lancer } from './lib/prompts-harness.mjs';

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};
const noeud = (wf, nom) => {
  const n = wf.nodes.find((x) => x.name === nom);
  assert.ok(n, `nœud « ${nom} » introuvable`);
  return n;
};
const voisins = (wf, nom) => (wf.connections[nom]?.main ?? []).flatMap((liste, sortie) => (liste ?? []).map((l) => ({ vers: l.node, sortie })));
function chemins(wf, depart, estCible) {
  const res = [];
  const aller = (nom, chemin) => {
    if (estCible(noeud(wf, nom))) res.push([...chemin, { nom, sortie: null }]);
    for (const v of voisins(wf, nom)) if (!chemin.some((c) => c.nom === v.vers)) aller(v.vers, [...chemin, { nom, sortie: v.sortie }]);
  };
  aller(depart, []);
  return res;
}
const appelle = (id) => (n) => n?.type === 'n8n-nodes-base.executeWorkflow' && n.parameters?.workflowId?.value === id;
const idDe = (fichier) => workflow(fichier).id;

// ---------------------------------------------------------------- schéma
const schema = readFileSync(join(racine, 'data', 'sql', '01_schema.sql'), 'utf8');
test('schéma : battement de coeur et statuts « interrompue » et « annulee »', () => {
  assert.match(schema, /ADD COLUMN IF NOT EXISTS heartbeat timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(schema, /CHECK \(statut IN \('en_cours', 'termine', 'termine_avec_erreurs', 'interrompue', 'annulee'\)\)/);
});

// ---------------------------------------------------------------- rapport d'un résident (étage)
const resident = workflow('67-brique-rapport-garde.json');
test('rapport d\'un résident : le contrôle de la tâche précède toute recherche et toute génération', () => {
  const versIa = chemins(resident, 'Entrée', (n) => [idDe('60-brique-chercher.json'), idDe('61-brique-template.json'), idDe('62-brique-rediger.json')].some((id) => appelle(id)(n)));
  assert.ok(versIa.length >= 1);
  for (const c of versIa) {
    const noms = c.map((x) => x.nom);
    assert.ok(noms.indexOf('Tâche toujours voulue') >= 0 && noms.indexOf('Tâche toujours voulue') < noms.indexOf('Chercher'));
    assert.equal(c.find((x) => x.nom === 'Tâche en cours ?').sortie, 0, 'seule la sortie « en cours » mène à l\'IA');
  }
});
test('rapport d\'un résident : une tâche annulée ou interrompue ne lance aucune génération', () => {
  const ignore = voisins(resident, 'Tâche en cours ?').find((v) => v.sortie === 1).vers;
  assert.equal(ignore, 'Résident ignoré');
  assert.deepEqual(voisins(resident, 'Résident ignoré'), []);
  const sortie = lancer(jsCode('67-brique-rapport-garde.json', 'Résident ignoré'), { noeuds: { 'Entrée': [{ task_id: 'T', patient_id: 'PAT-001' }] } })[0];
  assert.deepEqual(sortie, { ignore: true, task_id: 'T', patient_id: 'PAT-001' });
});
test('rapport d\'un résident : battement de coeur à chaque résident, et un résultat arrivé après l\'annulation est abandonné', () => {
  assert.match(noeud(resident, 'Tâche toujours voulue').parameters.options.queryReplacement ? noeud(resident, 'Tâche toujours voulue').parameters.query : '', /SET heartbeat = now\(\)[\s\S]*statut = 'en_cours'/);
  const avance = noeud(resident, 'Avancer la tâche').parameters.query;
  assert.match(avance, /heartbeat = now\(\)/);
  assert.match(avance, /statut = 'en_cours'/);
});
test('étage complet : la tâche n\'est « terminée » que si elle était encore en cours (une annulation n\'est jamais écrasée)', () => {
  for (const f of ['68-brique-etage-complet.json']) assert.match(noeud(workflow(f), 'Terminer la tâche').parameters.query, /AND statut = 'en_cours'/);
});

// ---------------------------------------------------------------- vérifier le document
const verif = workflow('77-maitre-verifier.json');
test('analyse complémentaire : contrôle de la tâche avant l\'extraction ET avant la comparaison ; une tâche arrêtée ne mène à rien', () => {
  for (const [controle, porte, cible] of [
    ['Analyse toujours voulue (extraction)', 'Analyse en cours ? (extraction)', 'Document à extraire'],
    ['Analyse toujours voulue (comparaison)', 'Analyse en cours ? (comparaison)', 'Faits pour comparer'],
  ]) {
    assert.match(noeud(verif, controle).parameters.query, /SET heartbeat = now\(\)[\s\S]*statut = 'en_cours'/);
    assert.deepEqual(voisins(verif, porte), [{ vers: cible, sortie: 0 }], `${porte} : seule la sortie « en cours » a une suite`);
  }
  const versTemplates = chemins(verif, 'Webhook', (n) => appelle(idDe('61-brique-template.json'))(n));
  for (const c of versTemplates) {
    const noms = c.map((x) => x.nom);
    if (noms.includes('Template (extraction)')) assert.ok(noms.includes('Analyse en cours ? (extraction)') || !noms.includes('Répondre tout de suite'), 'contrôle avant l\'extraction');
    if (noms.includes('Template (comparaison)')) assert.ok(noms.includes('Analyse en cours ? (comparaison)'), 'contrôle avant la comparaison');
  }
});
test('analyse complémentaire : le résultat n\'est écrit que si la tâche est encore en cours (pas d\'écrasement d\'une annulation)', () => {
  assert.match(noeud(verif, "Enregistrer l'analyse").parameters.query, /AND statut = 'en_cours'/);
});

// ---------------------------------------------------------------- annuler
const annuler = workflow('79-maitre-annuler.json');
test('annuler : seul un UUID est accepté', () => {
  const ctrl = jsCode('79-maitre-annuler.json', 'Contrôler la tâche');
  assert.equal(lancer(ctrl, { entree: { body: { tache_id: 'a1c3e000-0001-4000-8000-000000000001' } } })[0].tache_id, 'a1c3e000-0001-4000-8000-000000000001');
  for (const faux of ["x'; DROP TABLE soins.taches;--", '', '1']) assert.throws(() => lancer(ctrl, { entree: { body: { tache_id: faux } } }), /tache_id invalide/);
});
test('annuler : seule une tâche « en cours » peut être annulée, l\'annulation est journalisée', () => {
  const q = noeud(annuler, 'Annuler').parameters.query;
  assert.match(q, /UPDATE soins\.taches SET statut = 'annulee'[\s\S]*AND statut = 'en_cours'/);
  assert.match(q, /'tache_annulee'/);
  assert.doesNotMatch(noeud(annuler, 'Webhook').parameters.options.allowedOrigins, /\*/, 'plus d\'ouverture à toutes les origines');
});

// ---------------------------------------------------------------- reprise au démarrage et veilleur
const reprise = workflow('80-reprise-taches.json');
test('reprise : au démarrage de n8n, toute tâche « en cours » devient « interrompue » (n8n Trigger, événement init)', () => {
  const t = noeud(reprise, 'Démarrage de n8n');
  assert.equal(t.type, 'n8n-nodes-base.n8nTrigger');
  assert.deepEqual(t.parameters.events, ['init']);
  const q = noeud(reprise, 'Reprise au démarrage').parameters.query;
  assert.match(q, /SET statut = 'interrompue'[\s\S]*WHERE statut = 'en_cours' RETURNING/);
  assert.doesNotMatch(q, /heartbeat/, 'au démarrage, aucune condition de délai : plus rien ne peut tourner');
  assert.match(q, /'redemarrage'/);
  assert.deepEqual(voisins(reprise, 'Démarrage de n8n'), [{ vers: 'Reprise au démarrage', sortie: 0 }]);
});
test('veilleur : toutes les 5 minutes, une tâche sans battement depuis 30 minutes devient « interrompue »', () => {
  assert.equal(noeud(reprise, 'Toutes les 5 minutes').parameters.rule.interval[0].expression, '0 */5 * * * *');
  const q = noeud(reprise, 'Tâches sans signe de vie').parameters.query;
  assert.match(q, /statut = 'en_cours' AND heartbeat < now\(\) - interval '30 minutes'/);
  assert.match(q, /'sans_signe_de_vie'/);
});
test('l\'importeur publie aussi les workflows déclenchés au démarrage de n8n', () => {
  assert.match(readFileSync(join(racine, 'workflows', 'importer.mjs'), 'utf8'), /'n8nTrigger'/);
});

console.log(`\n${nb} tests réussis.`);
