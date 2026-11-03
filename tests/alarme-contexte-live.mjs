// Messung der Zeit zwischen einem MQTT-Alarm und dem angezeigten Kontexttext des KI-Assistenten (ein einziger Alarm, Rechner im Leerlauf).
// Start: node tests/alarme-contexte-live.mjs [Zimmer] [Typ] [Bezeichnung]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
// MQTT-Konto « capteurs » (der Broker lehnt anonyme Verbindungen ab): aus .env gelesen, nie im Repository gespeichert
const envFichier = readFileSync(join(racine, '.env'), 'utf8');
const lireEnv = (cle) => new RegExp('^' + cle + '=(.*)$', 'm').exec(envFichier)?.[1]?.trim();
const MQTT = { utilisateur: lireEnv('MQTT_UTILISATEUR_CAPTEURS'), motDePasse: lireEnv('MQTT_MOT_DE_PASSE_CAPTEURS') };
const chambre = process.argv[2] ?? '12';
const type = process.argv[3] ?? 'sortie_lit';
const etiquette = process.argv[4] ?? 'test';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (requete) => spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -t -A -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: join(racine, 'compose'), input: requete, encoding: 'utf8' }).stdout.trim();
const lire = async () => (await (await appelN8n('http://localhost:5679/webhook/aicare-alarmes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).alarmes;

for (let i = 0; i < 120 && sql("select count(*) from soins.alarmes where contexte->>'statut' = 'en_cours';") !== '0'; i++) await pause(5000);
await pause(5000);
sql('delete from soins.alarmes;');
const t0 = Date.now();
spawnSync('docker', ['compose', 'exec', '-T', 'mosquitto', 'mosquitto_pub', '-h', 'localhost', '-u', MQTT.utilisateur, '-P', MQTT.motDePasse, '-t', `capteurs/chambre${chambre}/${type}`, '-m', '{"capteur":"essai"}'], { cwd: join(racine, 'compose'), encoding: 'utf8' });
let vue = null;
let pret = null;
for (let i = 0; i < 200 && !pret; i++) {
  const a = (await lire()).find((x) => x.chambre === String(chambre));
  if (a && !vue) vue = Date.now() - t0;
  if (a && ['pret', 'indisponible'].includes(a.contexte.statut)) pret = { ms: Date.now() - t0, contexte: a.contexte };
  else await pause(1000);
}
if (!pret) {
  console.log('Kontext nicht rechtzeitig bereit');
  process.exit(1);
}
const [duree, tokens, faits] = sql("select duree_ms, details->>'tokens', details->>'nb_faits' from soins.journal_ia where evenement = 'generation' and action = 'contexte_alarme' order by id desc limit 1;").split('|');
const ligne = { etiquette, alarme_visible_ms: vue, contexte_pret_ms: pret.ms, statut: pret.contexte.statut, modele_s: Math.round(duree / 1000), jetons: Number(tokens), faits: Number(faits), retirees: pret.contexte.retirees?.length ?? 0 };
console.log(JSON.stringify(ligne));
console.log(pret.contexte.texte ?? '');
mkdirSync(join(racine, 'tests', 'resultats'), { recursive: true });
appendFileSync(join(racine, 'tests', 'resultats', 'alarmes-contexte.jsonl'), JSON.stringify({ date: new Date().toISOString(), ...ligne }) + '\n');
sql("update soins.alarmes set statut = 'acquittee', acquittee_le = now() where statut = 'nouvelle';");
