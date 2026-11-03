// ECHTER Test der Sensoralarme: MQTT (Mosquitto) -> n8n -> PostgreSQL -> Endpunkt der Oberfläche.
// Misst die Verzögerung zwischen der Veröffentlichung des Alarms und dem Moment, in dem die Oberfläche ihn sehen würde (Abfrage alle 2 s in Wirklichkeit;
// hier 200 ms für eine feine Messung, und im schlimmsten Fall kommen die 2 s Intervall der Oberfläche hinzu).
// Start: node tests/alarme-live.mjs        (n8n, Mosquitto und PostgreSQL gestartet; der KI-Kontext braucht einige Minuten)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const N8N = 'http://localhost:5679/webhook';
// MQTT-Konto « capteurs » (der Broker lehnt anonyme Verbindungen ab): aus .env gelesen, nie im Repository gespeichert
const envFichier = readFileSync(join(racine, '.env'), 'utf8');
const lireEnv = (cle) => new RegExp('^' + cle + '=(.*)$', 'm').exec(envFichier)?.[1]?.trim();
const MQTT = { utilisateur: lireEnv('MQTT_UTILISATEUR_CAPTEURS'), motDePasse: lireEnv('MQTT_MOT_DE_PASSE_CAPTEURS') };
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
const publier = (sujet) => spawnSync('docker', ['compose', 'exec', '-T', 'mosquitto', 'mosquitto_pub', '-h', 'localhost', '-u', MQTT.utilisateur, '-P', MQTT.motDePasse, '-t', sujet, '-m', '{"capteur":"essai"}'], { cwd: join(racine, 'compose'), encoding: 'utf8' });
const lire = async () => (await (await appelN8n(`${N8N}/aicare-alarmes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).alarmes;
const acquitter = async (id) => appelN8n(`${N8N}/aicare-alarmes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acquitter: id }) });

// warten, bis keine frühere Kontexterzeugung mehr läuft (sonst würde sie die Messung « im Leerlauf » verfälschen)
for (let i = 0; i < 120 && sql("select count(*) from soins.alarmes where contexte->>'statut' = 'en_cours';") !== '0'; i++) await pause(5000);
await pause(10000);
sql('delete from soins.alarmes;');
// Messung im Leerlauf: die Zeit des docker-Aufrufs selbst, abzuziehen, um die Verzögerung MQTT -> Anzeige zu erhalten
let t0 = Date.now();
publier('capteurs/chambre0/rien');
const surcout = Date.now() - t0;
console.log(`(Mehrkosten des Befehls docker exec mosquitto_pub: ${surcout} ms)`);
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
      console.log(`  Alarm ${sujet} sichtbar nach ${total} ms (davon ~${surcout} ms für den docker-Befehl)`);
      return a;
    }
    await pause(200);
  }
  return null;
}

const priorite = process.argv.includes('--priorite'); // Ollama mit niedrigerer Priorität während der Erzeugung
const sansContexte = process.argv.includes('--sans-contexte');

// 1. IM LEERLAUF: ein Alarm, während sonst nichts läuft
const weber = await alarme(12, 'sortie_lit');
const delaiAVide = mesures[0].total_ms;
verifier(weber && weber.faits.resident === 'Herr Hans Weber', 'Weber (Zimmer 12): Alarm mit dem Namen des Bewohners angezeigt');
verifier(weber?.faits.allergies.some((x) => /penicillin/i.test(x)) && weber.faits.risques.length > 0, 'Weber: Risiken und Allergie aus der Akte (codierte Fakten) sofort vorhanden');
verifier(weber?.faits.medication_a_risque.some((x) => x.famille === 'tension'), 'Weber: Risikomedikation für Sturz erkannt (Blutdruck)');
if (priorite) spawnSync('powershell', ['-NoProfile', '-File', join(racine, 'scripts', 'priorite-ollama.ps1')], { encoding: 'utf8' });
await pause(8000); // die Kontexterzeugung für Weber startet: der Rechner ist jetzt ausgelastet

// 2. UNTER LAST: während Llama den Kontext von Weber erzeugt
const becker = await alarme(14, 'chute');
verifier(becker?.faits.medication_a_risque.some((x) => x.famille === 'insuline'), 'Becker (Zimmer 14): Insulin als Risikomedikation erkannt');
const schulz = await alarme(10, 'appel');
verifier(schulz?.faits.medication_a_risque.some((x) => x.famille === 'anticoagulant'), 'Schulz (Zimmer 10): Gerinnungshemmer erkannt (Blutungsrisiko)');
const inconnue = await alarme(99, 'chute');
verifier(inconnue && inconnue.faits.resident === null && inconnue.contexte.statut === 'aucun', 'Zimmer 99 ohne Bewohner: Alarm trotzdem angezeigt, ohne KI-Kontext');
await alarme(20, 'chute');
await alarme(21, 'sortie_lit');

// 3. ungültige Topics und sofortige Wiederholung (der Sensor wiederholt seine Nachricht)
const nb = Number(sql('select count(*) from soins.alarmes;'));
publier('capteurs/chambre12/incendie');
publier('capteurs/chambre22/appel');
publier('capteurs/chambre22/appel'); // sofortige Wiederholung: nur ein Alarm
let attendu = nb + 1;
for (let i = 0; i < 40 && Number(sql('select count(*) from soins.alarmes;')) < attendu; i++) await pause(1000);
await pause(5000);
verifier(Number(sql('select count(*) from soins.alarmes;')) === attendu, 'unbekanntes Topic: kein Alarm; wiederholte Nachricht: nur ein zusätzlicher Alarm');
for (let i = 0; i < 30 && Number(sql("select count(*) from soins.journal_ia where evenement = 'alarme_rejetee' and details->>'topic' = 'capteurs/chambre12/incendie';")) < 1; i++) await pause(2000);
verifier(Number(sql("select count(*) from soins.journal_ia where evenement = 'alarme_rejetee' and details->>'topic' = 'capteurs/chambre12/incendie';")) >= 1, 'unbekanntes Topic: im Prüfprotokoll vermerkt');

// 4. Verzögerungen
const charge = mesures.slice(1);
const totaux = charge.map((m) => m.total_ms).sort((a, b) => a - b);
const pire = totaux.at(-1);
console.log(`\nIm Leerlauf: ${delaiAVide} ms (davon ~${surcout} ms für den docker-Befehl, in Wirklichkeit nicht vorhanden)`);
console.log(`Unter Last (${charge.length} Alarme während der Kontexterzeugung): min ${totaux[0]} ms, Median ${totaux[Math.floor(totaux.length / 2)]} ms, max ${pire} ms`);
const pireReel = pire - surcout + 2000;
console.log(`Schlimmster Fall in der Oberfläche: ${pire} - ${surcout} (docker) + 2000 (Abfrage alle 2 s) = ${pireReel} ms`);
verifier(pireReel < 5000, 'Alarm in der Oberfläche in weniger als 5 Sekunden angezeigt, auch während der Erzeugung (schlimmster Fall)');
mkdirSync(join(racine, 'tests', 'resultats'), { recursive: true });
appendFileSync(join(racine, 'tests', 'resultats', 'alarmes.jsonl'), JSON.stringify({ date: new Date().toISOString(), priorite_ollama_basse: priorite, surcout_docker_ms: surcout, a_vide_ms: delaiAVide, mesures }) + '\n');
// 5. Kontext des KI-Assistenten (nur der erste: jeweils eine Erzeugung)
verifier(['en_cours', 'pret', 'indisponible'].includes(weber.contexte.statut), `Weber: KI-Kontext « ${weber.contexte.statut} » bei der Anzeige`);
const autres = (await lire()).filter((a) => a.id !== weber.id && a.contexte.statut === 'differe').length;
verifier(autres >= 1, `die folgenden Alarme starten keine weitere Erzeugung (${autres} « zurückgestellt »)`);
if (sansContexte) { sql('update soins.alarmes set statut = \'acquittee\';'); console.log(echecs ? `\n${echecs} Fehler.` : '\nAlles bestanden (Kontext nicht abgewartet).'); process.exit(echecs ? 1 : 0); }
console.log('Warten auf den Kontext des KI-Assistenten für Weber…');
let ctx = weber.contexte;
t0 = Date.now();
for (let i = 0; i < 80 && ctx.statut === 'en_cours'; i++) {
  await pause(10000);
  ctx = (await lire()).find((a) => a.id === weber.id)?.contexte ?? ctx;
}
verifier(ctx.statut === 'pret', `Kontext des KI-Assistenten bereit nach ${Math.round((Date.now() - t0) / 1000)} s (Status « ${ctx.statut} »)`);
if (ctx.statut === 'pret') {
  console.log(ctx.texte);
  console.log(`entfernte Sätze: ${ctx.retirees.length}`);
  verifier(/\[Sensoren\]/.test(ctx.texte) && !/Information nicht verfügbar\.\s*\n\s*Kontext/.test(ctx.texte.split('\n').slice(0, 2).join('\n') + '\n'), 'der Kontext nennt die Quelle [Sensoren] für den Alarm');
}

// 6. Quittierung
await acquitter(weber.id);
verifier(!(await lire()).some((a) => a.id === weber.id), 'quittieren: Der Alarm verschwindet aus der Liste');
console.log(echecs ? `\n${echecs} Fehler.` : '\nAlles bestanden.');
process.exit(echecs ? 1 : 0);
