// Erzeugt die Geheimnisse des Schritts „Sicherheit“ in der Datei .env (niemals in Git) und die Passwortdatei von Mosquitto.
//   AICARE_CLE_WEBHOOK / VITE_N8N_CLE     geheimer Schlüssel, den die Oberfläche bei jedem n8n-Webhook mitsendet (auf beiden Seiten derselbe Wert)
//   MQTT_*_N8N / MQTT_*_CAPTEURS           Konten des MQTT-Brokers: n8n liest, die Sensoren veröffentlichen
// Wiederholbar: Ein bereits vorhandener Wert (der nicht TA-CLE ist) wird nie überschrieben. Die Werte werden nicht angezeigt.
// Aufruf: node scripts/generer-secrets.mjs [--mqtt]    (--mqtt: erstellt auch die Passwortdatei von Mosquitto neu)
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichierEnv = join(racine, '.env');
if (!existsSync(fichierEnv)) {
  console.error("Datei .env nicht gefunden: .env.exemple nach .env kopieren und erneut starten.");
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
// PostgreSQL-Datenbank (mit n8n geteilt) und Verschlüsselungsschlüssel der n8n-Zugangsdaten: Auf einem neuen Rechner lauten sie TA-CLE.
// Ein bereits vorhandener Wert wird nie angetastet (das Ändern des Passworts oder Schlüssels eines bestehenden Stacks würde ihn beschädigen).
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
// die Oberfläche sendet denselben Schlüssel: im Code der Oberfläche im Browser sichtbar (siehe DECISIONS.md: das ist NICHT der Hauptschutz)
if (assurer('VITE_N8N_CLE', lire('AICARE_CLE_WEBHOOK'))) cree.push('VITE_N8N_CLE');
for (const [c, v] of Object.entries(defaut)) if (assurer(c, v)) cree.push(c);
for (const c of ['MQTT_MOT_DE_PASSE_N8N', 'MQTT_MOT_DE_PASSE_CAPTEURS']) if (assurer(c, secret())) cree.push(c);
// INTERNER Schlüssel: wird nur von n8n verwendet, um sich selbst aufzurufen; er wird nie an die Oberfläche gesendet
if (assurer('AICARE_CLE_INTERNE', secret())) cree.push('AICARE_CLE_INTERNE');
// PIN-Codes der Demokonten (fiktiv): 6 zufällig gezogene Ziffern, anschließend von scripts/creer-soignants.mjs gelesen
for (const c of ['DEMO_PIN_MARTIN', 'DEMO_PIN_KELLER', 'DEMO_PIN_ROTH', 'DEMO_PIN_ARSENE']) if (assurer(c, String(randomInt(100000, 1000000)))) cree.push(c);
writeFileSync(fichierEnv, env, 'utf8');
console.log(cree.length ? `.env: ${cree.length} Wert(e) erstellt (${cree.join(', ')}).` : '.env: Alle Geheimnisse sind bereits vorhanden.');

// Passwortdatei von Mosquitto (von mosquitto_passwd im Container gehasht; von Git ignoriert)
const passwd = join(racine, 'compose', 'mosquitto', 'passwd');
if (process.argv.includes('--mqtt') || !existsSync(passwd) || cree.some((c) => c.startsWith('MQTT_'))) {
  const comptes = [
    [lire('MQTT_UTILISATEUR_N8N'), lire('MQTT_MOT_DE_PASSE_N8N')],
    [lire('MQTT_UTILISATEUR_CAPTEURS'), lire('MQTT_MOT_DE_PASSE_CAPTEURS')],
  ];
  const commande = comptes.map(([u, p], i) => `mosquitto_passwd -${i === 0 ? 'c -' : ''}b /cfg/passwd '${u}' '${p}'`).join(' && ') + ' && chmod 644 /cfg/passwd';
  const r = spawnSync('docker', ['run', '--rm', '-v', `${join(racine, 'compose', 'mosquitto')}:/cfg`, '--entrypoint', 'sh', 'eclipse-mosquitto:2', '-c', commande], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`mosquitto_passwd ist fehlgeschlagen: ${r.stderr.replace(/'[^']*'/g, "'***'")}`);
    process.exit(1);
  }
  console.log('compose/mosquitto/passwd: erstellt (2 Konten: n8n liest, Sensoren veröffentlichen).');
}