// Génère les secrets de l'étape « sécurité » dans le fichier .env (jamais dans Git) et le fichier des mots de passe de Mosquitto.
//   AICARE_CLE_WEBHOOK / VITE_N8N_CLE     clé secrète envoyée par l'interface à chaque webhook n8n (même valeur des deux côtés)
//   MQTT_*_N8N / MQTT_*_CAPTEURS           comptes du broker MQTT : n8n lit, les capteurs publient
// Rejouable : une valeur déjà présente (et différente de TA-CLE) n'est jamais écrasée. Les valeurs ne sont pas affichées.
// Usage : node scripts/generer-secrets.mjs [--mqtt]    (--mqtt : recrée aussi le fichier des mots de passe de Mosquitto)
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichierEnv = join(racine, '.env');
if (!existsSync(fichierEnv)) {
  console.error("Fichier .env introuvable : copier .env.exemple en .env, puis relancer.");
  process.exit(1);
}
let env = readFileSync(fichierEnv, 'utf8');
const lire = (cle) => new RegExp(`^${cle}=(.*)$`, 'm').exec(env)?.[1]?.trim();
const secret = () => randomBytes(24).toString('base64url');
const defaut = { MQTT_UTILISATEUR_N8N: 'n8n', MQTT_UTILISATEUR_CAPTEURS: 'capteurs' };

function assurer(cle, valeur) {
  const actuelle = lire(cle);
  if (actuelle && actuelle !== 'TA-CLE') return false;
  const ligne = `${cle}=${valeur}`;
  env = actuelle === undefined ? `${env.replace(/\s*$/, '')}\n${ligne}\n` : env.replace(new RegExp(`^${cle}=.*$`, 'm'), ligne);
  return true;
}
const cree = [];
// base PostgreSQL (partagée avec n8n) et clé de chiffrement des credentials de n8n : sur un poste neuf elles valent TA-CLE.
// Une valeur déjà présente n'est jamais touchée (changer le mot de passe ou la clé d'une pile existante la casserait).
if (assurer('POSTGRES_USER', 'aicare')) cree.push('POSTGRES_USER');
if (assurer('POSTGRES_DB', 'aicare')) cree.push('POSTGRES_DB');
if (assurer('POSTGRES_PASSWORD', secret())) cree.push('POSTGRES_PASSWORD');
for (const [n8n, pg] of [['DB_POSTGRESDB_USER', 'POSTGRES_USER'], ['DB_POSTGRESDB_PASSWORD', 'POSTGRES_PASSWORD'], ['DB_POSTGRESDB_DATABASE', 'POSTGRES_DB']]) {
  if (assurer(n8n, lire(pg))) cree.push(n8n);
}
if (assurer('N8N_ENCRYPTION_KEY', randomBytes(24).toString('hex'))) cree.push('N8N_ENCRYPTION_KEY');
const cle = lire('AICARE_CLE_WEBHOOK');
const nouvelleCle = cle && cle !== 'TA-CLE' ? cle : secret();
if (assurer('AICARE_CLE_WEBHOOK', nouvelleCle)) cree.push('AICARE_CLE_WEBHOOK');
// l'interface envoie la même clé : visible dans le code de l'interface dans le navigateur (voir DECISIONS.md : ce n'est PAS la protection principale)
if (assurer('VITE_N8N_CLE', lire('AICARE_CLE_WEBHOOK'))) cree.push('VITE_N8N_CLE');
for (const [c, v] of Object.entries(defaut)) if (assurer(c, v)) cree.push(c);
for (const c of ['MQTT_MOT_DE_PASSE_N8N', 'MQTT_MOT_DE_PASSE_CAPTEURS']) if (assurer(c, secret())) cree.push(c);
// clé INTERNE : utilisée seulement par n8n pour s'appeler lui-même ; elle n'est jamais envoyée à l'interface
if (assurer('AICARE_CLE_INTERNE', secret())) cree.push('AICARE_CLE_INTERNE');
// codes PIN des comptes de démonstration (fictifs) : 6 chiffres tirés au hasard, lus ensuite par scripts/creer-soignants.mjs
for (const c of ['DEMO_PIN_MARTIN', 'DEMO_PIN_KELLER', 'DEMO_PIN_ROTH', 'DEMO_PIN_ARSENE']) if (assurer(c, String(randomInt(100000, 1000000)))) cree.push(c);
writeFileSync(fichierEnv, env, 'utf8');
console.log(cree.length ? `.env : ${cree.length} valeur(s) créée(s) (${cree.join(', ')}).` : '.env : tous les secrets existent déjà.');

// fichier des mots de passe de Mosquitto (haché par mosquitto_passwd, dans le conteneur ; ignoré par Git)
const passwd = join(racine, 'compose', 'mosquitto', 'passwd');
if (process.argv.includes('--mqtt') || !existsSync(passwd) || cree.some((c) => c.startsWith('MQTT_'))) {
  const comptes = [
    [lire('MQTT_UTILISATEUR_N8N'), lire('MQTT_MOT_DE_PASSE_N8N')],
    [lire('MQTT_UTILISATEUR_CAPTEURS'), lire('MQTT_MOT_DE_PASSE_CAPTEURS')],
  ];
  const commande = comptes.map(([u, p], i) => `mosquitto_passwd -${i === 0 ? 'c -' : ''}b /cfg/passwd '${u}' '${p}'`).join(' && ') + ' && chmod 644 /cfg/passwd';
  const r = spawnSync('docker', ['run', '--rm', '-v', `${join(racine, 'compose', 'mosquitto')}:/cfg`, '--entrypoint', 'sh', 'eclipse-mosquitto:2', '-c', commande], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`mosquitto_passwd a échoué : ${r.stderr.replace(/'[^']*'/g, "'***'")}`);
    process.exit(1);
  }
  console.log('compose/mosquitto/passwd : créé (2 comptes : n8n lit, capteurs publient).');
}