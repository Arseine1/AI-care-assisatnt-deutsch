// Erstellt (oder aktualisiert) die Demokonten der Pflegekräfte (FIKTIV) in PostgreSQL.
// Die PIN-Codes stammen aus .env (DEMO_PIN_*, erzeugt von scripts/generer-secrets.mjs); sie werden GEHASHT (scrypt, eigener Salt pro Konto),
// bevor sie gespeichert werden: Die Datenbank enthält nie eine PIN im Klartext. Die PINs werden nicht angezeigt: zum Lesen die .env öffnen.
// Wiederholbar: Ein erneuter Aufruf setzt die PINs aus .env wieder ein.
// Aufruf: node scripts/creer-soignants.mjs
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(racine, '.env'), 'utf8');
const lire = (cle) => new RegExp(`^${cle}=(.*)$`, 'm').exec(env)?.[1]?.trim();

const COMPTES = [
  { identifiant: 'martin', nom: 'Frau Claudia Martin (Pflege)', pin: 'DEMO_PIN_MARTIN' },
  { identifiant: 'keller', nom: 'Herr Jonas Keller (Pflege)', pin: 'DEMO_PIN_KELLER' },
  { identifiant: 'roth', nom: 'Frau Eva Roth (Pflegefachkraft)', pin: 'DEMO_PIN_ROTH' },
  { identifiant: 'arsene', nom: 'Arsène (Testkonto)', pin: 'DEMO_PIN_ARSENE' },
];

// Format: scrypt$<Salt hexadezimal>$<Fingerabdruck hexadezimal> (gelesen vom Knoten „PIN prüfen“)
export const hacher = (pin) => {
  const sel = randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${scryptSync(pin, sel, 32).toString('hex')}`;
};

const lignes = [];
for (const c of COMPTES) {
  const pin = lire(c.pin);
  if (!/^\d{4,8}$/.test(pin ?? '')) {
    console.error(`${c.pin} fehlt oder hat in der .env nicht 4 bis 8 Ziffern: zuerst node scripts/generer-secrets.mjs ausführen`);
    process.exit(1);
  }
  const echap = (v) => v.replace(/'/g, "''");
  lignes.push(
    `INSERT INTO soins.soignants (identifiant, nom, pin_hash) VALUES ('${echap(c.identifiant)}', '${echap(c.nom)}', '${hacher(pin)}') ON CONFLICT (identifiant) DO UPDATE SET nom = excluded.nom, pin_hash = excluded.pin_hash, actif = true;`,
  );
}
lignes.push(`DELETE FROM soins.connexions_echecs;`);
const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], {
  cwd: join(racine, 'compose'),
  input: lignes.join('\n'),
  encoding: 'utf8',
});
if (r.status !== 0) {
  console.error(r.stderr.replace(/scrypt\$[0-9a-f$]+/g, 'scrypt$***'));
  process.exit(1);
}
console.log(`${COMPTES.length} Demokonten gespeichert: ${COMPTES.map((c) => c.identifiant).join(', ')}. PIN: siehe DEMO_PIN_* in der .env (nicht angezeigt).`);
