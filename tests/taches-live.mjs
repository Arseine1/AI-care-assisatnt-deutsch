// Essai RÉEL des tâches de fond fiables (n8n, PostgreSQL et modèle de langue démarrés) :
//   1. le veilleur (requête réelle du workflow 80) interrompt une tâche sans battement de coeur, pas une tâche vivante ;
//   2. l'annulation (webhook réel) : une seule fois, tâche inconnue signalée, événement au journal ;
//   3. le redémarrage de n8n interrompt toute tâche « en cours » ;
//   4. l'annulation d'un vrai rapport d'étage en cours : les résidents suivants ne sont pas traités.
// Lancer : node tests/taches-live.mjs        (environ 10 minutes : il redémarre n8n et lance une vraie génération)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const N8N = 'http://localhost:5679';
let echecs = 0;
const verifier = (condition, message) => {
  console.log(`${condition ? 'OK  ' : 'ÉCHEC'} ${message}`);
  if (!condition) echecs++;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (requete) => {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: join(racine, 'compose'), input: requete, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
// n8n peut perdre un instant sa propre base (poste de 8 Go presque saturé) : on réessaie quelques fois avant de conclure.
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

const seulementEtage = process.argv.includes('--etage'); // rejouer seulement la partie 4
if (!seulementEtage) {
// ---- 1. veilleur ----
const perdue = nouvelle("now() - interval '40 minutes'");
const vivante = nouvelle('now()');
sql(requeteDe('80-reprise-taches.json', 'Tâches sans signe de vie'));
verifier(statut(perdue) === 'interrompue', 'veilleur : la tâche sans battement depuis 40 minutes est « interrompue »');
verifier(statut(vivante) === 'en_cours', 'veilleur : la tâche vivante n\'est pas touchée');

// ---- 2. annulation ----
const a = nouvelle('now()');
const r1 = await post('aicare-annuler', { tache_id: a });
verifier(r1.annulee === true && r1.statut === 'annulee' && statut(a) === 'annulee', 'annulation : une tâche en cours passe à « annulee »');
const r2 = await post('aicare-annuler', { tache_id: a });
verifier(r2.annulee === false && r2.statut === 'annulee', 'annulation : une seconde demande ne fait rien');
const r3 = await post('aicare-annuler', { tache_id: perdue });
verifier(r3.annulee === false && r3.statut === 'interrompue', 'annulation : une tâche déjà interrompue n\'est pas modifiée');
const r4 = await post('aicare-annuler', { tache_id: 'a1c3e000-0001-4000-8000-0000000000ff' });
verifier(r4.annulee === false && r4.statut === 'inconnue', 'annulation : une tâche inconnue est signalée');
verifier(sql(`select count(*) from soins.journal_ia where evenement = 'tache_annulee' and details->>'tache_id' = '${a}';`) === '1', 'annulation : événement « tache_annulee » au journal d\'audit');

// ---- 3. redémarrage de n8n ----
const enCours = nouvelle('now()');
console.log('redémarrage de n8n…');
spawnSync('docker', ['compose', 'restart', 'n8n'], { cwd: join(racine, 'compose'), encoding: 'utf8' });
for (let i = 0; i < 60; i++) {
  await pause(5000);
  try { if ((await fetch(`${N8N}/healthz`)).ok) break; } catch { /* pas encore prêt */ }
}
let interrompue = false;
for (let i = 0; i < 24 && !interrompue; i++) {
  interrompue = statut(enCours) === 'interrompue';
  if (!interrompue) await pause(5000);
}
verifier(interrompue, 'redémarrage : la tâche « en cours » est passée à « interrompue » au démarrage de n8n');
verifier(Number(sql(`select count(*) from soins.journal_ia where evenement = 'tache_interrompue' and details->>'tache_id' = '${enCours}' and details->>'cause' = 'redemarrage';`)) === 1, 'redémarrage : événement « tache_interrompue » (cause redemarrage) au journal');
sql("delete from soins.taches where type = 'essai';");

}
// ---- 4. annulation d'un vrai rapport d'étage ----
await pause(20000);
const { tache_id, total } = await post('aicare-etage', { etage: 2 });
console.log(`rapport d'étage lancé (${total} résidents) ; je l'annule dès que le premier est prêt…`);
let fait = 0;
for (let i = 0; i < 90 && fait < 1; i++) {
  await pause(10000);
  fait = (await post('aicare-tache', { tache_id })).fait ?? 0;
}
const t0 = Date.now();
const annulation = await post('aicare-annuler', { tache_id });
verifier(annulation.annulee === true, `annulation réelle : demandée après ${fait} résident(s) prêt(s)`);
// la génération en cours se termine, puis plus rien ne doit être lancé
const generations = () => Number(sql("select count(*) from soins.journal_ia where evenement = 'generation';"));
await pause(240000);
const avant = generations();
await pause(120000);
const finale = await post('aicare-tache', { tache_id });
verifier(finale.statut === 'annulee', `annulation réelle : statut final « ${finale.statut} »`);
verifier(finale.fait < total, `annulation réelle : ${finale.fait} résident(s) sur ${total} traités, les suivants ignorés`);
verifier(generations() === avant, 'annulation réelle : plus aucune génération lancée après l\'annulation');
console.log(`(annulée ${Math.round((Date.now() - t0) / 1000)} s avant la fin de l'observation)`);

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout est réussi.');
process.exit(echecs ? 1 : 0);
