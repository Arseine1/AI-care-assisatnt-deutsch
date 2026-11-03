// Verwaltung der Konten der Pflegekräfte (Kennung + PIN-Code), ohne Code oder Workflows anzutasten.
//
//   node scripts/creer-compte.mjs                              geführter Modus: stellt die Fragen nacheinander
//   node scripts/creer-compte.mjs <Kennung> "<Anzeigename>" [PIN]    erstellt ein Konto (zufällige PIN, falls weggelassen)
//   node scripts/creer-compte.mjs --pin <Kennung> [PIN]        ändert die PIN eines Kontos (zufällig, falls weggelassen)
//   node scripts/creer-compte.mjs --desactiver <Kennung>       das Konto kann sich nicht mehr anmelden (seine Sitzungen werden beendet)
//   node scripts/creer-compte.mjs --activer <Kennung>          aktiviert es wieder
//   node scripts/creer-compte.mjs --liste                      listet die Konten auf
//
// Regeln: Kennung mit 2 bis 40 Zeichen (Kleinbuchstaben, Ziffern, Punkt, Bindestrich, Unterstrich); PIN mit 4 bis 8 Ziffern.
// Die PIN wird GEHASHT (scrypt, eigener Salt pro Konto), bevor sie gespeichert wird: Die Datenbank enthält sie nie im Klartext.
// Eine zufällig gezogene PIN wird EINMAL auf dem Bildschirm angezeigt; sie wird nirgends gespeichert.
import { randomBytes, randomInt, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const hacher = (pin) => {
  const sel = randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${scryptSync(pin, sel, 32).toString('hex')}`;
};
const psql = (requete) => {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -v ON_ERROR_STOP=1 -t -A -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: join(racine, 'compose'), input: requete, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`Die Datenbank antwortet nicht (ist Docker gestartet?): ${r.stderr.replace(/scrypt\$[0-9a-f$]+/g, 'scrypt$***').trim()}`);
    process.exit(1);
  }
  return r.stdout.trim();
};
const echapper = (texte) => texte.replace(/'/g, "''");
const erreur = (message) => {
  console.error(message);
  process.exit(1);
};

const valideIdentifiant = (id) => /^[a-z0-9._-]{2,40}$/.test(id);
const validePin = (pin) => /^\d{4,8}$/.test(pin);
const nomPropre = (nom) => nom.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const pinAuHasard = () => String(randomInt(100000, 1000000));
const avertissementPin = (pin) => {
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) console.log('Achtung: Diese PIN ist sehr leicht zu erraten (Zahlenfolge oder wiederholte Ziffer). Für einen Test akzeptabel, danach vermeiden.');
};
const existe = (id) => psql(`SELECT count(*) FROM soins.soignants WHERE identifiant = '${id}'`) === '1';

function creer(id, nom, pinDemande) {
  if (!valideIdentifiant(id)) erreur("Kennung abgelehnt: 2 bis 40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich (ohne Umlaute und Leerzeichen).");
  const affiche = nomPropre(nom);
  if (affiche.length < 2) erreur('Der Anzeigename ist zu kurz.');
  if (existe(id)) erreur(`Das Konto „${id}“ existiert bereits. Um seine PIN zu ändern: node scripts/creer-compte.mjs --pin ${id}`);
  const pin = pinDemande ?? pinAuHasard();
  if (!validePin(pin)) erreur('PIN abgelehnt: nur 4 bis 8 Ziffern (keine Buchstaben).');
  psql(`INSERT INTO soins.soignants (identifiant, nom, pin_hash) VALUES ('${id}', '${echapper(affiche)}', '${hacher(pin)}')`);
  console.log(`\nKonto erstellt.\n  Kennung      : ${id}\n  Anzeigename  : ${affiche}\n  PIN-Code     : ${pin}${pinDemande ? '' : '   (zufällig gezogen: jetzt notieren, er wird nicht mehr angezeigt)'}`);
  avertissementPin(pin);
  console.log(`\nAnmeldung: Die Oberfläche öffnen (http://localhost:5173) und diese Kennung und diese PIN eingeben.`);
}

function changerPin(id, pinDemande) {
  if (!valideIdentifiant(id) || !existe(id)) erreur(`Konto „${id}“ nicht gefunden. Vorhandene Konten: node scripts/creer-compte.mjs --liste`);
  const pin = pinDemande ?? pinAuHasard();
  if (!validePin(pin)) erreur('PIN abgelehnt: nur 4 bis 8 Ziffern (keine Buchstaben).');
  psql(`UPDATE soins.soignants SET pin_hash = '${hacher(pin)}', actif = true WHERE identifiant = '${id}'; DELETE FROM soins.sessions WHERE identifiant = '${id}'; DELETE FROM soins.connexions_echecs WHERE identifiant = '${id}'`);
  console.log(`PIN von „${id}“ geändert: ${pin}${pinDemande ? '' : '   (zufällig gezogen: jetzt notieren)'}\nSeine offenen Sitzungen sind beendet: Er muss sich erneut anmelden.`);
  avertissementPin(pin);
}

function activer(id, actif) {
  if (!valideIdentifiant(id) || !existe(id)) erreur(`Konto „${id}“ nicht gefunden. Vorhandene Konten: node scripts/creer-compte.mjs --liste`);
  psql(`UPDATE soins.soignants SET actif = ${actif} WHERE identifiant = '${id}'${actif ? '' : `; DELETE FROM soins.sessions WHERE identifiant = '${id}'`}`);
  console.log(actif ? `Konto „${id}“ wieder aktiviert.` : `Konto „${id}“ deaktiviert: Es kann sich nicht mehr anmelden, seine Sitzungen sind beendet. Sein Bestätigungsverlauf bleibt erhalten.`);
}

function liste() {
  const l = psql("SELECT identifiant, nom, CASE WHEN actif THEN 'aktiv' ELSE 'deaktiviert' END, to_char(cree_le, 'DD.MM.YYYY'), (SELECT count(*) FROM soins.sessions s WHERE s.identifiant = g.identifiant AND s.expire_le > now()) FROM soins.soignants g ORDER BY identifiant");
  console.log('Kennung            Anzeigename                           Status      Erstellt am Offene Sitzungen');
  for (const ligne of l.split('\n').filter(Boolean)) {
    const [id, nom, etat, date, sessions] = ligne.split('|');
    console.log(`${id.padEnd(18)} ${nom.padEnd(37)} ${etat.padEnd(11)} ${date}  ${sessions}`);
  }
}

async function guide() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Konto für eine Pflegekraft erstellen (leer lassen zum Abbrechen).\n');
  const id = (await rl.question('Anmeldekennung (z. B.: arsene2, ohne Umlaute und Leerzeichen): ')).trim().toLowerCase();
  if (!id) return rl.close();
  const nom = (await rl.question('In der Oberfläche angezeigter Name (z. B.: Frau Anna Weiss): ')).trim();
  const pin = (await rl.question('PIN-Code, 4 bis 8 Ziffern (leer = zufällig gezogen): ')).trim();
  rl.close();
  creer(id, nom, pin || undefined);
}

const [a, b, c] = args;
if (a === '--liste') liste();
else if (a === '--pin') changerPin((b ?? '').toLowerCase(), c);
else if (a === '--desactiver') activer((b ?? '').toLowerCase(), false);
else if (a === '--activer') activer((b ?? '').toLowerCase(), true);
else if (a === '--aide' || a === '-h') console.log(readmeAide());
else if (!a) await guide();
else creer(a.toLowerCase(), b ?? '', c);

function readmeAide() {
  return [
    'Konto erstellen:         node scripts/creer-compte.mjs                (geführter Modus)',
    '                         node scripts/creer-compte.mjs anna "Frau Anna Weiss" 482913',
    'PIN ändern:              node scripts/creer-compte.mjs --pin anna',
    'Deaktivieren / aktivieren: node scripts/creer-compte.mjs --desactiver anna   |   --activer anna',
    'Konten auflisten:        node scripts/creer-compte.mjs --liste',
  ].join('\n');
}
