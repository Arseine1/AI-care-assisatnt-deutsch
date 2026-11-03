// Crée (ou met à jour) les comptes de démonstration des soignants (FICTIFS) dans PostgreSQL.
// Les codes PIN viennent de .env (DEMO_PIN_*, générés par scripts/generer-secrets.mjs) ; ils sont HACHÉS (scrypt, sel propre à chaque compte)
// avant d'être enregistrés : la base ne contient jamais un PIN en clair. Les PIN ne sont pas affichés : ouvrir .env pour les lire.
// Rejouable : relancer le script remet les PIN de .env.
// Usage : node scripts/creer-soignants.mjs
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(racine, '.env'), 'utf8');
const lire = (cle) => new RegExp(`^${cle}=(.*)$`, 'm').exec(env)?.[1]?.trim();

const COMPTES = [
  { identifiant: 'martin', nom: 'Mme Claudia Martin (soins)', pin: 'DEMO_PIN_MARTIN' },
  { identifiant: 'keller', nom: 'M. Jonas Keller (soins)', pin: 'DEMO_PIN_KELLER' },
  { identifiant: 'roth', nom: 'Mme Eva Roth (infirmière)', pin: 'DEMO_PIN_ROTH' },
  { identifiant: 'arsene', nom: 'Arsène (compte de test)', pin: 'DEMO_PIN_ARSENE' },
];

// format : scrypt$<sel en hexadécimal>$<empreinte en hexadécimal> (lu par le nœud « Vérifier le PIN »)
export const hacher = (pin) => {
  const sel = randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${scryptSync(pin, sel, 32).toString('hex')}`;
};

const lignes = [];
for (const c of COMPTES) {
  const pin = lire(c.pin);
  if (!/^\d{4,8}$/.test(pin ?? '')) {
    console.error(`${c.pin} manque ou n'a pas 4 à 8 chiffres dans .env : lancer d'abord node scripts/generer-secrets.mjs`);
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
console.log(`${COMPTES.length} comptes de démonstration enregistrés : ${COMPTES.map((c) => c.identifiant).join(', ')}. PIN : voir DEMO_PIN_* dans .env (non affichés).`);
