// Rentenbeiträge in n8n: statische Analyse der GENERIERTEN Workflows (90 bis 96), ohne n8n.
//   - jeder Webhook verlangt den Schlüssel und die Sitzung vor jeder Verarbeitung
//   - die in die Knoten kopierte Regel-Engine ist die aus workflows/code/sgb6/regles.js, unverändert
//   - das Protokoll enthält weder Namen noch Versicherungsnummer
//   - die Entscheidung stammt aus der Sitzung und wird am GESPEICHERTEN Ergebnis beurteilt
// Starten: node tests/sgb6-n8n.test.mjs   (nach node workflows/generer.mjs)
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

test('die 6 Webhooks sind geschützt: Schlüssel X-AICare-Cle, begrenzte Ursprünge, Sitzung vor jedem anderen Knoten geprüft', () => {
  for (const [chemin, fichier] of Object.entries(WEBHOOKS)) {
    const wf = workflow(fichier);
    const w = noeud(wf, 'Webhook');
    assert.equal(w.parameters.path, chemin);
    assert.equal(w.parameters.authentication, 'headerAuth', `${chemin}: Schlüssel`);
    assert.ok(w.credentials?.httpHeaderAuth, `${chemin}: Credential des Schlüssels`);
    assert.notEqual(w.parameters.options.allowedOrigins, '*', `${chemin}: CORS begrenzt`);
    // jeder Knoten des Workflows (außer Sitzungsprüfung und Ablehnung) wird nur über „Sitzung gültig?“ (Ausgang wahr) erreicht
    const gardes = new Set(['Webhook', 'Sitzung (Token)', 'Sitzung (Datenbank)', 'Sitzung', 'Sitzung gültig?', 'Ablehnung (Sitzung)', 'Antworten (Sitzung)', 'Anfrage']);
    for (const n of wf.nodes.filter((x) => !gardes.has(x.name))) {
      const vers = chemins(wf, 'Webhook', (x) => x?.name === n.name);
      assert.ok(vers.length >= 1, `${chemin}: „${n.name}“ erreichbar`);
      for (const c of vers) {
        const porte = c.find((x) => x.nom === 'Sitzung gültig?');
        assert.ok(porte && porte.sortie === 0, `${chemin}: „${n.name}“ ohne gültige Sitzung erreicht`);
      }
    }
  }
});

test('die in die Knoten kopierte Engine ist die aus regles.js, unverändert', () => {
  const source = readFileSync(join(racine, 'workflows', 'code', 'sgb6', 'regles.js'), 'utf8')
    .replace(/\r/g, '')
    .replace(/^import valeursJson .*$/m, '')
    .replace(/^export /gm, '');
  // verglichen wird alles außer der Import-Zeile, die durch die gesetzlichen Werte ersetzt wird (separat geprüft)
  const corps = source.slice(source.indexOf('let VALEURS'));
  let compte = 0;
  for (const fichier of readdirSync(join(racine, 'workflows')).filter((f) => /^9\d-sgb6.*\.json$/.test(f))) {
    for (const n of workflow(fichier).nodes.filter((x) => x.type === 'n8n-nodes-base.code' && /traiterQuestionnaire|extraireChamps|detecterSuspects|champsDepuisIA|consigneLectureIA/.test(x.parameters.jsCode))) {
      assert.ok(n.parameters.jsCode.includes(corps), `${fichier} / ${n.name}: Die Engine weicht von regles.js ab`);
      assert.match(n.parameters.jsCode, /const valeursJson = \{/, `${fichier} / ${n.name}: gesetzliche Werte`);
      assert.doesNotMatch(n.parameters.jsCode, /^import |^export /m, `${fichier} / ${n.name}`);
      compte++;
    }
  }
  assert.ok(compte >= 5, `Knoten mit der Engine: ${compte}`);
});

test('die KI berührt weder Berechnung noch Entscheidung: Die Knoten der Schritte 3 bis 7 enthalten keinen HTTP-Aufruf', () => {
  const wf = workflow('93-sgb6-agent.json');
  for (const nom of ['Felder prüfen', 'Kassenakte lesen', 'Regeln überprüfen', 'Beitrag berechnen', 'Meldung vorbereiten', 'Ergebnis']) {
    const code = noeud(wf, nom).parameters.jsCode;
    assert.doesNotMatch(code.slice(code.indexOf('// ---- Knoten')), /fetch|api\/generate|\$http|helpers\.httpRequest/, nom);
  }
  assert.match(noeud(wf, 'Beitrag berechnen').parameters.jsCode.slice(-300), /etapeCalculer\(/);
  assert.doesNotMatch(JSON.stringify(workflow('96-sgb6-decider.json')), /api\/generate|ollama/i);
});

test('das Protokoll enthält weder Namen noch Versicherungsnummer (reale Schritte der 9 Fragebögen + von den Knoten geschriebene Werte)', () => {
  const caisse = JSON.parse(readFileSync(join(racine, 'data', 'sgb6', 'caisse.json'), 'utf8'));
  const dossier = join(racine, 'data', 'sgb6', 'questionnaires');
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.txt'))) {
    const texte = readFileSync(join(dossier, f), 'utf8');
    const { donnees } = extraireChamps(texte);
    const r = traiterQuestionnaire(texte, { caisse, annee: 2026, id: f.replace('.txt', '') });
    const journal = JSON.stringify(r.journal);
    const interdits = [donnees.aidant_nom, donnees.aidant_prenom, donnees.personne_nom, donnees.personne_prenom, donnees.numero_assurance, donnees.adresse, donnees.aidant_naissance];
    for (const v of interdits.filter(Boolean)) assert.ok(!journal.includes(String(v)), `${f}: „${v}“ im Protokoll`);
    assert.doesNotMatch(journal, /\d{8}[A-Z]\d{3}/, `${f}: Versicherungsnummer im Protokoll`);
  }
  // die Protokollzeilen werden mit festen Zeichenketten und Zählwerten geschrieben: nie $json.donnees, Text, Extraktion oder Gründe
  const agent = JSON.stringify(workflow('93-sgb6-agent.json'));
  const insertions = [...agent.matchAll(/INSERT INTO soins\.sgb6_journal[^"]*"/g)].map((m) => m[0]);
  assert.ok(insertions.length >= 2);
  const lecture = readFileSync(join(racine, 'workflows', 'code', 'sgb6-agent-lire.js'), 'utf8');
  assert.doesNotMatch(lecture, /resultat: `[^`]*\$\{(texte|d\.questionnaire)[^`.]*\}/);
});

test('entscheiden: Die Pflegekraft stammt aus der Sitzung, nie aus der Anfrage; das Bestätigen wird am gespeicherten Ergebnis beurteilt', () => {
  const wf = workflow('96-sgb6-decider.json');
  const sansCommentaires = (c) => c.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(sansCommentaires(noeud(wf, 'Entscheidung prüfen').parameters.jsCode), /soignant|signature|valide_par/);
  assert.match(noeud(wf, 'Entscheidung überprüfen').parameters.jsCode, /\$\('Sitzung'\)\.first\(\)\.json\.soignant\.identifiant/);
  assert.match(noeud(wf, 'Akte').parameters.query, /jsonb_path_exists\(resultat, '\$\.regles\[\*\] \? \(@\.statut != "ok"\)'\)/);
  const verif = noeud(wf, 'Entscheidung überprüfen').parameters.jsCode;
  assert.match(verif, /regle_non_ok/);
  assert.match(verif, /motif_obligatoire/);
  assert.match(verif, /refus_hors_exception/);
  // geschrieben wird nur, wenn die Akte noch aussteht
  assert.match(noeud(wf, 'Entscheidung anwenden').parameters.query, /statut IN \('pret_a_valider', 'exception'\)/);
});

test('Ablage: 1 MB, nur .txt und .pdf, PDF mit Text (kein Scan)', () => {
  const wf = workflow('91-sgb6-deposer.json');
  const c = noeud(wf, 'Upload prüfen').parameters.jsCode;
  assert.match(c, /\(txt\|pdf\)/);
  assert.match(c, /1048576/);
  assert.match(noeud(wf, 'PDF-Text').parameters.jsCode, /methode !== 'texte'/);
});


test('gesteuerter Agent: 12 abgewickelte Runden (vorbereiten, Modell, Zusammenführung, Wächter und Werkzeug, Protokoll, weiter?), aktive Aufgabe geprüft, Rückfall auf den geführten Auftrag', () => {
  const wf = workflow('93-sgb6-agent.json');
  for (let k = 1; k <= 12; k++) {
    for (const nom of [`Runde ${k}: vorbereiten`, `SGB-VI-Pilot (Runde ${k})`, `Runde ${k}: Zusammenführung`, `Runde ${k}: Wächter und Werkzeug`, `Runde ${k} beendet`, `Runde ${k}: weiter?`]) assert.ok(noeud(wf, nom), nom);
    const suite = wf.connections[`Runde ${k}: weiter?`].main;
    assert.equal(suite[0][0].node, k < 12 ? `Runde ${k + 1}: vorbereiten` : 'Ende der Steuerung');
    assert.equal(suite[1][0].node, 'Ende der Steuerung');
    // die Runde läuft ohne Abkürzung ab: Modell, dann Wächter (Unter-Workflow), dann Protokoll
    assert.equal(wf.connections[`SGB-VI-Pilot (Runde ${k})`].main[0][0].node, `Runde ${k}: Zusammenführung`);
    assert.equal(wf.connections[`Runde ${k}: Zusammenführung`].main[0][0].node, `Runde ${k}: Wächter und Werkzeug`);
    assert.equal(wf.connections[`Runde ${k}: Wächter und Werkzeug`].main[0][0].node, `Runde ${k} beendet`);
    // Protokoll der Runde: vom Modell gewählt, mit der Begründung und dem Urteil des Wächters
    const sql = noeud(wf, `Runde ${k} beendet`).parameters.query;
    assert.match(sql, /'tour', \$3, \$4, \$5, \$6::boolean, \$7::int, 'modele'/);
  }
  assert.equal(noeud(wf, 'Ende der Steuerung').parameters.jsCode.includes("r.statut !== 'en_cours'"), true);
  assert.equal(wf.connections['Steuerung erfolgreich?'].main[1][0].node, 'Rückfall auf die geführte Mission');
  assert.equal(wf.connections['Rückfall auf die geführte Mission'].main[0][0].node, 'Fragebogen lesen');
  assert.match(noeud(wf, 'Rückfall auf die geführte Mission').parameters.query, /Steuerung durch das Modell aufgegeben: /);
  assert.match(noeud(wf, 'Ergebnis').parameters.jsCode, /Steuerung durch das Modell abgebrochen/);
  // abgebrochene oder unterbrochene Aufgaben werden nicht überschrieben: Die Runde schreibt nur auf eine Aufgabe „en_cours“
  assert.match(noeud(wf, 'Runde 1 beendet').parameters.query, /AND statut = 'en_cours' RETURNING statut/);
});
test('gesteuerter Agent: Anfrage /api/chat mit Werkzeugen, Temperatur 0, num_ctx 8192, keep_alive 30m, 10 Werkzeuge ohne Bestätigen oder Ablehnen, Antwort in höchstens 5 Minuten', () => {
  const wf = workflow('93-sgb6-agent.json');
  const http = noeud(wf, 'SGB-VI-Pilot (Runde 1)');
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
test('gesteuerter Agent: Der Agent (Wächter, Werkzeuge, Runde) ist unverändert in die Knoten kopiert; der Unter-Workflow „eine Runde“ führt als Einziger die Werkzeuge aus', () => {
  const agent = readFileSync(join(racine, 'workflows', 'code', 'sgb6', 'agent.js'), 'utf8').replace(/\r/g, '').replace(/^import \{[\s\S]*?\} from '\.\/regles\.js';\n/m, '').replace(/^export /gm, '');
  let compte = 0;
  for (const fichier of ['93-sgb6-agent.json', '97-sgb6-tour.json']) {
    for (const n of workflow(fichier).nodes.filter((x) => x.type === 'n8n-nodes-base.code' && /tourDeModele|nouvelleSession|resultatPilote/.test(x.parameters.jsCode))) {
      assert.ok(n.parameters.jsCode.includes(agent), `${fichier} / ${n.name}: Der Agent weicht von agent.js ab`);
      compte++;
    }
  }
  assert.equal(compte, 3); // Start, Ergebnis (Pilot), eine Runde
  const tour = workflow('97-sgb6-tour.json');
  assert.match(tour.nodes.find((n) => n.name === 'SGB-VI-Pilot: Wächter und Werkzeuge').parameters.jsCode, /await tourDeModele\(sess, reponse/);
  for (const f of readdirSync(join(racine, 'workflows')).filter((x) => /^\d\d-.*\.json$/.test(x) && x !== '97-sgb6-tour.json' && x !== '93-sgb6-agent.json')) assert.doesNotMatch(JSON.stringify(workflow(f)), /tourDeModele/, f);
});
test('starten: Der Pilot (modele oder guidee) wird geprüft, die Aufgabe zählt 12 Runden oder 7 Schritte', () => {
  const wf = workflow('92-sgb6-lancer.json');
  const c = noeud(wf, 'Start prüfen').parameters.jsCode;
  assert.match(c, /\['modele', 'guidee'\]/);
  assert.match(noeud(wf, 'Aufgabe erstellen').parameters.query, /CASE WHEN \$4::text = 'modele' THEN 12 ELSE 7 END/);
});
console.log(`\n${nb} Tests bestanden.`);
