// Gestion des comptes des soignants (identifiant + code PIN), sans toucher au code ni aux workflows.
//
//   node scripts/creer-compte.mjs                              mode guidé : pose les questions une par une
//   node scripts/creer-compte.mjs <identifiant> "<Nom affiché>" [PIN]    crée un compte (PIN tiré au hasard s'il est omis)
//   node scripts/creer-compte.mjs --pin <identifiant> [PIN]    change le PIN d'un compte (tiré au hasard s'il est omis)
//   node scripts/creer-compte.mjs --desactiver <identifiant>   le compte ne peut plus se connecter (ses sessions sont fermées)
//   node scripts/creer-compte.mjs --activer <identifiant>      le réactive
//   node scripts/creer-compte.mjs --liste                      liste les comptes
//
// Règles : identifiant de 2 à 40 caractères (minuscules, chiffres, point, tiret, souligné) ; PIN de 4 à 8 chiffres.
// Le PIN est HACHÉ (scrypt, sel propre au compte) avant d'être enregistré : la base ne le contient jamais en clair.
// Un PIN tiré au hasard est affiché UNE seule fois, à l'écran ; il n'est écrit nulle part.
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
    console.error(`La base ne répond pas (Docker est-il démarré ?) : ${r.stderr.replace(/scrypt\$[0-9a-f$]+/g, 'scrypt$***').trim()}`);
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
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) console.log('Attention : ce PIN est très facile à deviner (suite ou chiffre répété). Acceptable pour un essai, à éviter ensuite.');
};
const existe = (id) => psql(`SELECT count(*) FROM soins.soignants WHERE identifiant = '${id}'`) === '1';

function creer(id, nom, pinDemande) {
  if (!valideIdentifiant(id)) erreur("Identifiant refusé : 2 à 40 caractères, seulement minuscules, chiffres, point, tiret ou souligné (sans accent ni espace).");
  const affiche = nomPropre(nom);
  if (affiche.length < 2) erreur('Le nom affiché est trop court.');
  if (existe(id)) erreur(`Le compte « ${id} » existe déjà. Pour changer son PIN : node scripts/creer-compte.mjs --pin ${id}`);
  const pin = pinDemande ?? pinAuHasard();
  if (!validePin(pin)) erreur('PIN refusé : 4 à 8 chiffres seulement (pas de lettres).');
  psql(`INSERT INTO soins.soignants (identifiant, nom, pin_hash) VALUES ('${id}', '${echapper(affiche)}', '${hacher(pin)}')`);
  console.log(`\nCompte créé.\n  Identifiant : ${id}\n  Nom affiché : ${affiche}\n  Code PIN    : ${pin}${pinDemande ? '' : '   (tiré au hasard : notez-le maintenant, il ne sera plus affiché)'}`);
  avertissementPin(pin);
  console.log(`\nConnexion : ouvrir l'interface (http://localhost:5173) et saisir cet identifiant et ce PIN.`);
}

function changerPin(id, pinDemande) {
  if (!valideIdentifiant(id) || !existe(id)) erreur(`Compte « ${id} » introuvable. Comptes existants : node scripts/creer-compte.mjs --liste`);
  const pin = pinDemande ?? pinAuHasard();
  if (!validePin(pin)) erreur('PIN refusé : 4 à 8 chiffres seulement (pas de lettres).');
  psql(`UPDATE soins.soignants SET pin_hash = '${hacher(pin)}', actif = true WHERE identifiant = '${id}'; DELETE FROM soins.sessions WHERE identifiant = '${id}'; DELETE FROM soins.connexions_echecs WHERE identifiant = '${id}'`);
  console.log(`PIN de « ${id} » changé : ${pin}${pinDemande ? '' : '   (tiré au hasard : notez-le maintenant)'}\nSes sessions ouvertes sont fermées : il devra se reconnecter.`);
  avertissementPin(pin);
}

function activer(id, actif) {
  if (!valideIdentifiant(id) || !existe(id)) erreur(`Compte « ${id} » introuvable. Comptes existants : node scripts/creer-compte.mjs --liste`);
  psql(`UPDATE soins.soignants SET actif = ${actif} WHERE identifiant = '${id}'${actif ? '' : `; DELETE FROM soins.sessions WHERE identifiant = '${id}'`}`);
  console.log(actif ? `Compte « ${id} » réactivé.` : `Compte « ${id} » désactivé : il ne peut plus se connecter, ses sessions sont fermées. Son historique de validations est conservé.`);
}

function liste() {
  const l = psql("SELECT identifiant, nom, CASE WHEN actif THEN 'actif' ELSE 'désactivé' END, to_char(cree_le, 'DD.MM.YYYY'), (SELECT count(*) FROM soins.sessions s WHERE s.identifiant = g.identifiant AND s.expire_le > now()) FROM soins.soignants g ORDER BY identifiant");
  console.log('Identifiant        Nom affiché                           État        Créé le     Sessions ouvertes');
  for (const ligne of l.split('\n').filter(Boolean)) {
    const [id, nom, etat, date, sessions] = ligne.split('|');
    console.log(`${id.padEnd(18)} ${nom.padEnd(37)} ${etat.padEnd(11)} ${date}  ${sessions}`);
  }
}

async function guide() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Création d’un compte soignant (laissez vide pour annuler).\n');
  const id = (await rl.question('Identifiant de connexion (ex. : arsene2, sans accent ni espace) : ')).trim().toLowerCase();
  if (!id) return rl.close();
  const nom = (await rl.question('Nom affiché dans l’interface (ex. : Mme Anna Weiss) : ')).trim();
  const pin = (await rl.question('Code PIN, 4 à 8 chiffres (vide = tiré au hasard) : ')).trim();
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
    'Créer un compte :        node scripts/creer-compte.mjs                (mode guidé)',
    '                         node scripts/creer-compte.mjs anna "Mme Anna Weiss" 482913',
    'Changer un PIN :         node scripts/creer-compte.mjs --pin anna',
    'Désactiver / réactiver : node scripts/creer-compte.mjs --desactiver anna   |   --activer anna',
    'Lister les comptes :     node scripts/creer-compte.mjs --liste',
  ].join('\n');
}
