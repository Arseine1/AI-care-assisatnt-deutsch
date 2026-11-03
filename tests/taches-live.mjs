// ECHTER Test der zuverlässigen Hintergrundaufgaben (n8n, PostgreSQL und Sprachmodell gestartet):
//   1. der Wächter (echte Abfrage des Workflows 80) unterbricht eine Aufgabe ohne Lebenszeichen, nicht eine lebende Aufgabe;
//   2. der Abbruch (echter Webhook): nur einmal, unbekannte Aufgabe wird gemeldet, Ereignis im Protokoll;
//   3. der Neustart von n8n unterbricht jede laufende Aufgabe („en_cours“);
//   4. der Abbruch eines echten laufenden Etagenberichts: die folgenden Bewohner werden nicht bearbeitet.
// Start: node tests/taches-live.mjs        (etwa 10 Minuten: er startet n8n neu und löst eine echte Erzeugung aus)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const N8N = 'http://localhost:5679';
let echecs = 0;
const verifier = (condition, message) => {
  console.log(`${condition ? 'OK  ' : 'FEHLER'} ${message}`);
  if (!condition) echecs++;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (requete) => {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: join(racine, 'compose'), input: requete, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
// n8n kann kurzzeitig seine eigene Datenbank verlieren (Rechner mit 8 GB fast ausgelastet): Wir versuchen es einige Male erneut, bevor wir ein Ergebnis ziehen.
const post = async (chemin, corps) => {
  for (let essai = 1; ; essai++) {
    try {
      const rep = await appelN8n(`${N8N}/webhook/${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const json = await rep.json();
      if (rep.ok || essai >= 8) return json;
    } catch (e) {
      if (essai >= 8) throw e;
    }
    await pause(15000);
  }
};
const requeteDe = (fichier, noeud) => JSON.parse(readFileSync(join(racine, 'workflows', fichier), 'utf8')).nodes.find((n) => n.name === noeud).parameters.query;
const statut = (id) => sql(`select statut from soins.taches where id = '${id}';`);
const nouvelle = (heartbeat) => sql(`insert into soins.taches (type, parametres, total, heartbeat) values ('essai', '{}', 3, ${heartbeat}) returning id;`).split('\n')[0];

sql("delete from soins.taches where type = 'essai';");

const seulementEtage = process.argv.includes('--etage'); // nur Teil 4 wiederholen
if (!seulementEtage) {
// ---- 1. Wächter ----
const perdue = nouvelle("now() - interval '40 minutes'");
const vivante = nouvelle('now()');
sql(requeteDe('80-reprise-taches.json', 'Aufgaben ohne Lebenszeichen'));
verifier(statut(perdue) === 'interrompue', 'Wächter: die Aufgabe ohne Lebenszeichen seit 40 Minuten ist „interrompue“');
verifier(statut(vivante) === 'en_cours', 'Wächter: die lebende Aufgabe bleibt unberührt');

// ---- 2. Abbruch ----
const a = nouvelle('now()');
const r1 = await post('aicare-annuler', { tache_id: a });
verifier(r1.annulee === true && r1.statut === 'annulee' && statut(a) === 'annulee', 'Abbruch: eine laufende Aufgabe wechselt zu „annulee“');
const r2 = await post('aicare-annuler', { tache_id: a });
verifier(r2.annulee === false && r2.statut === 'annulee', 'Abbruch: eine zweite Anfrage bewirkt nichts');
const r3 = await post('aicare-annuler', { tache_id: perdue });
verifier(r3.annulee === false && r3.statut === 'interrompue', 'Abbruch: eine bereits unterbrochene Aufgabe wird nicht verändert');
const r4 = await post('aicare-annuler', { tache_id: 'a1c3e000-0001-4000-8000-0000000000ff' });
verifier(r4.annulee === false && r4.statut === 'inconnue', 'Abbruch: eine unbekannte Aufgabe wird gemeldet');
verifier(sql(`select count(*) from soins.journal_ia where evenement = 'tache_annulee' and details->>'tache_id' = '${a}';`) === '1', 'Abbruch: Ereignis „tache_annulee“ im Prüfprotokoll');

// ---- 3. Neustart von n8n ----
const enCours = nouvelle('now()');
console.log('Neustart von n8n …');
spawnSync('docker', ['compose', 'restart', 'n8n'], { cwd: join(racine, 'compose'), encoding: 'utf8' });
for (let i = 0; i < 60; i++) {
  await pause(5000);
  try { if ((await fetch(`${N8N}/healthz`)).ok) break; } catch { /* noch nicht bereit */ }
}
let interrompue = false;
for (let i = 0; i < 24 && !interrompue; i++) {
  interrompue = statut(enCours) === 'interrompue';
  if (!interrompue) await pause(5000);
}
verifier(interrompue, 'Neustart: die laufende Aufgabe („en_cours“) wurde beim Start von n8n zu „interrompue“');
verifier(Number(sql(`select count(*) from soins.journal_ia where evenement = 'tache_interrompue' and details->>'tache_id' = '${enCours}' and details->>'cause' = 'redemarrage';`)) === 1, 'Neustart: Ereignis „tache_interrompue“ (Ursache redemarrage) im Protokoll');
sql("delete from soins.taches where type = 'essai';");

}
// ---- 4. Abbruch eines echten Etagenberichts ----
await pause(20000);
const { tache_id, total } = await post('aicare-etage', { etage: 2 });
console.log(`Etagenbericht gestartet (${total} Bewohner); ich breche ihn ab, sobald der erste fertig ist …`);
let fait = 0;
for (let i = 0; i < 90 && fait < 1; i++) {
  await pause(10000);
  fait = (await post('aicare-tache', { tache_id })).fait ?? 0;
}
const t0 = Date.now();
const annulation = await post('aicare-annuler', { tache_id });
verifier(annulation.annulee === true, `echter Abbruch: nach ${fait} fertigen Bewohner(n) angefordert`);
// die laufende Erzeugung wird beendet, danach darf nichts mehr gestartet werden
const generations = () => Number(sql("select count(*) from soins.journal_ia where evenement = 'generation';"));
await pause(240000);
const avant = generations();
await pause(120000);
const finale = await post('aicare-tache', { tache_id });
verifier(finale.statut === 'annulee', `echter Abbruch: Endstatus „${finale.statut}“`);
verifier(finale.fait < total, `echter Abbruch: ${finale.fait} von ${total} Bewohnern bearbeitet, die folgenden übersprungen`);
verifier(generations() === avant, 'echter Abbruch: nach dem Abbruch wird keine Erzeugung mehr gestartet');
console.log(`(abgebrochen ${Math.round((Date.now() - t0) / 1000)} s vor Ende der Beobachtung)`);

console.log(echecs ? `\n${echecs} Fehler.` : '\nAlles erfolgreich.');
process.exit(echecs ? 1 : 0);
