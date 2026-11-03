// Essai RÉEL des alarmes de capteurs : MQTT (Mosquitto) -> n8n -> PostgreSQL -> point d'entrée de l'interface.
// Mesure le délai entre la publication de l'alarme et le moment où l'interface la verrait (interrogation toutes les 2 s en vrai ;
// ici 200 ms pour mesurer finement, et on ajoute au pire cas les 2 s d'intervalle de l'interface).
// Lancer : node tests/alarme-live.mjs        (n8n, Mosquitto et PostgreSQL démarrés ; le contexte de l'IA demande quelques minutes)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const N8N = 'http://localhost:5679/webhook';
// compte MQTT « capteurs » (le broker refuse les connexions anonymes) : lu dans .env, jamais écrit dans le dépôt
const envFichier = readFileSync(join(racine, '.env'), 'utf8');
const lireEnv = (cle) => new RegExp('^' + cle + '=(.*)$', 'm').exec(envFichier)?.[1]?.trim();
const MQTT = { utilisateur: lireEnv('MQTT_UTILISATEUR_CAPTEURS'), motDePasse: lireEnv('MQTT_MOT_DE_PASSE_CAPTEURS') };
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
const publier = (sujet) => spawnSync('docker', ['compose', 'exec', '-T', 'mosquitto', 'mosquitto_pub', '-h', 'localhost', '-u', MQTT.utilisateur, '-P', MQTT.motDePasse, '-t', sujet, '-m', '{"capteur":"essai"}'], { cwd: join(racine, 'compose'), encoding: 'utf8' });
const lire = async () => (await (await appelN8n(`${N8N}/aicare-alarmes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).alarmes;
const acquitter = async (id) => appelN8n(`${N8N}/aicare-alarmes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acquitter: id }) });

// attendre qu'aucune génération de contexte précédente ne soit en cours (sinon elle fausserait la mesure « à vide »)
for (let i = 0; i < 120 && sql("select count(*) from soins.alarmes where contexte->>'statut' = 'en_cours';") !== '0'; i++) await pause(5000);
await pause(10000);
sql('delete from soins.alarmes;');
// mesure à vide : le temps de l'appel docker lui-même, à retrancher pour connaître le délai MQTT -> affichage
let t0 = Date.now();
publier('capteurs/chambre0/rien');
const surcout = Date.now() - t0;
console.log(`(surcoût de la commande docker exec mosquitto_pub : ${surcout} ms)`);
await pause(3000);

const mesures = [];
async function alarme(chambre, type) {
  const sujet = `capteurs/chambre${chambre}/${type}`;
  const avant = (await lire()).map((a) => a.id);
  t0 = Date.now();
  publier(sujet);
  const envoye = Date.now();
  for (let i = 0; i < 100; i++) {
    const a = (await lire()).find((x) => !avant.includes(x.id) && x.chambre === String(chambre) && x.type === type);
    if (a) {
      const total = Date.now() - t0;
      const mqtt = Math.max(0, total - surcout);
      mesures.push({ chambre, type, total_ms: total, apres_publication_ms: Date.now() - envoye, estime_sans_docker_ms: mqtt });
      console.log(`  alarme ${sujet} visible après ${total} ms (dont ~${surcout} ms de commande docker)`);
      return a;
    }
    await pause(200);
  }
  return null;
}

const priorite = process.argv.includes('--priorite'); // Ollama en priorité inférieure pendant la génération
const sansContexte = process.argv.includes('--sans-contexte');

// 1. À VIDE : une alarme quand rien d'autre ne tourne
const weber = await alarme(12, 'sortie_lit');
const delaiAVide = mesures[0].total_ms;
verifier(weber && weber.faits.resident === 'M. Hans Weber', 'Weber (chambre 12) : alarme affichée avec le nom du résident');
verifier(weber?.faits.allergies.some((x) => /pénicilline/i.test(x)) && weber.faits.risques.length > 0, 'Weber : risques et allergie du dossier (faits codés) présents tout de suite');
verifier(weber?.faits.medication_a_risque.some((x) => x.famille === 'tension'), 'Weber : médication à risque de chute repérée (tension)');
if (priorite) spawnSync('powershell', ['-NoProfile', '-File', join(racine, 'scripts', 'priorite-ollama.ps1')], { encoding: 'utf8' });
await pause(8000); // la génération du contexte de Weber démarre : le poste est maintenant chargé

// 2. SOUS CHARGE : pendant que Llama génère le contexte de Weber
const becker = await alarme(14, 'chute');
verifier(becker?.faits.medication_a_risque.some((x) => x.famille === 'insuline'), 'Becker (chambre 14) : insuline repérée comme médication à risque');
const schulz = await alarme(10, 'appel');
verifier(schulz?.faits.medication_a_risque.some((x) => x.famille === 'anticoagulant'), 'Schulz (chambre 10) : anticoagulant repéré (risque de saignement)');
const inconnue = await alarme(99, 'chute');
verifier(inconnue && inconnue.faits.resident === null && inconnue.contexte.statut === 'aucun', 'chambre 99 sans résident : alarme affichée quand même, sans contexte IA');
await alarme(20, 'chute');
await alarme(21, 'sortie_lit');

// 3. sujets invalides et répétition immédiate (le capteur répète son message)
const nb = Number(sql('select count(*) from soins.alarmes;'));
publier('capteurs/chambre12/incendie');
publier('capteurs/chambre22/appel');
publier('capteurs/chambre22/appel'); // répétition immédiate : une seule alarme
let attendu = nb + 1;
for (let i = 0; i < 40 && Number(sql('select count(*) from soins.alarmes;')) < attendu; i++) await pause(1000);
await pause(5000);
verifier(Number(sql('select count(*) from soins.alarmes;')) === attendu, 'sujet inconnu : aucune alarme ; message répété : une seule alarme en plus');
for (let i = 0; i < 30 && Number(sql("select count(*) from soins.journal_ia where evenement = 'alarme_rejetee' and details->>'topic' = 'capteurs/chambre12/incendie';")) < 1; i++) await pause(2000);
verifier(Number(sql("select count(*) from soins.journal_ia where evenement = 'alarme_rejetee' and details->>'topic' = 'capteurs/chambre12/incendie';")) >= 1, 'sujet inconnu : tracé au journal d\'audit');

// 4. délais
const charge = mesures.slice(1);
const totaux = charge.map((m) => m.total_ms).sort((a, b) => a - b);
const pire = totaux.at(-1);
console.log(`\nÀ vide : ${delaiAVide} ms (dont ~${surcout} ms de commande docker, absents en vrai)`);
console.log(`Sous charge (${charge.length} alarmes pendant la génération du contexte) : min ${totaux[0]} ms, médiane ${totaux[Math.floor(totaux.length / 2)]} ms, max ${pire} ms`);
const pireReel = pire - surcout + 2000;
console.log(`Pire cas dans l'interface : ${pire} - ${surcout} (docker) + 2000 (interrogation toutes les 2 s) = ${pireReel} ms`);
verifier(pireReel < 5000, 'alarme affichée en moins de 5 secondes dans l\'interface, même pendant la génération (pire cas)');
mkdirSync(join(racine, 'tests', 'resultats'), { recursive: true });
appendFileSync(join(racine, 'tests', 'resultats', 'alarmes.jsonl'), JSON.stringify({ date: new Date().toISOString(), priorite_ollama_basse: priorite, surcout_docker_ms: surcout, a_vide_ms: delaiAVide, mesures }) + '\n');
// 4. contexte de l'assistant IA (le premier seulement : une génération à la fois)
verifier(['en_cours', 'pret', 'indisponible'].includes(weber.contexte.statut), `Weber : contexte IA « ${weber.contexte.statut} » à l'affichage`);
const autres = (await lire()).filter((a) => a.id !== weber.id && a.contexte.statut === 'differe').length;
verifier(autres >= 1, `les alarmes suivantes n'ouvrent pas d'autre génération (${autres} « différé »)`);
if (sansContexte) { sql('update soins.alarmes set statut = \'acquittee\';'); console.log(echecs ? `\n${echecs} échec(s).` : '\nTout est réussi (contexte non attendu).'); process.exit(echecs ? 1 : 0); }
console.log('attente du contexte de l\'assistant IA pour Weber…');
let ctx = weber.contexte;
t0 = Date.now();
for (let i = 0; i < 80 && ctx.statut === 'en_cours'; i++) {
  await pause(10000);
  ctx = (await lire()).find((a) => a.id === weber.id)?.contexte ?? ctx;
}
verifier(ctx.statut === 'pret', `contexte de l'assistant IA prêt après ${Math.round((Date.now() - t0) / 1000)} s (statut « ${ctx.statut} »)`);
if (ctx.statut === 'pret') {
  console.log(ctx.texte);
  console.log(`phrases retirées : ${ctx.retirees.length}`);
  verifier(/\[Capteurs\]/.test(ctx.texte) && !/information non disponible\.\s*\n\s*Contexte/.test(ctx.texte.split('\n').slice(0, 2).join('\n') + '\n'), 'le contexte cite la source [Capteurs] pour l\'alarme');
}

// 5. acquittement
await acquitter(weber.id);
verifier(!(await lire()).some((a) => a.id === weber.id), 'acquitter : l\'alarme disparaît de la liste');
console.log(echecs ? `\n${echecs} échec(s).` : '\nTout est réussi.');
process.exit(echecs ? 1 : 0);
