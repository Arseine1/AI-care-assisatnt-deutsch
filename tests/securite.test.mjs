// Tests hors n8n de l'étape 7 du jour 4 : sécurité minimale (connexion du soignant, sessions, clé des webhooks, origines, secrets).
// Lancer : node tests/securite.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { racine, workflow, jsCode, lancer } from './lib/prompts-harness.mjs';

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};
const tous = readdirSync(join(racine, 'workflows')).filter((f) => /^\d\d-.*\.json$/.test(f)).map((f) => ({ f, wf: workflow(f) }));
const webhooks = tous.flatMap(({ f, wf }) => wf.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook').map((n) => ({ f, wf, n, chemin: n.parameters.path })));
const voisins = (w, nom) => (w.connections[nom]?.main ?? []).flatMap((liste, sortie) => (liste ?? []).map((l) => ({ vers: l.node, sortie })));
const PUBLICS = ['courrier-recu']; // appelé par Mailpit, qui ne sait pas envoyer d'en-tête (limite documentée dans DECISIONS.md)
const SANS_SESSION = ['aicare-connexion', 'aicare-verifier-interne', ...PUBLICS];

// ---------------------------------------------------------------- clé des webhooks et origines
test('tous les webhooks (sauf le courrier reçu de Mailpit) exigent une clé secrète en en-tête', () => {
  assert.ok(webhooks.length >= 18);
  for (const { f, n, chemin } of webhooks) {
    if (PUBLICS.includes(chemin)) {
      assert.equal(n.parameters.authentication, undefined, `${chemin} : appelé par Mailpit`);
      continue;
    }
    assert.equal(n.parameters.authentication, 'headerAuth', `${f} : ${chemin}`);
    assert.ok(n.credentials?.httpHeaderAuth?.id, `${f} : ${chemin} sans credential`);
  }
});
test('le chemin interne a sa propre clé, distincte de celle de l\'interface', () => {
  const interne = webhooks.find((w) => w.chemin === 'aicare-verifier-interne');
  assert.equal(interne.n.credentials.httpHeaderAuth.name, 'AI-Care clé interne');
  const autres = webhooks.filter((w) => !PUBLICS.includes(w.chemin) && w.chemin !== 'aicare-verifier-interne');
  for (const a of autres) assert.equal(a.n.credentials.httpHeaderAuth.name, 'AI-Care clé des webhooks', a.chemin);
  assert.equal(interne.n.parameters.options?.allowedOrigins, undefined, 'aucun navigateur n\'appelle le chemin interne');
});
test('CORS : plus aucune ouverture à toutes les origines, seulement l\'adresse de l\'interface', () => {
  for (const { f, n, chemin } of webhooks) {
    const o = n.parameters.options?.allowedOrigins;
    assert.notEqual(o, '*', `${f} : ${chemin}`);
    if (o) assert.ok(o.split(',').every((x) => /^http:\/\/(localhost|127\.0\.0\.1):\d{4}$/.test(x)), `${chemin} : ${o}`);
  }
  for (const { chemin, n } of webhooks.filter((w) => !SANS_SESSION.includes(w.chemin) || w.chemin === 'aicare-connexion')) assert.ok(n.parameters.options.allowedOrigins, chemin);
});

// ---------------------------------------------------------------- la session est contrôlée AVANT tout traitement
test('chaque point d\'entrée des soignants passe par le contrôle de session avant tout nœud de traitement', () => {
  const gardes = webhooks.filter((w) => !SANS_SESSION.includes(w.chemin));
  assert.ok(gardes.length >= 15);
  for (const { f, wf, n, chemin } of gardes) {
    // tout ce qui est atteignable SANS passer par la sortie « session valide » doit être le contrôle lui-même ou le refus
    const vus = new Set();
    const aller = (nom) => {
      if (vus.has(nom)) return;
      vus.add(nom);
      for (const v of voisins(wf, nom)) {
        if (/^Session valide \?/.test(nom) && v.sortie === 0) continue; // chemin autorisé
        aller(v.vers);
      }
    };
    aller(n.name);
    const hors = [...vus].filter((x) => x !== n.name && !/^(Session|Refus \(session\)|Répondre \(session\))/.test(x));
    assert.deepEqual(hors, [], `${f} : ${chemin} atteint ${hors.join(', ')} sans session`);
    assert.ok([...vus].some((x) => /^Session valide \?/.test(x)), `${f} : ${chemin} sans contrôle de session`);
    // le point d'entrée n'est branché sur rien d'autre que le contrôle
    assert.match(voisins(wf, n.name)[0].vers, /^Session \(jeton\)/);
  }
});
test('le contrôle de session lit la base : jeton haché, session non expirée, compte actif', () => {
  const wf = workflow('72-maitre-valider.json');
  const q = wf.nodes.find((x) => x.name === 'Session (base)').parameters.query;
  assert.match(q, /s\.jeton_hash = \$1/);
  assert.match(q, /s\.expire_le > now\(\)/);
  assert.match(q, /g\.actif/);
});
const jeton = jsCode('72-maitre-valider.json', 'Session (jeton)');
test('jeton : seul « Bearer » + 43 caractères sûrs est accepté, et seule l\'empreinte SHA-256 est transmise', () => {
  const j = randomBytes(32).toString('base64url');
  assert.equal(j.length, 43);
  const attendu = createHash('sha256').update(j).digest('hex');
  assert.equal(lancer(jeton, { entree: { headers: { authorization: `Bearer ${j}` } } })[0].hash, attendu);
  for (const faux of [undefined, '', 'Bearer ', `Bearer ${j}x`, `Bearer ${j.slice(1)}`, `Basic ${j}`, `bearer ${j}`, `Bearer ${j.slice(1)}'; DROP TABLE soins.sessions;--`, `Bearer ${j}\nBearer ${j}`]) {
    assert.equal(lancer(jeton, { entree: { headers: { authorization: faux } } })[0].hash, '', JSON.stringify(faux));
  }
  assert.equal(lancer(jeton, { entree: {} })[0].hash, '');
});
test('résultat de session : sans ligne -> refus ; avec une ligne -> le soignant, jamais le PIN', () => {
  const res = jsCode('72-maitre-valider.json', 'Session');
  assert.deepEqual(lancer(res, { entree: {} })[0], { ok: false });
  const ok = lancer(res, { entree: { identifiant: 'martin', nom: 'Mme Martin', jeton_hash: 'abc' } })[0];
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.soignant, { identifiant: 'martin', nom: 'Mme Martin' });
  assert.doesNotMatch(JSON.stringify(ok), /pin/i);
});
test('refus de session : aucune donnée, seulement le motif', () => {
  assert.deepEqual(lancer(jsCode('72-maitre-valider.json', 'Refus (session)'))[0], { erreur: 'session' });
  // les workflows qui répondent par « Répondre au webhook » ont leur propre réponse de refus
  for (const f of ['74-maitre-etage.json', '77-maitre-verifier.json']) assert.ok(workflow(f).nodes.some((x) => x.name === 'Répondre (session)'), f);
});

// ---------------------------------------------------------------- connexion : PIN haché, comptes verrouillés, mêmes refus
const connexion = workflow('88-connexion.json');
const hache = (pin) => {
  const sel = randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${scryptSync(pin, sel, 32).toString('hex')}`;
};
const verifier = (pin, soignant, forme = true) =>
  lancer(jsCode('88-connexion.json', 'Vérifier le PIN'), { entree: soignant, noeuds: { 'Contrôler la connexion': [{ identifiant: 'martin', pin, forme }] } })[0];
const compte = { identifiant: 'martin', nom: 'Mme Martin', pin_hash: hache('482913'), actif: true, verrouille: false };

test('connexion : la forme de l\'identifiant et du PIN est contrôlée', () => {
  const c = jsCode('88-connexion.json', 'Contrôler la connexion');
  const lire = (body) => lancer(c, { entree: { body } })[0];
  assert.deepEqual(lire({ identifiant: ' Martin ', pin: '482913' }), { identifiant: 'martin', pin: '482913', forme: true });
  for (const faux of [{}, { identifiant: 'martin' }, { identifiant: 'martin', pin: '12' }, { identifiant: 'martin', pin: '123456789' }, { identifiant: 'martin', pin: 'abcdef' }, { identifiant: "x'; DROP TABLE soins.soignants;--", pin: '123456' }, { identifiant: 'a', pin: '123456' }, { identifiant: 'martin', pin: ['1', '2', '3', '4'] }]) {
    assert.equal(lire(faux).forme, false, JSON.stringify(faux));
  }
  assert.equal(lire({ identifiant: "x'; DROP", pin: '123456' }).pin, '', 'un PIN de forme invalide n\'est pas conservé');
});
test('PIN : comparé à l\'empreinte scrypt, bon PIN accepté, mauvais refusé', () => {
  const ok = verifier('482913', compte);
  assert.equal(ok.autorise, true);
  assert.equal(ok.motif, 'ok');
  assert.equal(ok.nom, 'Mme Martin');
  assert.equal(verifier('482914', compte).autorise, false);
  assert.equal(verifier('482914', compte).motif, 'identifiants');
});
test('PIN : un compte inconnu, désactivé ou sans empreinte est refusé comme un mauvais PIN (rien ne révèle si le compte existe)', () => {
  const inconnu = verifier('482913', {});
  const inactif = verifier('482913', { ...compte, actif: false });
  const sans = verifier('482913', { ...compte, pin_hash: null });
  for (const r of [inconnu, inactif, sans]) {
    assert.equal(r.autorise, false);
    assert.equal(r.motif, 'identifiants');
    assert.equal(r.nom, null);
  }
});
test('verrouillage : 5 échecs -> même le BON PIN est refusé pendant le délai ; la forme invalide est refusée aussi', () => {
  const v = verifier('482913', { ...compte, verrouille: true });
  assert.equal(v.autorise, false);
  assert.equal(v.motif, 'verrouille');
  assert.equal(verifier('482913', compte, false).motif, 'format');
  const q = connexion.nodes.find((x) => x.name === 'Soignant').parameters.query;
  assert.match(q, /count\(\*\)[\s\S]*interval '5 minutes'\) >= 5 AS verrouille/);
  assert.match(connexion.nodes.find((x) => x.name === "Noter l'échec").parameters.query, /EXISTS \(SELECT 1 FROM soins\.soignants/);
});
test('le refus de connexion est identique pour un compte inconnu et un mauvais PIN ; seul le verrouillage est signalé', () => {
  const refus = (motif) => lancer(jsCode('88-connexion.json', 'Refus de connexion'), { entree: {}, noeuds: { 'Vérifier le PIN': [{ motif }] } })[0];
  assert.deepEqual(refus('identifiants'), { erreur: 'identifiants' });
  assert.deepEqual(refus('format'), { erreur: 'identifiants' });
  assert.deepEqual(refus('verrouille'), { erreur: 'verrouille' });
});
test('jeton de session : 32 octets aléatoires, jamais le même, seule l\'empreinte va en base, durée de 12 heures', () => {
  const creer = () => lancer(jsCode('88-connexion.json', 'Créer le jeton'), { entree: {}, noeuds: { 'Vérifier le PIN': [{ identifiant: 'martin', nom: 'Mme Martin' }] } })[0];
  const a = creer();
  const b = creer();
  assert.match(a.jeton, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.jeton, b.jeton);
  assert.equal(a.hash, createHash('sha256').update(a.jeton).digest('hex'));
  assert.doesNotMatch(connexion.nodes.find((x) => x.name === 'Ouvrir la session').parameters.query, /jeton[^_]/, 'le jeton en clair n\'est pas écrit en base');
  assert.match(readFileSync(join(racine, 'data', 'sql', '01_schema.sql'), 'utf8'), /expire_le\s+timestamptz NOT NULL DEFAULT now\(\) \+ interval '12 hours'/);
  const rep = lancer(jsCode('88-connexion.json', 'Réponse connexion'), { entree: { expire_le: 'demain' }, noeuds: { 'Créer le jeton': [a] } })[0];
  assert.deepEqual(Object.keys(rep).sort(), ['expire_le', 'jeton', 'soignant']);
  assert.equal(rep.hash, undefined, 'l\'empreinte n\'est pas renvoyée');
});
test('SÉCURITÉ : le PIN n\'est enregistré nulle part (ni en base, ni au journal, ni dans une réponse)', () => {
  const schema = readFileSync(join(racine, 'data', 'sql', '01_schema.sql'), 'utf8');
  assert.match(schema, /pin_hash\s+text NOT NULL/);
  assert.doesNotMatch(schema, /\bpin\s+text/i);
  for (const n of connexion.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) assert.doesNotMatch(n.parameters.query, /\bpin\b(?!_hash)/i, n.name);
  // les autres nœuds de code ne lisent pas le PIN (on ignore les noms de nœuds cités et les commentaires)
  for (const x of connexion.nodes.filter((y) => !['Contrôler la connexion', 'Vérifier le PIN'].includes(y.name) && y.type.endsWith('code'))) {
    assert.doesNotMatch(x.parameters.jsCode.replace(/\/\/.*$/gm, '').replace(/\$\('[^']*'\)/g, ''), /\bpin\b(?!_hash)/i, x.name);
  }
});

// ---------------------------------------------------------------- le nom du soignant vient de la session, jamais de la requête
test('SIGNATURE : valide_par et soignant_id viennent de la session ; le corps de la requête ne peut pas les imposer', () => {
  const session = { 'Session': [{ soignant: { identifiant: 'martin', nom: 'Mme Martin' } }] };
  const piege = { valide_par: 'Dr. Quelqu\'un d\'autre', soignant_id: 'keller' };
  const un = lancer(jsCode('72-maitre-valider.json', 'Corps de la validation'), { entree: { body: { brouillon_id: 'b1', texte: 'T', ...piege } }, noeuds: session })[0];
  assert.equal(un.valide_par, 'Mme Martin');
  assert.equal(un.soignant_id, 'martin');
  const lot = lancer(jsCode('73-maitre-valider-lot.json', 'Corps du lot'), { entree: { body: { etage: 1, rapports: [{ brouillon_id: 'b1', texte: 'T', ...piege }, { brouillon_id: 'b2', texte: 'U' }] } }, noeuds: session });
  assert.deepEqual(lot.map((x) => [x.valide_par, x.soignant_id]), [['Mme Martin', 'martin'], ['Mme Martin', 'martin']]);
  // aucun point d'entrée n'accepte valide_par ni soignant_id depuis la requête (« r.valide_par » du message de transmission est lu dans la base)
  for (const { f, wf } of tous) for (const n of wf.nodes.filter((x) => x.type.endsWith('.code'))) assert.doesNotMatch(n.parameters.jsCode, /body\??\.valide_par|\bb\.valide_par|\bb\.soignant_id|body\??\.soignant_id/, `${f} : ${n.name}`);
});
test('SIGNATURE : le soignant est enregistré avec la validation et au journal d\'audit', () => {
  const enreg = workflow('63-brique-enregistrer.json');
  const q = enreg.nodes.find((x) => x.name === 'Valider le brouillon');
  assert.match(q.parameters.query, /valide_par, soignant_id, brouillon_id/);
  assert.match(q.parameters.query, /NULLIF\(\$4::text, ''\)/);
  assert.match(String(q.parameters.options?.queryReplacement ?? q.parameters.queryReplacement ?? JSON.stringify(q.parameters)), /soignant_id/);
  const ctrl = lancer(jsCode('63-brique-enregistrer.json', 'Contrôler la validation'), { entree: { brouillon_id: 'a1c3e000-0001-4000-8000-000000000001', texte: 'T', valide_par: 'Mme Martin', soignant_id: 'martin' } })[0];
  assert.equal(ctrl.soignant_id, 'martin');
  const res = lancer(jsCode('63-brique-enregistrer.json', 'Résultat de la validation'), { entree: {}, noeuds: { 'Contrôler la validation': [ctrl], 'Valider le brouillon': [{ validation_id: 7, patient_id: 'PAT-001', mode: 'a', action: 'generer_sbar', modifiee: false }] } })[0];
  assert.equal(res.evenement_journal.details.soignant_id, 'martin');
  assert.equal(res.evenement_journal.details.valide_par, 'Mme Martin');
});
test('« qui suis-je » et déconnexion : la session ferme le jeton de la requête, et seulement lui', () => {
  const moi = workflow('89-session.json');
  assert.match(moi.nodes.find((x) => x.name === 'Fermer la session').parameters.query, /DELETE FROM soins\.sessions WHERE jeton_hash = \$1/);
  const rep = lancer(jsCode('89-session.json', 'Réponse moi'), { entree: {}, noeuds: { Session: [{ soignant: { identifiant: 'martin', nom: 'Mme Martin' }, jeton_hash: 'h' }] } })[0];
  assert.deepEqual(rep, { soignant: { identifiant: 'martin', nom: 'Mme Martin' } });
});

// ---------------------------------------------------------------- l'appel interne du courrier
test('le workflow du courrier appelle le chemin INTERNE avec la clé interne (et non l\'interface publique)', () => {
  const v = workflow('85-brique-courrier.json').nodes.find((x) => x.name === 'Vérifier le courrier');
  assert.match(v.parameters.url, /aicare-verifier-interne$/);
  assert.equal(v.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(v.credentials.httpHeaderAuth.name, 'AI-Care clé interne');
  const w = workflow('77-maitre-verifier.json');
  assert.deepEqual(voisins(w, 'Webhook (interne)').map((x) => x.vers), ['Contrôler la demande']);
});

// ---------------------------------------------------------------- l'interface
test('interface : clé et jeton partent dans les en-têtes, le PIN n\'est jamais conservé, la session perdue ramène à la connexion', () => {
  const api = readFileSync(join(racine, 'front', 'src', 'api.js'), 'utf8');
  assert.match(api, /'X-AICare-Cle': CLE/);
  assert.match(api, /Authorization: `Bearer \$\{jeton\}`/);
  assert.match(api, /json\?\.erreur === 'session'/);
  assert.match(api, /sessionStorage/);
  assert.doesNotMatch(api, /localStorage/);
  assert.doesNotMatch(api, /(setItem|memoriserJeton)\([^)]*pin/i);
  const front = readdirSync(join(racine, 'front', 'src'), { recursive: true }).filter((f) => /\.(jsx?|json)$/.test(f)).map((f) => readFileSync(join(racine, 'front', 'src', f), 'utf8')).join('\n');
  assert.doesNotMatch(front, /AICARE_CLE_INTERNE|CLE_INTERNE/, 'la clé interne n\'est jamais dans l\'interface');
});

// ---------------------------------------------------------------- aucun secret dans le dépôt
test('SECRETS : aucune clé, aucun mot de passe de .env n\'apparaît dans un fichier du dépôt', () => {
  const envFichier = join(racine, '.env');
  assert.ok(existsSync(envFichier), '.env absent');
  const env = readFileSync(envFichier, 'utf8');
  const secrets = [...env.matchAll(/^(AICARE_CLE_WEBHOOK|AICARE_CLE_INTERNE|VITE_N8N_CLE|MQTT_MOT_DE_PASSE_\w+|TTN_CLE_API|POSTGRES_PASSWORD)=(.{8,})$/gm)].map((m) => m[2].trim()).filter((v) => v !== 'TA-CLE');
  assert.ok(secrets.length >= 6);
  const git = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: racine, encoding: 'utf8' });
  assert.equal(git.status, 0, 'git ls-files a échoué');
  const fichiers = git.stdout.split('\n').filter((f) => f && !/\.(pdf|png|jpe?g|ico|woff2?)$/i.test(f) && existsSync(join(racine, f)));
  assert.ok(fichiers.length > 100);
  for (const f of fichiers) {
    const contenu = readFileSync(join(racine, f), 'utf8');
    for (const s of secrets) assert.ok(!contenu.includes(s), `un secret de .env apparaît dans ${f}`);
    assert.doesNotMatch(contenu, /NNSXS\.[A-Z0-9]{20,}/, `une clé TTN apparaît dans ${f}`);
  }
  assert.match(readFileSync(join(racine, '.gitignore'), 'utf8'), /^\.env$/m);
  assert.match(readFileSync(join(racine, '.gitignore'), 'utf8'), /mosquitto\/passwd/);
  const exemple = readFileSync(join(racine, '.env.exemple'), 'utf8');
  for (const cle of ['AICARE_CLE_WEBHOOK', 'AICARE_CLE_INTERNE', 'VITE_N8N_CLE', 'TTN_CLE_API', 'DEMO_PIN_MARTIN', 'MQTT_MOT_DE_PASSE_N8N']) assert.match(exemple, new RegExp(`^${cle}=TA-CLE$`, 'm'), cle);
});

console.log(`\n${nb} tests réussis.`);
