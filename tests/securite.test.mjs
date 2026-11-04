// Tests außerhalb von n8n, Schritt 7 von Tag 4: Mindestsicherheit (Anmeldung der Pflegekraft, Sitzungen, Webhook-Schlüssel, Ursprünge, Geheimnisse).
// Start: node tests/securite.test.mjs   (nach node workflows/generer.mjs)
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
const PUBLICS = ['courrier-recu']; // von Mailpit aufgerufen, das keinen Header senden kann (in DECISIONS.md dokumentierte Grenze)
const SANS_SESSION = ['aicare-connexion', 'aicare-verifier-interne', ...PUBLICS];

// ---------------------------------------------------------------- Webhook-Schlüssel und Ursprünge
test('alle Webhooks (außer der eingegangenen Post von Mailpit) verlangen einen geheimen Schlüssel im Header', () => {
  assert.ok(webhooks.length >= 18);
  for (const { f, n, chemin } of webhooks) {
    if (PUBLICS.includes(chemin)) {
      assert.equal(n.parameters.authentication, undefined, `${chemin}: von Mailpit aufgerufen`);
      continue;
    }
    assert.equal(n.parameters.authentication, 'headerAuth', `${f}: ${chemin}`);
    assert.ok(n.credentials?.httpHeaderAuth?.id, `${f}: ${chemin} ohne Credential`);
  }
});
test('der interne Pfad hat einen eigenen Schlüssel, getrennt von dem der Oberfläche', () => {
  const interne = webhooks.find((w) => w.chemin === 'aicare-verifier-interne');
  assert.equal(interne.n.credentials.httpHeaderAuth.name, 'AI-Care clé interne');
  const autres = webhooks.filter((w) => !PUBLICS.includes(w.chemin) && w.chemin !== 'aicare-verifier-interne');
  for (const a of autres) assert.equal(a.n.credentials.httpHeaderAuth.name, 'AI-Care clé des webhooks', a.chemin);
  assert.equal(interne.n.parameters.options?.allowedOrigins, undefined, 'kein Browser ruft den internen Pfad auf');
});
test('CORS: keine Öffnung für alle Ursprünge mehr, nur die Adresse der Oberfläche', () => {
  for (const { f, n, chemin } of webhooks) {
    const o = n.parameters.options?.allowedOrigins;
    assert.notEqual(o, '*', `${f}: ${chemin}`);
    if (o) assert.ok(o.split(',').every((x) => /^http:\/\/(localhost|127\.0\.0\.1):\d{4}$/.test(x)), `${chemin}: ${o}`);
  }
  for (const { chemin, n } of webhooks.filter((w) => !SANS_SESSION.includes(w.chemin) || w.chemin === 'aicare-connexion')) assert.ok(n.parameters.options.allowedOrigins, chemin);
});

// ---------------------------------------------------------------- die Sitzung wird VOR jeder Verarbeitung geprüft
test('jeder Einstiegspunkt der Pflegekräfte durchläuft die Sitzungsprüfung vor jedem Verarbeitungsknoten', () => {
  const gardes = webhooks.filter((w) => !SANS_SESSION.includes(w.chemin));
  assert.ok(gardes.length >= 15);
  for (const { f, wf, n, chemin } of gardes) {
    // alles, was OHNE den Ausgang „Sitzung gültig“ erreichbar ist, muss die Prüfung selbst oder die Ablehnung sein
    const vus = new Set();
    const aller = (nom) => {
      if (vus.has(nom)) return;
      vus.add(nom);
      for (const v of voisins(wf, nom)) {
        if (/^Sitzung gültig\?/.test(nom) && v.sortie === 0) continue; // erlaubter Pfad
        aller(v.vers);
      }
    };
    aller(n.name);
    const hors = [...vus].filter((x) => x !== n.name && !/^(Sitzung|Ablehnung \(Sitzung\)|Antworten \(Sitzung\))/.test(x));
    assert.deepEqual(hors, [], `${f}: ${chemin} erreicht ${hors.join(', ')} ohne Sitzung`);
    assert.ok([...vus].some((x) => /^Sitzung gültig\?/.test(x)), `${f}: ${chemin} ohne Sitzungsprüfung`);
    // der Einstiegspunkt ist nur mit der Prüfung verbunden
    assert.match(voisins(wf, n.name)[0].vers, /^Sitzung \(Token\)/);
  }
});
test('die Sitzungsprüfung liest die Datenbank: gehashter Token, nicht abgelaufene Sitzung, aktives Konto', () => {
  const wf = workflow('72-maitre-valider.json');
  const q = wf.nodes.find((x) => x.name === 'Sitzung (Datenbank)').parameters.query;
  assert.match(q, /s\.jeton_hash = \$1/);
  assert.match(q, /s\.expire_le > now\(\)/);
  assert.match(q, /g\.actif/);
});
const jeton = jsCode('72-maitre-valider.json', 'Sitzung (Token)');
test('Token: nur „Bearer“ + 43 sichere Zeichen werden akzeptiert, und nur der SHA-256-Fingerabdruck wird weitergegeben', () => {
  const j = randomBytes(32).toString('base64url');
  assert.equal(j.length, 43);
  const attendu = createHash('sha256').update(j).digest('hex');
  assert.equal(lancer(jeton, { entree: { headers: { authorization: `Bearer ${j}` } } })[0].hash, attendu);
  for (const faux of [undefined, '', 'Bearer ', `Bearer ${j}x`, `Bearer ${j.slice(1)}`, `Basic ${j}`, `bearer ${j}`, `Bearer ${j.slice(1)}'; DROP TABLE soins.sessions;--`, `Bearer ${j}\nBearer ${j}`]) {
    assert.equal(lancer(jeton, { entree: { headers: { authorization: faux } } })[0].hash, '', JSON.stringify(faux));
  }
  assert.equal(lancer(jeton, { entree: {} })[0].hash, '');
});
test('Sitzungsergebnis: ohne Zeile -> Ablehnung; mit einer Zeile -> die Pflegekraft, nie die PIN', () => {
  const res = jsCode('72-maitre-valider.json', 'Sitzung');
  assert.deepEqual(lancer(res, { entree: {} })[0], { ok: false });
  const ok = lancer(res, { entree: { identifiant: 'martin', nom: 'Frau Martin', jeton_hash: 'abc' } })[0];
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.soignant, { identifiant: 'martin', nom: 'Frau Martin' });
  assert.doesNotMatch(JSON.stringify(ok), /pin/i);
});
test('Sitzungsablehnung: keine Daten, nur der Grund', () => {
  assert.deepEqual(lancer(jsCode('72-maitre-valider.json', 'Ablehnung (Sitzung)'))[0], { erreur: 'session' });
  // Workflows, die mit „Auf Webhook antworten“ antworten, haben ihre eigene Ablehnungsantwort
  for (const f of ['74-maitre-etage.json', '77-maitre-verifier.json']) assert.ok(workflow(f).nodes.some((x) => x.name === 'Antworten (Sitzung)'), f);
});

// ---------------------------------------------------------------- Anmeldung: gehashte PIN, gesperrte Konten, gleiche Ablehnungen
const connexion = workflow('88-connexion.json');
const hache = (pin) => {
  const sel = randomBytes(16);
  return `scrypt$${sel.toString('hex')}$${scryptSync(pin, sel, 32).toString('hex')}`;
};
const verifier = (pin, soignant, forme = true) =>
  lancer(jsCode('88-connexion.json', 'PIN überprüfen'), { entree: soignant, noeuds: { 'Anmeldung prüfen': [{ identifiant: 'martin', pin, forme }] } })[0];
const compte = { identifiant: 'martin', nom: 'Frau Martin', pin_hash: hache('482913'), actif: true, verrouille: false };

test('Anmeldung: die Form von Kennung und PIN wird geprüft', () => {
  const c = jsCode('88-connexion.json', 'Anmeldung prüfen');
  const lire = (body) => lancer(c, { entree: { body } })[0];
  assert.deepEqual(lire({ identifiant: ' Martin ', pin: '482913' }), { identifiant: 'martin', pin: '482913', forme: true });
  for (const faux of [{}, { identifiant: 'martin' }, { identifiant: 'martin', pin: '12' }, { identifiant: 'martin', pin: '123456789' }, { identifiant: 'martin', pin: 'abcdef' }, { identifiant: "x'; DROP TABLE soins.soignants;--", pin: '123456' }, { identifiant: 'a', pin: '123456' }, { identifiant: 'martin', pin: ['1', '2', '3', '4'] }]) {
    assert.equal(lire(faux).forme, false, JSON.stringify(faux));
  }
  assert.equal(lire({ identifiant: "x'; DROP", pin: '123456' }).pin, '', 'eine PIN mit ungültiger Form wird nicht aufbewahrt');
});
test('PIN: mit dem scrypt-Fingerabdruck verglichen, richtige PIN akzeptiert, falsche abgelehnt', () => {
  const ok = verifier('482913', compte);
  assert.equal(ok.autorise, true);
  assert.equal(ok.motif, 'ok');
  assert.equal(ok.nom, 'Frau Martin');
  assert.equal(verifier('482914', compte).autorise, false);
  assert.equal(verifier('482914', compte).motif, 'identifiants');
});
test('PIN: ein unbekanntes, deaktiviertes Konto oder eines ohne Fingerabdruck wird wie eine falsche PIN abgelehnt (nichts verrät, ob das Konto existiert)', () => {
  const inconnu = verifier('482913', {});
  const inactif = verifier('482913', { ...compte, actif: false });
  const sans = verifier('482913', { ...compte, pin_hash: null });
  for (const r of [inconnu, inactif, sans]) {
    assert.equal(r.autorise, false);
    assert.equal(r.motif, 'identifiants');
    assert.equal(r.nom, null);
  }
});
test('Sperre: 5 Fehlversuche -> selbst die RICHTIGE PIN wird während der Frist abgelehnt; die ungültige Form wird ebenfalls abgelehnt', () => {
  const v = verifier('482913', { ...compte, verrouille: true });
  assert.equal(v.autorise, false);
  assert.equal(v.motif, 'verrouille');
  assert.equal(verifier('482913', compte, false).motif, 'format');
  const q = connexion.nodes.find((x) => x.name === 'Pflegekraft').parameters.query;
  assert.match(q, /count\(\*\)[\s\S]*interval '5 minutes'\) >= 5 AS verrouille/);
  assert.match(connexion.nodes.find((x) => x.name === "Fehlschlag vermerken").parameters.query, /EXISTS \(SELECT 1 FROM soins\.soignants/);
});
test('die Ablehnung der Anmeldung ist für ein unbekanntes Konto und eine falsche PIN identisch; nur die Sperre wird gemeldet', () => {
  const refus = (motif) => lancer(jsCode('88-connexion.json', 'Anmeldung abgelehnt'), { entree: {}, noeuds: { 'PIN überprüfen': [{ motif }] } })[0];
  assert.deepEqual(refus('identifiants'), { erreur: 'identifiants' });
  assert.deepEqual(refus('format'), { erreur: 'identifiants' });
  assert.deepEqual(refus('verrouille'), { erreur: 'verrouille' });
});
test('Sitzungstoken: 32 zufällige Bytes, nie dasselbe, nur der Fingerabdruck kommt in die Datenbank, Dauer 12 Stunden', () => {
  const creer = () => lancer(jsCode('88-connexion.json', 'Token erstellen'), { entree: {}, noeuds: { 'PIN überprüfen': [{ identifiant: 'martin', nom: 'Frau Martin' }] } })[0];
  const a = creer();
  const b = creer();
  assert.match(a.jeton, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.jeton, b.jeton);
  assert.equal(a.hash, createHash('sha256').update(a.jeton).digest('hex'));
  assert.doesNotMatch(connexion.nodes.find((x) => x.name === 'Sitzung öffnen').parameters.query, /jeton[^_]/, 'der Token im Klartext wird nicht in die Datenbank geschrieben');
  assert.match(readFileSync(join(racine, 'data', 'sql', '01_schema.sql'), 'utf8'), /expire_le\s+timestamptz NOT NULL DEFAULT now\(\) \+ interval '12 hours'/);
  const rep = lancer(jsCode('88-connexion.json', 'Antwort Anmeldung'), { entree: { expire_le: 'morgen' }, noeuds: { 'Token erstellen': [a] } })[0];
  assert.deepEqual(Object.keys(rep).sort(), ['expire_le', 'jeton', 'soignant']);
  assert.equal(rep.hash, undefined, 'der Fingerabdruck wird nicht zurückgegeben');
});
test('SICHERHEIT: die PIN wird nirgends gespeichert (weder in der Datenbank noch im Protokoll noch in einer Antwort)', () => {
  const schema = readFileSync(join(racine, 'data', 'sql', '01_schema.sql'), 'utf8');
  assert.match(schema, /pin_hash\s+text NOT NULL/);
  assert.doesNotMatch(schema, /\bpin\s+text/i);
  for (const n of connexion.nodes.filter((x) => x.type === 'n8n-nodes-base.postgres')) assert.doesNotMatch(n.parameters.query, /\bpin\b(?!_hash)/i, n.name);
  // die anderen Code-Knoten lesen die PIN nicht (genannte Knotennamen und Kommentare werden ignoriert)
  for (const x of connexion.nodes.filter((y) => !['Anmeldung prüfen', 'PIN überprüfen'].includes(y.name) && y.type.endsWith('code'))) {
    assert.doesNotMatch(x.parameters.jsCode.replace(/\/\/.*$/gm, '').replace(/\$\('[^']*'\)/g, ''), /\bpin\b(?!_hash)/i, x.name);
  }
});

// ---------------------------------------------------------------- der Name der Pflegekraft stammt aus der Sitzung, nie aus der Anfrage
test('SIGNATUR: valide_par und soignant_id stammen aus der Sitzung; der Anfragekörper kann sie nicht vorgeben', () => {
  const session = { 'Sitzung': [{ soignant: { identifiant: 'martin', nom: 'Frau Martin' } }] };
  const piege = { valide_par: 'Dr. Jemand Anderes', soignant_id: 'keller' };
  const un = lancer(jsCode('72-maitre-valider.json', 'Inhalt der Bestätigung'), { entree: { body: { brouillon_id: 'b1', texte: 'T', ...piege } }, noeuds: session })[0];
  assert.equal(un.valide_par, 'Frau Martin');
  assert.equal(un.soignant_id, 'martin');
  const lot = lancer(jsCode('73-maitre-valider-lot.json', 'Inhalt des Stapels'), { entree: { body: { etage: 1, rapports: [{ brouillon_id: 'b1', texte: 'T', ...piege }, { brouillon_id: 'b2', texte: 'U' }] } }, noeuds: session });
  assert.deepEqual(lot.map((x) => [x.valide_par, x.soignant_id]), [['Frau Martin', 'martin'], ['Frau Martin', 'martin']]);
  // kein Einstiegspunkt akzeptiert valide_par oder soignant_id aus der Anfrage („r.valide_par“ der Übergabenachricht wird aus der Datenbank gelesen)
  for (const { f, wf } of tous) for (const n of wf.nodes.filter((x) => x.type.endsWith('.code'))) assert.doesNotMatch(n.parameters.jsCode, /body\??\.valide_par|\bb\.valide_par|\bb\.soignant_id|body\??\.soignant_id/, `${f} : ${n.name}`);
});
test('SIGNATUR: die Pflegekraft wird mit der Bestätigung und im Prüfprotokoll gespeichert', () => {
  const enreg = workflow('63-brique-enregistrer.json');
  const q = enreg.nodes.find((x) => x.name === 'Entwurf bestätigen');
  assert.match(q.parameters.query, /valide_par, soignant_id, brouillon_id/);
  assert.match(q.parameters.query, /NULLIF\(\$4::text, ''\)/);
  assert.match(String(q.parameters.options?.queryReplacement ?? q.parameters.queryReplacement ?? JSON.stringify(q.parameters)), /soignant_id/);
  const ctrl = lancer(jsCode('63-brique-enregistrer.json', 'Bestätigung prüfen'), { entree: { brouillon_id: 'a1c3e000-0001-4000-8000-000000000001', texte: 'T', valide_par: 'Frau Martin', soignant_id: 'martin' } })[0];
  assert.equal(ctrl.soignant_id, 'martin');
  const res = lancer(jsCode('63-brique-enregistrer.json', 'Ergebnis der Bestätigung'), { entree: {}, noeuds: { 'Bestätigung prüfen': [ctrl], 'Entwurf bestätigen': [{ validation_id: 7, patient_id: 'PAT-001', mode: 'a', action: 'generer_sbar', modifiee: false }] } })[0];
  assert.equal(res.evenement_journal.details.soignant_id, 'martin');
  assert.equal(res.evenement_journal.details.valide_par, 'Frau Martin');
});
test('„Wer bin ich“ und Abmeldung: die Sitzung schließt den Token der Anfrage, und nur diesen', () => {
  const moi = workflow('89-session.json');
  assert.match(moi.nodes.find((x) => x.name === 'Sitzung schließen').parameters.query, /DELETE FROM soins\.sessions WHERE jeton_hash = \$1/);
  const rep = lancer(jsCode('89-session.json', 'Antwort Ich'), { entree: {}, noeuds: { Sitzung: [{ soignant: { identifiant: 'martin', nom: 'Frau Martin' }, jeton_hash: 'h' }] } })[0];
  assert.deepEqual(rep, { soignant: { identifiant: 'martin', nom: 'Frau Martin' } });
});

// ---------------------------------------------------------------- der interne Aufruf der Post
test('der Workflow der Post ruft den INTERNEN Pfad mit dem internen Schlüssel auf (nicht die öffentliche Oberfläche)', () => {
  const v = workflow('85-brique-courrier.json').nodes.find((x) => x.name === 'Post überprüfen');
  assert.match(v.parameters.url, /aicare-verifier-interne$/);
  assert.equal(v.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(v.credentials.httpHeaderAuth.name, 'AI-Care clé interne');
  const w = workflow('77-maitre-verifier.json');
  assert.deepEqual(voisins(w, 'Webhook (intern)').map((x) => x.vers), ['Anfrage prüfen']);
});

// ---------------------------------------------------------------- die Oberfläche
test('Oberfläche: Schlüssel und Token gehen in den Headern mit, die PIN wird nie aufbewahrt, eine verlorene Sitzung führt zur Anmeldung zurück', () => {
  const api = readFileSync(join(racine, 'front', 'src', 'api.js'), 'utf8');
  assert.match(api, /'X-AICare-Cle': CLE/);
  assert.match(api, /Authorization: `Bearer \$\{jeton\}`/);
  assert.match(api, /json\?\.erreur === 'session'/);
  assert.match(api, /sessionStorage/);
  assert.doesNotMatch(api, /localStorage/);
  assert.doesNotMatch(api, /(setItem|memoriserJeton)\([^)]*pin/i);
  const front = readdirSync(join(racine, 'front', 'src'), { recursive: true }).filter((f) => /\.(jsx?|json)$/.test(f)).map((f) => readFileSync(join(racine, 'front', 'src', f), 'utf8')).join('\n');
  assert.doesNotMatch(front, /AICARE_CLE_INTERNE|CLE_INTERNE/, 'der interne Schlüssel steht nie in der Oberfläche');
});

// ---------------------------------------------------------------- kein Geheimnis im Repository
test('GEHEIMNISSE: kein Schlüssel, kein Passwort aus .env erscheint in einer Datei des Repositorys', () => {
  const envFichier = join(racine, '.env');
  assert.ok(existsSync(envFichier), '.env fehlt');
  const env = readFileSync(envFichier, 'utf8');
  const secrets = [...env.matchAll(/^(AICARE_CLE_WEBHOOK|AICARE_CLE_INTERNE|VITE_N8N_CLE|MQTT_MOT_DE_PASSE_\w+|TTN_CLE_API|POSTGRES_PASSWORD)=(.{8,})$/gm)].map((m) => m[2].trim()).filter((v) => v !== 'TA-CLE');
  assert.ok(secrets.length >= 6);
  const git = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: racine, encoding: 'utf8' });
  assert.equal(git.status, 0, 'git ls-files ist fehlgeschlagen');
  // bewusste Ausnahme des PROTOTYPS: .env.prototype liefert absichtlich Test-Schlüssel und -PINs mit (siehe docs/securite.md); vor jedem echten Einsatz löschen
  const fichiers = git.stdout.split('\n').filter((f) => f && f !== '.env.prototype' && !/\.(pdf|png|jpe?g|ico|woff2?)$/i.test(f) && existsSync(join(racine, f)));
  assert.ok(fichiers.length > 100);
  for (const f of fichiers) {
    const contenu = readFileSync(join(racine, f), 'utf8');
    for (const s of secrets) assert.ok(!contenu.includes(s), `ein Geheimnis aus .env erscheint in ${f}`);
    assert.doesNotMatch(contenu, /NNSXS\.[A-Z0-9]{20,}/, `ein TTN-Schlüssel erscheint in ${f}`);
  }
  assert.match(readFileSync(join(racine, '.gitignore'), 'utf8'), /^\.env$/m);
  assert.match(readFileSync(join(racine, '.gitignore'), 'utf8'), /mosquitto\/passwd/);
  const exemple = readFileSync(join(racine, '.env.exemple'), 'utf8');
  for (const cle of ['AICARE_CLE_WEBHOOK', 'AICARE_CLE_INTERNE', 'VITE_N8N_CLE', 'TTN_CLE_API', 'DEMO_PIN_MARTIN', 'MQTT_MOT_DE_PASSE_N8N']) assert.match(exemple, new RegExp(`^${cle}=TA-CLE$`, 'm'), cle);
});

console.log(`\n${nb} Tests bestanden.`);
