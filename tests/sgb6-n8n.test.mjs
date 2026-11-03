// Cotisations retraite dans n8n : analyse statique des workflows GÉNÉRÉS (90 à 96), sans n8n.
//   - chaque webhook exige la clé et la session avant tout traitement
//   - le moteur de règles recopié dans les nœuds est celui de workflows/code/sgb6/regles.js, sans changement
//   - le journal ne contient ni nom ni numéro d'assurance
//   - la décision vient de la session et se juge sur le résultat ENREGISTRÉ
// Lancer : node tests/sgb6-n8n.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { racine, workflow } from './lib/prompts-harness.mjs';
import { traiterQuestionnaire, extraireChamps } from '../workflows/code/sgb6/regles.js';

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};
const WEBHOOKS = {
  'aicare-sgb6-lister': '90-sgb6-lister.json',
  'aicare-sgb6-deposer': '91-sgb6-deposer.json',
  'aicare-sgb6-lancer': '92-sgb6-lancer.json',
  'aicare-sgb6-tache': '94-sgb6-tache.json',
  'aicare-sgb6-dossier': '95-sgb6-dossier.json',
  'aicare-sgb6-decider': '96-sgb6-decider.json',
};
const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);
function chemins(wf, depart, estCible) {
  const res = [];
  const aller = (nom, chemin) => {
    if (estCible(noeud(wf, nom))) res.push([...chemin, { nom, sortie: null }]);
    for (const [i, liste] of (wf.connections[nom]?.main ?? []).entries()) for (const l of liste ?? []) if (!chemin.some((c) => c.nom === l.node)) aller(l.node, [...chemin, { nom, sortie: i }]);
  };
  aller(depart, []);
  return res;
}

test('les 6 webhooks sont protégés : clé X-AICare-Cle, origines limitées, session contrôlée avant tout autre nœud', () => {
  for (const [chemin, fichier] of Object.entries(WEBHOOKS)) {
    const wf = workflow(fichier);
    const w = noeud(wf, 'Webhook');
    assert.equal(w.parameters.path, chemin);
    assert.equal(w.parameters.authentication, 'headerAuth', `${chemin} : clé`);
    assert.ok(w.credentials?.httpHeaderAuth, `${chemin} : credential de la clé`);
    assert.notEqual(w.parameters.options.allowedOrigins, '*', `${chemin} : CORS limité`);
    // tout nœud du workflow (hors contrôle de session et refus) n'est atteint qu'en passant par « Session valide ? » (sortie vrai)
    const gardes = new Set(['Webhook', 'Session (jeton)', 'Session (base)', 'Session', 'Session valide ?', 'Refus (session)', 'Répondre (session)', 'Requête']);
    for (const n of wf.nodes.filter((x) => !gardes.has(x.name))) {
      const vers = chemins(wf, 'Webhook', (x) => x?.name === n.name);
      assert.ok(vers.length >= 1, `${chemin} : « ${n.name} » atteignable`);
      for (const c of vers) {
        const porte = c.find((x) => x.nom === 'Session valide ?');
        assert.ok(porte && porte.sortie === 0, `${chemin} : « ${n.name} » atteint sans session valide`);
      }
    }
  }
});

test('le moteur recopié dans les nœuds est celui de regles.js, sans modification', () => {
  const source = readFileSync(join(racine, 'workflows', 'code', 'sgb6', 'regles.js'), 'utf8')
    .replace(/\r/g, '')
    .replace(/^import valeursJson .*$/m, '')
    .replace(/^export /gm, '');
  // on compare tout sauf la ligne d'import remplacée par les valeurs légales (vérifiées à part)
  const corps = source.slice(source.indexOf('let VALEURS'));
  let compte = 0;
  for (const fichier of readdirSync(join(racine, 'workflows')).filter((f) => /^9\d-sgb6.*\.json$/.test(f))) {
    for (const n of workflow(fichier).nodes.filter((x) => x.type === 'n8n-nodes-base.code' && /traiterQuestionnaire|extraireChamps|detecterSuspects|champsDepuisIA|consigneLectureIA/.test(x.parameters.jsCode))) {
      assert.ok(n.parameters.jsCode.includes(corps), `${fichier} / ${n.name} : le moteur diffère de regles.js`);
      assert.match(n.parameters.jsCode, /const valeursJson = \{/, `${fichier} / ${n.name} : valeurs légales`);
      assert.doesNotMatch(n.parameters.jsCode, /^import |^export /m, `${fichier} / ${n.name}`);
      compte++;
    }
  }
  assert.ok(compte >= 5, `nœuds avec le moteur : ${compte}`);
});

test('l\'IA ne touche ni au calcul ni à la décision : les nœuds des étapes 3 à 7 ne contiennent aucun appel HTTP', () => {
  const wf = workflow('93-sgb6-agent.json');
  for (const nom of ['Contrôler les champs', 'Lire le dossier de la caisse', 'Vérifier les règles', 'Calculer la cotisation', 'Préparer la déclaration', 'Résultat']) {
    const code = noeud(wf, nom).parameters.jsCode;
    assert.doesNotMatch(code.slice(code.indexOf('// ---- nœud')), /fetch|api\/generate|\$http|helpers\.httpRequest/, nom);
  }
  assert.match(noeud(wf, 'Calculer la cotisation').parameters.jsCode.slice(-300), /etapeCalculer\(/);
  assert.doesNotMatch(JSON.stringify(workflow('96-sgb6-decider.json')), /api\/generate|ollama/i);
});

test('le journal ne contient ni nom ni numéro d\'assurance (étapes réelles des 9 questionnaires + valeurs écrites par les nœuds)', () => {
  const caisse = JSON.parse(readFileSync(join(racine, 'data', 'sgb6', 'caisse.json'), 'utf8'));
  const dossier = join(racine, 'data', 'sgb6', 'questionnaires');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.txt'))) {
    const texte = readFileSync(join(dossier, f), 'utf8');
    const { donnees } = extraireChamps(texte);
    const r = traiterQuestionnaire(texte, { caisse, annee: 2026, id: f.replace('.txt', '') });
    const journal = JSON.stringify(r.journal);
    const interdits = [donnees.aidant_nom, donnees.aidant_prenom, donnees.personne_nom, donnees.personne_prenom, donnees.numero_assurance, donnees.adresse, donnees.aidant_naissance];
    for (const v of interdits.filter(Boolean)) assert.ok(!journal.includes(String(v)), `${f} : « ${v} » dans le journal`);
    assert.doesNotMatch(journal, /\d{8}[A-Z]\d{3}/, `${f} : numéro d'assurance dans le journal`);
  }
  // les lignes du journal sont écrites avec des chaînes fixes et des comptes : jamais $json.donnees, texte, extraction ni motifs
  const agent = JSON.stringify(workflow('93-sgb6-agent.json'));
  const insertions = [...agent.matchAll(/INSERT INTO soins\.sgb6_journal[^"]*"/g)].map((m) => m[0]);
  assert.ok(insertions.length >= 2);
  const lecture = readFileSync(join(racine, 'workflows', 'code', 'sgb6-agent-lire.js'), 'utf8');
  assert.doesNotMatch(lecture, /resultat: `[^`]*\$\{(texte|d\.questionnaire)[^`.]*\}/);
});

test('décider : le soignant vient de la session, jamais de la requête ; valider se juge sur le résultat enregistré', () => {
  const wf = workflow('96-sgb6-decider.json');
  const sansCommentaires = (c) => c.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(sansCommentaires(noeud(wf, 'Contrôler la décision').parameters.jsCode), /soignant|signature|valide_par/);
  assert.match(noeud(wf, 'Vérifier la décision').parameters.jsCode, /\$\('Session'\)\.first\(\)\.json\.soignant\.identifiant/);
  assert.match(noeud(wf, 'Dossier').parameters.query, /jsonb_path_exists\(resultat, '\$\.regles\[\*\] \? \(@\.statut != "ok"\)'\)/);
  const verif = noeud(wf, 'Vérifier la décision').parameters.jsCode;
  assert.match(verif, /regle_non_ok/);
  assert.match(verif, /motif_obligatoire/);
  assert.match(verif, /refus_hors_exception/);
  // l'écriture n'a lieu que si le dossier est encore en attente
  assert.match(noeud(wf, 'Appliquer la décision').parameters.query, /statut IN \('pret_a_valider', 'exception'\)/);
});

test('dépôt : 1 Mo, .txt et .pdf seulement, PDF avec du texte (pas de scan)', () => {
  const wf = workflow('91-sgb6-deposer.json');
  const c = noeud(wf, 'Contrôler le dépôt').parameters.jsCode;
  assert.match(c, /\(txt\|pdf\)/);
  assert.match(c, /1048576/);
  assert.match(noeud(wf, 'Texte du PDF').parameters.jsCode, /methode !== 'texte'/);
});


test('agent piloté : 12 tours déroulés (préparer, modèle, fusion, garde et outil, journal, continuer ?), tâche active contrôlée, repli sur la mission guidée', () => {
  const wf = workflow('93-sgb6-agent.json');
  for (let k = 1; k <= 12; k++) {
    for (const nom of [`Tour ${k} : préparer`, `Pilote SGB VI (tour ${k})`, `Tour ${k} : fusion`, `Tour ${k} : garde et outil`, `Tour ${k} terminé`, `Tour ${k} : continuer ?`]) assert.ok(noeud(wf, nom), nom);
    const suite = wf.connections[`Tour ${k} : continuer ?`].main;
    assert.equal(suite[0][0].node, k < 12 ? `Tour ${k + 1} : préparer` : 'Fin du pilotage');
    assert.equal(suite[1][0].node, 'Fin du pilotage');
    // le tour s'enchaîne sans raccourci : modèle, puis garde (sous-workflow), puis journal
    assert.equal(wf.connections[`Pilote SGB VI (tour ${k})`].main[0][0].node, `Tour ${k} : fusion`);
    assert.equal(wf.connections[`Tour ${k} : fusion`].main[0][0].node, `Tour ${k} : garde et outil`);
    assert.equal(wf.connections[`Tour ${k} : garde et outil`].main[0][0].node, `Tour ${k} terminé`);
    // journal du tour : choisi par le modèle, avec la raison et le verdict de la garde
    const sql = noeud(wf, `Tour ${k} terminé`).parameters.query;
    assert.match(sql, /'tour', \$3, \$4, \$5, \$6::boolean, \$7::int, 'modele'/);
  }
  assert.equal(noeud(wf, 'Fin du pilotage').parameters.jsCode.includes("r.statut !== 'en_cours'"), true);
  assert.equal(wf.connections['Pilotage abouti ?'].main[1][0].node, 'Repli sur la mission guidée');
  assert.equal(wf.connections['Repli sur la mission guidée'].main[0][0].node, 'Lire le questionnaire');
  assert.match(noeud(wf, 'Repli sur la mission guidée').parameters.query, /pilotage par le modèle abandonné : /);
  assert.match(noeud(wf, 'Résultat').parameters.jsCode, /pilotage par le modèle abandonné/);
  // les tâches annulées ou interrompues ne sont pas réécrites : le tour n'écrit que sur une tâche « en cours »
  assert.match(noeud(wf, 'Tour 1 terminé').parameters.query, /AND statut = 'en_cours' RETURNING statut/);
});
test('agent piloté : requête /api/chat avec outils, température 0, num_ctx 8192, keep_alive 30m, 10 outils sans valider ni refuser, réponse de 5 minutes au plus', () => {
  const wf = workflow('93-sgb6-agent.json');
  const http = noeud(wf, 'Pilote SGB VI (tour 1)');
  assert.match(http.parameters.url, /11434\/api\/chat$/);
  assert.equal(http.parameters.options.timeout, 300000);
  assert.equal(http.onError, 'continueRegularOutput');
  const corps = http.parameters.jsonBody;
  assert.match(corps, /temperature: 0,/);
  assert.match(corps, /num_ctx: 8192/);
  assert.match(corps, /keep_alive: '30m'/);
  assert.match(corps, /stream: false/);
  const noms = [...corps.matchAll(/"name": "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(noms, ['lire_questionnaire', 'extraire_champs_par_regles', 'extraire_champs_par_ia', 'lire_dossier_caisse', 'controler_champs', 'verifier_regles', 'calculer_cotisation', 'preparer_brouillon', 'creer_tache_revue', 'terminer']);
  assert.doesNotMatch(corps, /valider|refuser/);
});
test('agent piloté : l\'agent (garde, outils, tour) recopié tel quel dans les nœuds ; le sous-workflow « un tour » est le seul à exécuter les outils', () => {
  const agent = readFileSync(join(racine, 'workflows', 'code', 'sgb6', 'agent.js'), 'utf8').replace(/\r/g, '').replace(/^import \{[\s\S]*?\} from '\.\/regles\.js';\n/m, '').replace(/^export /gm, '');
  let compte = 0;
  for (const fichier of ['93-sgb6-agent.json', '97-sgb6-tour.json']) {
    for (const n of workflow(fichier).nodes.filter((x) => x.type === 'n8n-nodes-base.code' && /tourDeModele|nouvelleSession|resultatPilote/.test(x.parameters.jsCode))) {
      assert.ok(n.parameters.jsCode.includes(agent), `${fichier} / ${n.name} : l'agent diffère de agent.js`);
      compte++;
    }
  }
  assert.equal(compte, 3); // démarrer, résultat (pilote), un tour
  const tour = workflow('97-sgb6-tour.json');
  assert.match(tour.nodes.find((n) => n.name === 'Pilote SGB VI : garde et outils').parameters.jsCode, /await tourDeModele\(sess, reponse/);
  for (const f of readdirSync(join(racine, 'workflows')).filter((x) => /^\d\d-.*\.json$/.test(x) && x !== '97-sgb6-tour.json' && x !== '93-sgb6-agent.json')) assert.doesNotMatch(JSON.stringify(workflow(f)), /tourDeModele/, f);
});
test('lancer : le pilote (modele ou guidee) est contrôlé, la tâche compte 12 tours ou 7 étapes', () => {
  const wf = workflow('92-sgb6-lancer.json');
  const c = noeud(wf, 'Contrôler le lancement').parameters.jsCode;
  assert.match(c, /\['modele', 'guidee'\]/);
  assert.match(noeud(wf, 'Créer la tâche').parameters.query, /CASE WHEN \$4::text = 'modele' THEN 12 ELSE 7 END/);
});
console.log(`\n${nb} tests réussis.`);
