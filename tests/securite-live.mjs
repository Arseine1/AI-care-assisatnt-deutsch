// Essai RÉEL de la sécurité (étape 7 du jour 4) contre n8n : clé des webhooks, session, connexion par PIN, verrouillage, déconnexion,
// origines autorisées (CORS), nom du soignant enregistré à la validation, chemin interne du courrier.
// Lancer : node tests/securite-live.mjs        (n8n et PostgreSQL démarrés, workflows importés, comptes créés par scripts/creer-soignants.mjs)
// Il crée des comptes et des brouillons d'ESSAI (identifiants « essai-… »), et les supprime à la fin.
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLE, CLE_INTERNE, COMPTE_TEST, N8N, lireEnv } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const verifier = (condition, message) => {
  console.log(`${condition ? 'OK  ' : 'ÉCHEC'} ${message}`);
  if (!condition) echecs++;
};
const sql = (requete) => {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -v ON_ERROR_STOP=1 -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: join(racine, 'compose'), input: requete, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
const hache = (pin) => {
  const sel = randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${scryptSync(pin, sel, 32).toString('hex')}`;
};
// -> { statut, json, entetes } ; `cle: null` = sans clé
async function appel(chemin, corps = {}, { cle = CLE, jeton, methode = 'POST', entetes = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...(cle ? { 'X-AICare-Cle': cle } : {}), ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...entetes };
  const res = await fetch(`${N8N}/${chemin}`, { method: methode, headers: h, ...(methode === 'POST' ? { body: JSON.stringify(corps) } : {}) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* pas de corps JSON */
  }
  return { statut: res.status, json, entetes: res.headers };
}
const connexion = (identifiant, pin) => appel('aicare-connexion', { identifiant, pin });
const pinDe = (id) => lireEnv(`DEMO_PIN_${id.toUpperCase()}`);

const ESSAI = 'essai-verrou';
const PIN_ESSAI = '482913';
const nettoyer = () =>
  sql(`DELETE FROM soins.sessions WHERE identifiant LIKE 'essai-%'; DELETE FROM soins.connexions_echecs WHERE identifiant LIKE 'essai-%'; DELETE FROM soins.soignants WHERE identifiant LIKE 'essai-%'; DELETE FROM soins.validations WHERE consigne = 'essai-securite'; DELETE FROM soins.brouillons WHERE consigne = 'essai-securite';`);

try {
  nettoyer();
  const comptes = sql("SELECT string_agg(identifiant, ',' ORDER BY identifiant) FROM soins.soignants WHERE identifiant IN ('martin', 'keller', 'roth')");
  verifier(comptes === 'keller,martin,roth', 'les trois comptes de démonstration existent (scripts/creer-soignants.mjs)');
  verifier(sql("SELECT count(*) FROM soins.soignants WHERE pin_hash !~ '^scrypt\\$[0-9a-f]{32}\\$[0-9a-f]{64}$'") === '0', 'aucun PIN en clair en base : toutes les empreintes sont au format scrypt avec sel');

  // ------------------------------------------------------------ clé des webhooks
  const sansCle = await appel('aicare-alarmes', {}, { cle: null });
  verifier(sansCle.statut === 403, `sans clé : refusé par n8n (HTTP ${sansCle.statut})`);
  const mauvaiseCle = await appel('aicare-alarmes', {}, { cle: 'pas-la-bonne' });
  verifier(mauvaiseCle.statut === 403, `mauvaise clé : refusé (HTTP ${mauvaiseCle.statut})`);
  const connexionSansCle = await appel('aicare-connexion', { identifiant: COMPTE_TEST, pin: pinDe(COMPTE_TEST) }, { cle: null });
  verifier(connexionSansCle.statut === 403, 'la connexion elle-même exige la clé : même avec le bon PIN, rien sans clé');

  // ------------------------------------------------------------ sans session : rien n'est exécuté
  const brouillons0 = sql('SELECT count(*) FROM soins.brouillons');
  const validations0 = sql('SELECT count(*) FROM soins.validations');
  const idFaux = '00000000-0000-4000-8000-000000000000';
  const protegés = [
    ['aicare-action', { action: 'rapport_garde', chambre: '12' }],
    ['aicare-consigne', { chambre: '12', consigne: 'résume la nuit' }],
    ['aicare-valider', { brouillon_id: idFaux, texte: 'Texte', valide_par: 'Dr. Piège' }],
    ['aicare-valider-lot', { etage: 1, rapports: [{ brouillon_id: idFaux, texte: 'Texte' }] }],
    ['aicare-etage', { etage: 1 }],
    ['aicare-tache', { etage: 1, recent: true }],
    ['aicare-verifier', { chambre: '12' }],
    ['aicare-reglage', { cle: 'verification_ia', valeur: false }],
    ['aicare-annuler', { tache_id: idFaux }],
    ['aicare-alarmes', { acquitter: idFaux }],
    ['aicare-moi', {}],
    ['import-soins', {}],
  ];
  const faussesSessions = [undefined, randomBytes(32).toString('base64url'), 'trop-court', "x'; DROP TABLE soins.sessions;--"];
  let refusesOk = 0;
  let total = 0;
  for (const [chemin, corps] of protegés) {
    for (const jeton of faussesSessions) {
      total++;
      const r = await appel(chemin, corps, { jeton });
      if (r.json?.erreur === 'session' || r.statut === 401) refusesOk++;
      else console.log(`   ${chemin} avec jeton « ${String(jeton).slice(0, 12)} » a répondu : HTTP ${r.statut} ${JSON.stringify(r.json)?.slice(0, 120)}`);
    }
  }
  verifier(refusesOk === total, `sans session valide, ${protegés.length} points d'entrée × ${faussesSessions.length} cas : ${refusesOk}/${total} refusés par { erreur: 'session' }`);
  verifier(sql('SELECT count(*) FROM soins.brouillons') === brouillons0 && sql('SELECT count(*) FROM soins.validations') === validations0, 'et rien n\'a été créé : ni brouillon, ni validation');
  // etage-auto répond « Workflow was started » dès réception (avant le contrôle) : ce qui compte est que RIEN ne soit lancé sans session
  const taches0 = sql('SELECT count(*) FROM soins.taches');
  for (const jeton of faussesSessions) await appel('etage-auto', {}, { jeton });
  await new Promise((r) => setTimeout(r, 4000));
  verifier(sql('SELECT count(*) FROM soins.taches') === taches0, 'etage-auto sans session : la réponse part tout de suite, mais aucune tâche de rapport n\'est créée');

  // ------------------------------------------------------------ connexion
  const mauvaisPin = await connexion(COMPTE_TEST, pinDe(COMPTE_TEST) === '111111' ? '222222' : '111111');
  const inconnu = await connexion('personne-ici', '123456');
  verifier(!mauvaisPin.json?.jeton && !inconnu.json?.jeton, 'mauvais PIN et compte inconnu : aucun jeton');
  verifier(JSON.stringify(mauvaisPin.json) === JSON.stringify(inconnu.json) && mauvaisPin.json?.erreur === 'identifiants', `le refus est identique (${JSON.stringify(mauvaisPin.json)}) : on ne peut pas savoir quels comptes existent`);
  const formeFausse = await connexion("x'; DROP TABLE soins.soignants;--", '12');
  verifier(formeFausse.json?.erreur === 'identifiants' && sql("SELECT count(*) FROM soins.soignants WHERE identifiant IN ('martin','keller','roth')") === '3', 'identifiant ou PIN de forme invalide : refusé, base intacte');

  const ok = await connexion(COMPTE_TEST, pinDe(COMPTE_TEST));
  const jeton = ok.json?.jeton;
  verifier(/^[A-Za-z0-9_-]{43}$/.test(jeton ?? ''), 'bon PIN : un jeton de session de 43 caractères est remis');
  verifier(ok.json?.soignant?.identifiant === COMPTE_TEST && !JSON.stringify(ok.json).includes(pinDe(COMPTE_TEST)), 'la réponse donne le soignant, jamais le PIN');
  const hachage = createHash('sha256').update(jeton).digest('hex');
  verifier(sql(`SELECT count(*) FROM soins.sessions WHERE jeton_hash = '${hachage}'`) === '1', 'la base garde l\'empreinte SHA-256 du jeton');
  verifier(sql(`SELECT count(*) FROM soins.sessions WHERE jeton_hash = '${jeton}'`) === '0', 'et jamais le jeton lui-même');
  const duree = sql(`SELECT round(extract(epoch FROM (expire_le - cree_le)) / 3600) FROM soins.sessions WHERE jeton_hash = '${hachage}'`);
  verifier(duree === '12', `la session dure 12 heures (${duree} h)`);

  const moi = await appel('aicare-moi', {}, { jeton });
  verifier(moi.json?.soignant?.identifiant === COMPTE_TEST, 'avec la session : « qui suis-je » répond le soignant');
  const alarmes = await appel('aicare-alarmes', {}, { jeton });
  verifier(Array.isArray(alarmes.json?.alarmes), 'avec la session : la liste des alarmes est servie');

  // session expirée, compte désactivé
  const expire = randomBytes(32).toString('base64url');
  sql(`INSERT INTO soins.sessions (jeton_hash, identifiant, expire_le) VALUES ('${createHash('sha256').update(expire).digest('hex')}', '${COMPTE_TEST}', now() - interval '1 minute')`);
  verifier((await appel('aicare-moi', {}, { jeton: expire })).json?.erreur === 'session', 'session expirée : refusée');
  sql(`INSERT INTO soins.soignants (identifiant, nom, pin_hash, actif) VALUES ('essai-inactif', 'Essai inactif', '${hache('135790')}', true)`);
  const inactif = (await connexion('essai-inactif', '135790')).json?.jeton;
  verifier(Boolean(inactif) && (await appel('aicare-moi', {}, { jeton: inactif })).json?.soignant?.identifiant === 'essai-inactif', 'un compte actif ouvre une session');
  sql("UPDATE soins.soignants SET actif = false WHERE identifiant = 'essai-inactif'");
  verifier((await appel('aicare-moi', {}, { jeton: inactif })).json?.erreur === 'session', 'compte désactivé : sa session ouverte est refusée aussitôt');
  verifier((await connexion('essai-inactif', '135790')).json?.erreur === 'identifiants', 'et il ne peut plus se connecter');

  // ------------------------------------------------------------ verrouillage
  sql(`INSERT INTO soins.soignants (identifiant, nom, pin_hash) VALUES ('${ESSAI}', 'Essai verrouillage', '${hache(PIN_ESSAI)}')`);
  for (let i = 0; i < 5; i++) await connexion(ESSAI, '000000');
  const verrou = await connexion(ESSAI, PIN_ESSAI);
  verifier(verrou.json?.erreur === 'verrouille' && !verrou.json?.jeton, '5 échecs : même le BON PIN est refusé (compte verrouillé)');
  verifier((await connexion(COMPTE_TEST, pinDe(COMPTE_TEST))).json?.jeton !== undefined, 'le verrouillage d\'un compte ne bloque pas les autres');
  sql(`UPDATE soins.connexions_echecs SET le = now() - interval '6 minutes' WHERE identifiant = '${ESSAI}'`);
  verifier(Boolean((await connexion(ESSAI, PIN_ESSAI)).json?.jeton), 'après 5 minutes : le compte se déverrouille');
  verifier(sql(`SELECT count(*) FROM soins.connexions_echecs WHERE identifiant = '${ESSAI}'`) === '0', 'une connexion réussie remet le compteur d\'échecs à zéro');
  await connexion('personne-ici', '123456');
  verifier(sql("SELECT count(*) FROM soins.connexions_echecs WHERE identifiant = 'personne-ici'") === '0', 'les identifiants inventés ne remplissent pas la table des échecs');

  // ------------------------------------------------------------ origines autorisées (CORS)
  const preflight = (origine) =>
    fetch(`${N8N}/aicare-alarmes`, { method: 'OPTIONS', headers: { Origin: origine, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-aicare-cle' } });
  const bon = await preflight('http://localhost:5173');
  verifier(bon.headers.get('access-control-allow-origin') === 'http://localhost:5173', `CORS : l'adresse de l'interface est autorisée (${bon.status}, ${bon.headers.get('access-control-allow-origin')})`);
  const entetesAutorises = (bon.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  verifier(/authorization/.test(entetesAutorises) && /x-aicare-cle/.test(entetesAutorises), `CORS : les en-têtes Authorization et X-AICare-Cle sont acceptés (${entetesAutorises})`);
  const mauvais = await preflight('http://pirate.example');
  verifier(mauvais.headers.get('access-control-allow-origin') !== 'http://pirate.example' && mauvais.headers.get('access-control-allow-origin') !== '*', `CORS : une autre origine n'est pas autorisée (${mauvais.headers.get('access-control-allow-origin') ?? 'aucun en-tête'})`);
  const reponseMauvaise = await appel('aicare-alarmes', {}, { jeton, entetes: { Origin: 'http://pirate.example' } });
  verifier(reponseMauvaise.entetes.get('access-control-allow-origin') !== 'http://pirate.example' && reponseMauvaise.entetes.get('access-control-allow-origin') !== '*', 'CORS : la réponse à une origine inconnue ne l\'autorise pas à lire');

  // ------------------------------------------------------------ signature : le nom vient de la session, pas de la requête
  const brouillon = sql(
    "INSERT INTO soins.brouillons (patient_id, mode, action, consigne, prompt_id, prompt_version, modele, texte_ia, faits, avertissements) VALUES ('PAT-001', 'a', 'resume_epa', 'essai-securite', 'resume_epa', '1', NULL, 'Texte de l''IA (essai)', '[]'::jsonb, '[]'::jsonb) RETURNING id",
  ).split('\n')[0];
  const valider = await appel('aicare-valider', { brouillon_id: brouillon, texte: 'Texte relu par le soignant (essai)', valide_par: 'Dr. Quelqu\'un d\'autre', soignant_id: 'keller' }, { jeton });
  verifier(valider.json?.ok === true, `validation avec session : enregistrée (${JSON.stringify(valider.json)?.slice(0, 100)})`);
  const ligne = sql(`SELECT valide_par || ' | ' || coalesce(soignant_id, '') FROM soins.validations WHERE brouillon_id = '${brouillon}'`);
  verifier(ligne === `${ok.json.soignant.nom} | ${COMPTE_TEST}`, `le nom enregistré est celui de la SESSION, pas celui du corps de la requête (« ${ligne} »)`);
  const journal = sql(`SELECT details->>'soignant_id' FROM soins.journal_ia WHERE evenement = 'validation' AND details->>'brouillon_id' = '${brouillon}' ORDER BY id DESC LIMIT 1`);
  verifier(journal === COMPTE_TEST, `le journal d'audit porte l'identifiant du soignant (« ${journal} »)`);

  // ------------------------------------------------------------ déconnexion
  const sortie = await appel('aicare-moi', { deconnexion: true }, { jeton });
  verifier(sortie.json?.ok === true, 'déconnexion : confirmée');
  verifier((await appel('aicare-alarmes', {}, { jeton })).json?.erreur === 'session', 'après la déconnexion, le jeton ne sert plus à rien');
  verifier(sql(`SELECT count(*) FROM soins.sessions WHERE jeton_hash = '${hachage}'`) === '0', 'et la session est supprimée de la base (pas seulement masquée)');

  // ------------------------------------------------------------ chemin interne du courrier
  verifier((await appel('aicare-verifier-interne', { chambre: '12' }, { cle: null })).statut === 403, 'chemin interne sans clé : refusé');
  verifier((await appel('aicare-verifier-interne', { chambre: '12' }, { cle: CLE })).statut === 403, 'chemin interne avec la clé de l\'INTERFACE : refusé (clé distincte)');
  verifier(CLE_INTERNE && CLE_INTERNE !== CLE, 'les deux clés sont différentes');
  const brouillonsAvantInterne = sql('SELECT count(*) FROM soins.brouillons');
  const interne = await appel('aicare-verifier-interne', { chambre: '99', ref: 'inexistante' }, { cle: CLE_INTERNE });
  // la clé interne est acceptée (ni 403, ni refus de session) ; la chambre 99 n'existe pas : n8n répond par son erreur habituelle, sans rien créer
  verifier(interne.statut !== 403 && interne.json?.erreur !== 'session', `chemin interne avec la clé interne : accepté, sans session (HTTP ${interne.statut} : la clé est passée, aucun résident en chambre 99)`);
  verifier(sql('SELECT count(*) FROM soins.brouillons') === brouillonsAvantInterne, 'et aucun brouillon n\'a été créé');
} finally {
  nettoyer();
}
console.log(echecs ? `\n${echecs} échec(s).` : '\nTout est réussi.');
process.exit(echecs ? 1 : 0);
