// Tests außerhalb von n8n, Schritt 4 von Tag 4: zuverlässige Hintergrundaufgaben (Lebenszeichen, Abbruch, Wiederaufnahme beim Start von n8n).
// Das SQL-Verhalten wird von tests/taches-live.mjs auf der echten Datenbank nachgespielt.
// Start: node tests/taches.test.mjs   (nach node workflows/generer.mjs)
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
  assert.ok(n, `Knoten „${nom}“ nicht gefunden`);
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

// ---------------------------------------------------------------- Schema
const schema = readFileSync(join(racine, 'data', 'sql', '01_schema.sql'), 'utf8');
test('Schema: Lebenszeichen und Status „interrompue“ und „annulee“', () => {
  assert.match(schema, /ADD COLUMN IF NOT EXISTS heartbeat timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(schema, /CHECK \(statut IN \('en_cours', 'termine', 'termine_avec_erreurs', 'interrompue', 'annulee'\)\)/);
});

// ---------------------------------------------------------------- Bericht eines Bewohners (Etage)
const resident = workflow('67-brique-rapport-garde.json');
test('Bericht eines Bewohners: die Prüfung der Aufgabe geht jeder Suche und jeder Erzeugung voraus', () => {
  const versIa = chemins(resident, 'Eingang', (n) => [idDe('60-brique-chercher.json'), idDe('61-brique-template.json'), idDe('62-brique-rediger.json')].some((id) => appelle(id)(n)));
  assert.ok(versIa.length >= 1);
  for (const c of versIa) {
    const noms = c.map((x) => x.nom);
    assert.ok(noms.indexOf('Aufgabe noch gewünscht') >= 0 && noms.indexOf('Aufgabe noch gewünscht') < noms.indexOf('Suchen'));
    assert.equal(c.find((x) => x.nom === 'Aufgabe läuft?').sortie, 0, 'nur der Ausgang „en_cours“ führt zur KI');
  }
});
test('Bericht eines Bewohners: eine abgebrochene oder unterbrochene Aufgabe startet keine Erzeugung', () => {
  const ignore = voisins(resident, 'Aufgabe läuft?').find((v) => v.sortie === 1).vers;
  assert.equal(ignore, 'Bewohner übersprungen');
  assert.deepEqual(voisins(resident, 'Bewohner übersprungen'), []);
  const sortie = lancer(jsCode('67-brique-rapport-garde.json', 'Bewohner übersprungen'), { noeuds: { 'Eingang': [{ task_id: 'T', patient_id: 'PAT-001' }] } })[0];
  assert.deepEqual(sortie, { ignore: true, task_id: 'T', patient_id: 'PAT-001' });
});
test('Bericht eines Bewohners: Lebenszeichen bei jedem Bewohner, und ein nach dem Abbruch eingetroffenes Ergebnis wird verworfen', () => {
  assert.match(noeud(resident, 'Aufgabe noch gewünscht').parameters.options.queryReplacement ? noeud(resident, 'Aufgabe noch gewünscht').parameters.query : '', /SET heartbeat = now\(\)[\s\S]*statut = 'en_cours'/);
  const avance = noeud(resident, 'Aufgabe voranbringen').parameters.query;
  assert.match(avance, /heartbeat = now\(\)/);
  assert.match(avance, /statut = 'en_cours'/);
});
test('ganze Etage: die Aufgabe ist nur dann „beendet“, wenn sie noch lief (ein Abbruch wird nie überschrieben)', () => {
  for (const f of ['68-brique-etage-complet.json']) assert.match(noeud(workflow(f), 'Aufgabe beenden').parameters.query, /AND statut = 'en_cours'/);
});

// ---------------------------------------------------------------- Dokument prüfen
const verif = workflow('77-maitre-verifier.json');
test('zusätzliche Analyse: Prüfung der Aufgabe vor der Extraktion UND vor dem Vergleich; eine gestoppte Aufgabe führt zu nichts', () => {
  for (const [controle, porte, cible] of [
    ['Analyse noch gewünscht (Extraktion)', 'Analyse läuft? (Extraktion)', 'Zu extrahierendes Dokument'],
    ['Analyse noch gewünscht (Vergleich)', 'Analyse läuft? (Vergleich)', 'Fakten zum Vergleichen'],
  ]) {
    assert.match(noeud(verif, controle).parameters.query, /SET heartbeat = now\(\)[\s\S]*statut = 'en_cours'/);
    assert.deepEqual(voisins(verif, porte), [{ vers: cible, sortie: 0 }], `${porte}: nur der Ausgang „en_cours“ hat eine Fortsetzung`);
  }
  const versTemplates = chemins(verif, 'Webhook', (n) => appelle(idDe('61-brique-template.json'))(n));
  for (const c of versTemplates) {
    const noms = c.map((x) => x.nom);
    if (noms.includes('Vorlage (Extraktion)')) assert.ok(noms.includes('Analyse läuft? (Extraktion)') || !noms.includes('Sofort antworten'), 'Prüfung vor der Extraktion');
    if (noms.includes('Vorlage (Vergleich)')) assert.ok(noms.includes('Analyse läuft? (Vergleich)'), 'Prüfung vor dem Vergleich');
  }
});
test('zusätzliche Analyse: das Ergebnis wird nur geschrieben, wenn die Aufgabe noch läuft (ein Abbruch wird nicht überschrieben)', () => {
  assert.match(noeud(verif, "Analyse speichern").parameters.query, /AND statut = 'en_cours'/);
});

// ---------------------------------------------------------------- Abbrechen
const annuler = workflow('79-maitre-annuler.json');
test('Abbrechen: nur eine UUID wird akzeptiert', () => {
  const ctrl = jsCode('79-maitre-annuler.json', 'Aufgabe prüfen');
  assert.equal(lancer(ctrl, { entree: { body: { tache_id: 'a1c3e000-0001-4000-8000-000000000001' } } })[0].tache_id, 'a1c3e000-0001-4000-8000-000000000001');
  for (const faux of ["x'; DROP TABLE soins.taches;--", '', '1']) assert.throws(() => lancer(ctrl, { entree: { body: { tache_id: faux } } }), /Ungültige tache_id/);
});
test('Abbrechen: nur eine laufende Aufgabe („en_cours“) kann abgebrochen werden, der Abbruch wird protokolliert', () => {
  const q = noeud(annuler, 'Abbrechen').parameters.query;
  assert.match(q, /UPDATE soins\.taches SET statut = 'annulee'[\s\S]*AND statut = 'en_cours'/);
  assert.match(q, /'tache_annulee'/);
  assert.doesNotMatch(noeud(annuler, 'Webhook').parameters.options.allowedOrigins, /\*/, 'keine Öffnung für alle Ursprünge mehr');
});

// ---------------------------------------------------------------- Wiederaufnahme beim Start und Wächter
const reprise = workflow('80-reprise-taches.json');
test('Wiederaufnahme: beim Start von n8n wird jede laufende Aufgabe („en_cours“) zu „interrompue“ (n8n Trigger, Ereignis init)', () => {
  const t = noeud(reprise, 'n8n-Start');
  assert.equal(t.type, 'n8n-nodes-base.n8nTrigger');
  assert.deepEqual(t.parameters.events, ['init']);
  const q = noeud(reprise, 'Wiederaufnahme beim Start').parameters.query;
  assert.match(q, /SET statut = 'interrompue'[\s\S]*WHERE statut = 'en_cours' RETURNING/);
  assert.doesNotMatch(q, /heartbeat/, 'beim Start keine Fristbedingung: nichts kann mehr laufen');
  assert.match(q, /'redemarrage'/);
  assert.deepEqual(voisins(reprise, 'n8n-Start'), [{ vers: 'Wiederaufnahme beim Start', sortie: 0 }]);
});
test('Wächter: alle 5 Minuten wird eine Aufgabe ohne Lebenszeichen seit 30 Minuten zu „interrompue“', () => {
  assert.equal(noeud(reprise, 'Alle 5 Minuten').parameters.rule.interval[0].expression, '0 */5 * * * *');
  const q = noeud(reprise, 'Aufgaben ohne Lebenszeichen').parameters.query;
  assert.match(q, /statut = 'en_cours' AND heartbeat < now\(\) - interval '30 minutes'/);
  assert.match(q, /'sans_signe_de_vie'/);
});
test('der Importer veröffentlicht auch die beim Start von n8n ausgelösten Workflows', () => {
  assert.match(readFileSync(join(racine, 'workflows', 'importer.mjs'), 'utf8'), /'n8nTrigger'/);
});

console.log(`\n${nb} Tests bestanden.`);
