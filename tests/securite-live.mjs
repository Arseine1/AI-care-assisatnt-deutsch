// ECHTER Sicherheitstest (Schritt 7 von Tag 4) gegen n8n: Webhook-Schlüssel, Sitzung, Anmeldung per PIN, Sperre, Abmeldung,
// erlaubte Ursprünge (CORS), bei der Bestätigung gespeicherter Name der Pflegekraft, interner Pfad der Post.
// Start: node tests/securite-live.mjs        (n8n und PostgreSQL gestartet, Workflows importiert, Konten durch scripts/creer-soignants.mjs erstellt)
// Er erstellt TEST-Konten und -Entwürfe (Kennungen „essai-…“) und löscht sie am Ende.
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLE, CLE_INTERNE, COMPTE_TEST, N8N, lireEnv } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const verifier = (condition, message) => {
  console.log(`${condition ? 'OK  ' : 'FEHLER'} ${message}`);
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
// -> { statut, json, entetes } ; `cle: null` = ohne Schlüssel
async function appel(chemin, corps = {}, { cle = CLE, jeton, methode = 'POST', entetes = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...(cle ? { 'X-AICare-Cle': cle } : {}), ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...entetes };
  const res = await fetch(`${N8N}/${chemin}`, { method: methode, headers: h, ...(methode === 'POST' ? { body: JSON.stringify(corps) } : {}) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* kein JSON-Körper */
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
  verifier(comptes === 'keller,martin,roth', 'die drei Demo-Konten existieren (scripts/creer-soignants.mjs)');
  verifier(sql("SELECT count(*) FROM soins.soignants WHERE pin_hash !~ '^scrypt\\$[0-9a-f]{32}\\$[0-9a-f]{64}$'") === '0', 'keine PIN im Klartext in der Datenbank: alle Fingerabdrücke haben das scrypt-Format mit Salt');

  // ------------------------------------------------------------ Webhook-Schlüssel
  const sansCle = await appel('aicare-alarmes', {}, { cle: null });
  verifier(sansCle.statut === 403, `ohne Schlüssel: von n8n abgelehnt (HTTP ${sansCle.statut})`);
  const mauvaiseCle = await appel('aicare-alarmes', {}, { cle: 'nicht-der-richtige' });
  verifier(mauvaiseCle.statut === 403, `falscher Schlüssel: abgelehnt (HTTP ${mauvaiseCle.statut})`);
  const connexionSansCle = await appel('aicare-connexion', { identifiant: COMPTE_TEST, pin: pinDe(COMPTE_TEST) }, { cle: null });
  verifier(connexionSansCle.statut === 403, 'die Anmeldung selbst verlangt den Schlüssel: auch mit der richtigen PIN nichts ohne Schlüssel');

  // ------------------------------------------------------------ ohne Sitzung: nichts wird ausgeführt
  const brouillons0 = sql('SELECT count(*) FROM soins.brouillons');
  const validations0 = sql('SELECT count(*) FROM soins.validations');
  const idFaux = '00000000-0000-4000-8000-000000000000';
  const geschuetzt = [
    ['aicare-action', { action: 'rapport_garde', chambre: '12' }],
    ['aicare-consigne', { chambre: '12', consigne: 'fasse die Nacht zusammen' }],
    ['aicare-valider', { brouillon_id: idFaux, texte: 'Text', valide_par: 'Dr. Falle' }],
    ['aicare-valider-lot', { etage: 1, rapports: [{ brouillon_id: idFaux, texte: 'Text' }] }],
    ['aicare-etage', { etage: 1 }],
    ['aicare-tache', { etage: 1, recent: true }],
    ['aicare-verifier', { chambre: '12' }],
    ['aicare-reglage', { cle: 'verification_ia', valeur: false }],
    ['aicare-annuler', { tache_id: idFaux }],
    ['aicare-alarmes', { acquitter: idFaux }],
    ['aicare-moi', {}],
    ['import-soins', {}],
  ];
  const faussesSessions = [undefined, randomBytes(32).toString('base64url'), 'zu-kurz', "x'; DROP TABLE soins.sessions;--"];
  let refusesOk = 0;
  let total = 0;
  for (const [chemin, corps] of geschuetzt) {
    for (const jeton of faussesSessions) {
      total++;
      const r = await appel(chemin, corps, { jeton });
      if (r.json?.erreur === 'session' || r.statut === 401) refusesOk++;
      else console.log(`   ${chemin} mit Token „${String(jeton).slice(0, 12)}“ hat geantwortet: HTTP ${r.statut} ${JSON.stringify(r.json)?.slice(0, 120)}`);
    }
  }
  verifier(refusesOk === total, `ohne gültige Sitzung, ${geschuetzt.length} Einstiegspunkte × ${faussesSessions.length} Fälle: ${refusesOk}/${total} durch { erreur: 'session' } abgelehnt`);
  verifier(sql('SELECT count(*) FROM soins.brouillons') === brouillons0 && sql('SELECT count(*) FROM soins.validations') === validations0, 'und es wurde nichts erstellt: weder Entwurf noch Bestätigung');
  // etage-auto antwortet „Workflow was started“ sofort beim Empfang (vor der Prüfung): Entscheidend ist, dass OHNE Sitzung NICHTS gestartet wird
  const taches0 = sql('SELECT count(*) FROM soins.taches');
  for (const jeton of faussesSessions) await appel('etage-auto', {}, { jeton });
  await new Promise((r) => setTimeout(r, 4000));
  verifier(sql('SELECT count(*) FROM soins.taches') === taches0, 'etage-auto ohne Sitzung: die Antwort geht sofort raus, aber es wird keine Berichtsaufgabe erstellt');

  // ------------------------------------------------------------ Anmeldung
  const mauvaisPin = await connexion(COMPTE_TEST, pinDe(COMPTE_TEST) === '111111' ? '222222' : '111111');
  const inconnu = await connexion('niemand-hier', '123456');
  verifier(!mauvaisPin.json?.jeton && !inconnu.json?.jeton, 'falsche PIN und unbekanntes Konto: kein Token');
  verifier(JSON.stringify(mauvaisPin.json) === JSON.stringify(inconnu.json) && mauvaisPin.json?.erreur === 'identifiants', `die Ablehnung ist identisch (${JSON.stringify(mauvaisPin.json)}): man kann nicht erkennen, welche Konten existieren`);
  const formeFausse = await connexion("x'; DROP TABLE soins.soignants;--", '12');
  verifier(formeFausse.json?.erreur === 'identifiants' && sql("SELECT count(*) FROM soins.soignants WHERE identifiant IN ('martin','keller','roth')") === '3', 'Kennung oder PIN mit ungültiger Form: abgelehnt, Datenbank unversehrt');

  const ok = await connexion(COMPTE_TEST, pinDe(COMPTE_TEST));
  const jeton = ok.json?.jeton;
  verifier(/^[A-Za-z0-9_-]{43}$/.test(jeton ?? ''), 'richtige PIN: ein Sitzungstoken mit 43 Zeichen wird ausgegeben');
  verifier(ok.json?.soignant?.identifiant === COMPTE_TEST && !JSON.stringify(ok.json).includes(pinDe(COMPTE_TEST)), 'die Antwort enthält die Pflegekraft, nie die PIN');
  const hachage = createHash('sha256').update(jeton).digest('hex');
  verifier(sql(`SELECT count(*) FROM soins.sessions WHERE jeton_hash = '${hachage}'`) === '1', 'die Datenbank behält den SHA-256-Fingerabdruck des Tokens');
  verifier(sql(`SELECT count(*) FROM soins.sessions WHERE jeton_hash = '${jeton}'`) === '0', 'und nie den Token selbst');
  const duree = sql(`SELECT round(extract(epoch FROM (expire_le - cree_le)) / 3600) FROM soins.sessions WHERE jeton_hash = '${hachage}'`);
  verifier(duree === '12', `die Sitzung dauert 12 Stunden (${duree} h)`);

  const moi = await appel('aicare-moi', {}, { jeton });
  verifier(moi.json?.soignant?.identifiant === COMPTE_TEST, 'mit der Sitzung: „Wer bin ich“ antwortet mit der Pflegekraft');
  const alarmes = await appel('aicare-alarmes', {}, { jeton });
  verifier(Array.isArray(alarmes.json?.alarmes), 'mit der Sitzung: die Alarmliste wird geliefert');

  // abgelaufene Sitzung, deaktiviertes Konto
  const expire = randomBytes(32).toString('base64url');
  sql(`INSERT INTO soins.sessions (jeton_hash, identifiant, expire_le) VALUES ('${createHash('sha256').update(expire).digest('hex')}', '${COMPTE_TEST}', now() - interval '1 minute')`);
  verifier((await appel('aicare-moi', {}, { jeton: expire })).json?.erreur === 'session', 'abgelaufene Sitzung: abgelehnt');
  sql(`INSERT INTO soins.soignants (identifiant, nom, pin_hash, actif) VALUES ('essai-inactif', 'Test inaktiv', '${hache('135790')}', true)`);
  const inactif = (await connexion('essai-inactif', '135790')).json?.jeton;
  verifier(Boolean(inactif) && (await appel('aicare-moi', {}, { jeton: inactif })).json?.soignant?.identifiant === 'essai-inactif', 'ein aktives Konto öffnet eine Sitzung');
  sql("UPDATE soins.soignants SET actif = false WHERE identifiant = 'essai-inactif'");
  verifier((await appel('aicare-moi', {}, { jeton: inactif })).json?.erreur === 'session', 'deaktiviertes Konto: seine offene Sitzung wird sofort abgelehnt');
  verifier((await connexion('essai-inactif', '135790')).json?.erreur === 'identifiants', 'und es kann sich nicht mehr anmelden');

  // ------------------------------------------------------------ Sperre
  sql(`INSERT INTO soins.soignants (identifiant, nom, pin_hash) VALUES ('${ESSAI}', 'Test Sperre', '${hache(PIN_ESSAI)}')`);
  for (let i = 0; i < 5; i++) await connexion(ESSAI, '000000');
  const verrou = await connexion(ESSAI, PIN_ESSAI);
  verifier(verrou.json?.erreur === 'verrouille' && !verrou.json?.jeton, '5 Fehlversuche: selbst die RICHTIGE PIN wird abgelehnt (Konto gesperrt)');
  verifier((await connexion(COMPTE_TEST, pinDe(COMPTE_TEST))).json?.jeton !== undefined, 'die Sperre eines Kontos blockiert die anderen nicht');
  sql(`UPDATE soins.connexions_echecs SET le = now() - interval '6 minutes' WHERE identifiant = '${ESSAI}'`);
  verifier(Boolean((await connexion(ESSAI, PIN_ESSAI)).json?.jeton), 'nach 5 Minuten: das Konto wird entsperrt');
  verifier(sql(`SELECT count(*) FROM soins.connexions_echecs WHERE identifiant = '${ESSAI}'`) === '0', 'eine erfolgreiche Anmeldung setzt den Fehlerzähler auf null zurück');
  await connexion('niemand-hier', '123456');
  verifier(sql("SELECT count(*) FROM soins.connexions_echecs WHERE identifiant = 'niemand-hier'") === '0', 'erfundene Kennungen füllen die Fehlertabelle nicht');

  // ------------------------------------------------------------ erlaubte Ursprünge (CORS)
  const preflight = (origine) =>
    fetch(`${N8N}/aicare-alarmes`, { method: 'OPTIONS', headers: { Origin: origine, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-aicare-cle' } });
  const bon = await preflight('http://localhost:5173');
  verifier(bon.headers.get('access-control-allow-origin') === 'http://localhost:5173', `CORS: die Adresse der Oberfläche ist erlaubt (${bon.status}, ${bon.headers.get('access-control-allow-origin')})`);
  const entetesAutorises = (bon.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  verifier(/authorization/.test(entetesAutorises) && /x-aicare-cle/.test(entetesAutorises), `CORS: die Header Authorization und X-AICare-Cle werden akzeptiert (${entetesAutorises})`);
  const mauvais = await preflight('http://pirate.example');
  verifier(mauvais.headers.get('access-control-allow-origin') !== 'http://pirate.example' && mauvais.headers.get('access-control-allow-origin') !== '*', `CORS: ein anderer Ursprung ist nicht erlaubt (${mauvais.headers.get('access-control-allow-origin') ?? 'kein Header'})`);
  const reponseMauvaise = await appel('aicare-alarmes', {}, { jeton, entetes: { Origin: 'http://pirate.example' } });
  verifier(reponseMauvaise.entetes.get('access-control-allow-origin') !== 'http://pirate.example' && reponseMauvaise.entetes.get('access-control-allow-origin') !== '*', 'CORS: die Antwort an einen unbekannten Ursprung erlaubt diesem nicht das Lesen');

  // ------------------------------------------------------------ Signatur: der Name stammt aus der Sitzung, nicht aus der Anfrage
  const brouillon = sql(
    "INSERT INTO soins.brouillons (patient_id, mode, action, consigne, prompt_id, prompt_version, modele, texte_ia, faits, avertissements) VALUES ('PAT-001', 'a', 'resume_epa', 'essai-securite', 'resume_epa', '1', NULL, 'Text der KI (Test)', '[]'::jsonb, '[]'::jsonb) RETURNING id",
  ).split('\n')[0];
  const valider = await appel('aicare-valider', { brouillon_id: brouillon, texte: 'Von der Pflegekraft geprüfter Text (Test)', valide_par: 'Dr. Jemand Anderes', soignant_id: 'keller' }, { jeton });
  verifier(valider.json?.ok === true, `Bestätigung mit Sitzung: gespeichert (${JSON.stringify(valider.json)?.slice(0, 100)})`);
  const ligne = sql(`SELECT valide_par || ' | ' || coalesce(soignant_id, '') FROM soins.validations WHERE brouillon_id = '${brouillon}'`);
  verifier(ligne === `${ok.json.soignant.nom} | ${COMPTE_TEST}`, `der gespeicherte Name ist der der SITZUNG, nicht der des Anfragekörpers („${ligne}“)`);
  const journal = sql(`SELECT details->>'soignant_id' FROM soins.journal_ia WHERE evenement = 'validation' AND details->>'brouillon_id' = '${brouillon}' ORDER BY id DESC LIMIT 1`);
  verifier(journal === COMPTE_TEST, `das Prüfprotokoll trägt die Kennung der Pflegekraft („${journal}“)`);

  // ------------------------------------------------------------ Abmeldung
  const sortie = await appel('aicare-moi', { deconnexion: true }, { jeton });
  verifier(sortie.json?.ok === true, 'Abmeldung: bestätigt');
  verifier((await appel('aicare-alarmes', {}, { jeton })).json?.erreur === 'session', 'nach der Abmeldung nützt der Token nichts mehr');
  verifier(sql(`SELECT count(*) FROM soins.sessions WHERE jeton_hash = '${hachage}'`) === '0', 'und die Sitzung ist aus der Datenbank gelöscht (nicht nur ausgeblendet)');

  // ------------------------------------------------------------ interner Pfad der Post
  verifier((await appel('aicare-verifier-interne', { chambre: '12' }, { cle: null })).statut === 403, 'interner Pfad ohne Schlüssel: abgelehnt');
  verifier((await appel('aicare-verifier-interne', { chambre: '12' }, { cle: CLE })).statut === 403, 'interner Pfad mit dem Schlüssel der OBERFLÄCHE: abgelehnt (getrennter Schlüssel)');
  verifier(CLE_INTERNE && CLE_INTERNE !== CLE, 'die beiden Schlüssel sind verschieden');
  const brouillonsAvantInterne = sql('SELECT count(*) FROM soins.brouillons');
  const interne = await appel('aicare-verifier-interne', { chambre: '99', ref: 'inexistante' }, { cle: CLE_INTERNE });
  // der interne Schlüssel wird akzeptiert (weder 403 noch Sitzungsablehnung); Zimmer 99 existiert nicht: n8n antwortet mit seinem üblichen Fehler, ohne etwas zu erstellen
  verifier(interne.statut !== 403 && interne.json?.erreur !== 'session', `interner Pfad mit dem internen Schlüssel: akzeptiert, ohne Sitzung (HTTP ${interne.statut}: der Schlüssel wurde akzeptiert, kein Bewohner in Zimmer 99)`);
  verifier(sql('SELECT count(*) FROM soins.brouillons') === brouillonsAvantInterne, 'und es wurde kein Entwurf erstellt');
} finally {
  nettoyer();
}
console.log(echecs ? `\n${echecs} Fehler.` : '\nAlles erfolgreich.');
process.exit(echecs ? 1 : 0);
