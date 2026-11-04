// Installiert AI-Care Assistant auf einem neuen Rechner, Schritt für Schritt, und prüft ihn.
// Wiederholbar: Jeder Schritt prüft zuerst, ob er bereits erledigt ist. Es wird kein Geheimnis angezeigt.
//
// Aufruf: node scripts/installer.mjs                   vollständige Installation (etwa 30 bis 45 Minuten)
//                                                      OHNE JEDE FRAGE: .env.prototype wird nach .env kopiert, fehlende Ollama-Modelle werden geladen
//                                                      (llama3.2 2,0 GB, nomic-embed-text 0,3 GB, qwen2.5:7b 4,7 GB)
//         node scripts/installer.mjs --sans-pilote     ohne qwen2.5:7b (Agent „Rentenbeiträge“; spart 4,7 GB)
//         node scripts/installer.mjs --sans-modeles    lädt nichts herunter: hält an und listet die fehlenden Modelle auf
//         node scripts/installer.mjs --sans-epa        ohne die ePA-Mocks von gematik (spart ~1,5 GB Speicher, 5 Min.)
//         node scripts/installer.mjs --depuis=6        setzt bei Schritt 6 fort (--jusqua=2: hält nach Schritt 2 an)
//         node scripts/installer.mjs --verifier        ändert nichts: prüft die Dienste und startet die Tests ohne KI
//         node scripts/installer.mjs --verifier --demo fügt die Schnelldemonstration hinzu (weniger als 5 Minuten)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { totalmem, freemem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = join(racine, 'compose');
const args = process.argv.slice(2);
const option = (nom) => args.includes(`--${nom}`);
const depuis = Number(args.find((a) => a.startsWith('--depuis='))?.split('=')[1] ?? 1);
const win = process.platform === 'win32';

const N8N = 'http://localhost:5679';
const QDRANT = 'http://localhost:6335';
const OLLAMA = 'http://localhost:11434';
const MODELES = [
  { nom: 'llama3.2', role: 'Textverfassen (erforderlich)', taille: '2,0 GB', requis: true },
  { nom: 'nomic-embed-text', role: 'RAG-Suche (erforderlich)', taille: '0,3 GB', requis: true },
  { nom: 'qwen2.5:7b', role: 'Agent Rentenbeiträge (optional)', taille: '4,7 GB', requis: false },
];

let avertissements = 0;
const titre = (n, t) => console.log(`\n=== Schritt ${n}: ${t} ===`);
const ok = (m) => console.log(`  OK    ${m}`);
const info = (m) => console.log(`        ${m}`);
const alerte = (m) => { avertissements++; console.log(`  ACHTUNG  ${m}`); };
function arreter(message, aide) {
  console.error(`\n  ABBRUCH  ${message}`);
  if (aide) console.error(`         ${aide.split('\n').join('\n         ')}`);
  console.error(`\n  Nach der Korrektur dort fortsetzen, wo es angehalten hat: node scripts/installer.mjs --depuis=<Nummer des Schritts>`);
  process.exit(1);
}
const lancer = (cmd, params, opts = {}) =>
  spawnSync(cmd, params, { cwd: racine, stdio: 'inherit', shell: win && /^(npm|npx)$/.test(cmd), ...opts });
const capturer = (cmd, params, opts = {}) =>
  spawnSync(cmd, params, { cwd: racine, encoding: 'utf8', shell: win && /^(npm|npx)$/.test(cmd), ...opts });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(url, ms = 4000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return { ok: r.ok, statut: r.status, texte: await r.text() };
  } catch { return { ok: false, statut: 0, texte: '' }; }
}
async function attendre(url, minutes, libelle) {
  const fin = Date.now() + minutes * 60000;
  while (Date.now() < fin) {
    if ((await http(url)).ok) return true;
    await dormir(5000);
  }
  return false;
}
const lireEnv = () => {
  if (!existsSync(join(racine, '.env'))) return {};
  return Object.fromEntries(readFileSync(join(racine, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
};
async function modelesPresents() {
  const r = await http(`${OLLAMA}/api/tags`);
  if (!r.ok) return null;
  return JSON.parse(r.texte).models.map((m) => m.name);
}
const aLeModele = (liste, nom) => liste.some((n) => n === nom || n === `${nom}:latest`);

// ------------------------------------------------------------------ Schritte
async function etape1_prerequis() {
  titre(1, 'Voraussetzungen des Rechners');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) arreter(`Node.js ${process.versions.node} ist zu alt.`, 'Node.js 20 oder neuer (LTS-Version) installieren: https://nodejs.org');
  ok(`Node.js ${process.versions.node}`);
  const d = capturer('docker', ['compose', 'version']);
  if (d.error || d.status !== 0) arreter('Docker Compose wurde nicht gefunden.', 'Docker Desktop (Windows, Mac) oder Docker Engine + das Compose-Plugin (Linux) installieren und dann starten.');
  ok(d.stdout.trim());
  const m = capturer('docker', ['info', '--format', '{{.MemTotal}}']);
  if (m.status !== 0) arreter('Docker ist installiert, antwortet aber nicht.', 'Docker Desktop starten, warten, bis der Wal stabil ist, und dann erneut starten.');
  const memDocker = Number(m.stdout.trim()) / 2 ** 30;
  ok(`Docker antwortet (${memDocker.toFixed(1)} GB Speicher für die Container)`);
  if (memDocker < 7) alerte(`Docker sieht nur ${memDocker.toFixed(1)} GB: n8n, PostgreSQL und Qdrant könnten beendet werden. Unter Windows siehe docs/INSTALLATION.md (Datei .wslconfig).`);
  const ram = totalmem() / 2 ** 30;
  ok(`Arbeitsspeicher des Rechners: ${ram.toFixed(1)} GB (${(freemem() / 2 ** 30).toFixed(1)} GB frei)`);
  if (ram < 12) alerte('Weniger als 12 GB: möglich, aber die komplette Testbatterie und der Agent Rentenbeiträge (Modell mit 5 GB) werden sehr langsam sein. Andere Programme schließen.');
  if (existsSync(join(racine, 'compose', 'ocr', 'Dockerfile')) === false) arreter('Der Ordner compose/ocr ist unvollständig: Das Repository wurde nicht vollständig geklont.');
  const g = capturer('git', ['--version']);
  if (g.status !== 0) alerte('Git wurde nicht gefunden: nur zum Herunterladen der ePA-Mocks (Schritt 3) erforderlich.');
}

async function etape2_secrets() {
  titre(2, 'Datei .env und Geheimnisse');
  if (!existsSync(join(racine, '.env'))) {
    // Prototyp: eine gebrauchsfertige .env (Schlüssel, Passwörter und PINs NUR ZUM TESTEN) liegt im Repository; sonst wird alles erzeugt
    const prototyp = existsSync(join(racine, '.env.prototype'));
    copyFileSync(join(racine, prototyp ? '.env.prototype' : '.env.exemple'), join(racine, '.env'));
    ok(prototyp ? '.env aus .env.prototype erstellt (Test-Schlüssel und -PINs mitgeliefert, nichts einzugeben)' : '.env aus .env.exemple erstellt (Geheimnisse werden unten erzeugt)');
  } else ok('.env existiert bereits (beibehalten)');
  const r = lancer('node', ['scripts/generer-secrets.mjs']);
  if (r.status !== 0) arreter('Die Erzeugung der Geheimnisse ist fehlgeschlagen.', 'Docker muss laufen (die MQTT-Passwortdatei wird in einem Container erstellt).');
  const env = lireEnv();
  const manque = Object.entries(env).filter(([c, v]) => v === 'TA-CLE' && !c.startsWith('TTN_'));
  if (manque.length) arreter(`Werte in .env stehen noch auf TA-CLE: ${manque.map(([c]) => c).join(', ')}`, 'Von Hand ersetzen oder .env löschen und Schritt 2 erneut starten.');
  ok('alle Geheimnisse sind erstellt (TTN_* bleibt leer: Die TTN-Brücke ist optional)');
  info('Die PIN-Codes der Demokonten stehen in .env (Zeilen DEMO_PIN_*). Sie werden hier nicht angezeigt.');
}

async function etape3_docker() {
  titre(3, 'Docker-Dienste (PostgreSQL, n8n, Qdrant, MQTT, Mailpit, HAPI FHIR, OCR)');
  info('Erster Start: Download der Images (etwa 3 GB) und Aufbau des OCR-Dienstes.');
  let r = lancer('docker', ['compose', 'up', '-d', '--build'], { cwd: compose });
  if (r.status !== 0) arreter('docker compose up ist fehlgeschlagen.', 'Die obige Meldung lesen. Häufige Ursache: ein bereits belegter Port (5679, 6335, 1884, 8025, 1025, 8090, 8009).');
  info('Warten auf n8n (bis zu 4 Minuten)…');
  if (!(await attendre(`${N8N}/healthz`, 4))) arreter('n8n antwortet nicht unter http://localhost:5679.', 'Siehe: cd compose && docker compose logs n8n --tail 50');
  ok('n8n antwortet');
  if (!(await attendre(`${QDRANT}/collections`, 1))) arreter('Qdrant antwortet nicht unter http://localhost:6335.');
  ok('Qdrant antwortet');
  info('Warten auf HAPI FHIR (bis zu 4 Minuten)…');
  if (!(await attendre('http://localhost:8090/fhir/metadata', 4))) arreter('HAPI FHIR antwortet nicht unter http://localhost:8090.', 'Langsamer erster Start: in 2 Minuten mit --depuis=3 erneut versuchen.');
  ok('HAPI FHIR antwortet');

  if (option('sans-epa')) { info('ePA-Mocks übersprungen (--sans-epa): Die Quelle „ePA“ von test-du-soir wird fehlschlagen.'); return; }
  const dossier = join(compose, 'epa-deployment');
  if (!existsSync(join(dossier, 'dc-mocks.yml'))) {
    info('Download der ePA-Mocks von gematik (öffentliches Repository, einige MB)…');
    const c = lancer('git', ['clone', '--depth', '1', 'https://github.com/gematik/epa-deployment', 'epa-deployment'], { cwd: compose });
    if (c.status !== 0) arreter('Das Klonen von gematik/epa-deployment ist fehlgeschlagen.', 'Das Archiv https://codeload.github.com/gematik/epa-deployment/zip/refs/heads/main herunterladen\nund in compose/epa-deployment/ entpacken (die Datei dc-mocks.yml muss dort liegen), dann --depuis=3.\nOder mit --sans-epa neu starten.');
  }
  r = lancer('docker', ['compose', '-f', 'epa-deployment/dc-mocks.yml', '-f', 'epa-mocks.override.yml', 'up', '-d', 'medication-service', 'medication-render-service', 'information-service'], { cwd: compose });
  if (r.status !== 0) arreter('Der Start der ePA-Mocks ist fehlgeschlagen.');
  info('Warten auf den ePA-Medikationsdienst (etwa 5 Minuten, bis zu 10)…');
  if (!(await attendre('http://localhost:8084/fhir/metadata', 10))) arreter('Der ePA-Medikationsdienst antwortet nicht unter http://localhost:8084.', 'Siehe: docker logs medication-service --tail 50. Oder mit --sans-epa neu starten.');
  ok('ePA-Mocks bereit');
}

async function etape4_modeles() {
  titre(4, 'Ollama-Modelle');
  let liste = await modelesPresents();
  if (liste === null) {
    arreter('Ollama antwortet nicht unter http://localhost:11434.', 'Ollama installieren (https://ollama.com/download) und starten.\nLinux: mit OLLAMA_HOST=0.0.0.0 starten, damit die Container es aufrufen können.\nDann mit --depuis=4 neu starten.');
  }
  ok(`Ollama antwortet (${liste.length} Modell(e): ${liste.join(', ') || 'keine'})`);
  // ohne Frage: fehlende Modelle werden automatisch geladen (offizielles Ollama-Register); --sans-modeles / --sans-pilote zum Verzichten
  const voulus = MODELES.filter((m) => m.requis || !option('sans-pilote'));
  const manquants = voulus.filter((m) => !aLeModele(liste, m.nom));
  if (manquants.length && option('sans-modeles')) {
    arreter(`Fehlende(s) Modell(e): ${manquants.map((m) => `${m.nom} (${m.taille})`).join(', ')}.`, 'Von Hand herunterladen:\n' + manquants.map((m) => `ollama pull ${m.nom}`).join('\n'));
  }
  for (const m of manquants) {
    info(`Download von ${m.nom} (${m.taille}, aus der offiziellen Ollama-Registry)…`);
    const r = lancer('ollama', ['pull', m.nom]);
    if (r.status !== 0) arreter(`ollama pull ${m.nom} ist fehlgeschlagen.`, 'Der Befehl „ollama“ muss im Terminal verfügbar sein. Andernfalls aus der Ollama-Anwendung heraus starten.');
  }
  liste = (await modelesPresents()) ?? [];
  for (const m of MODELES) {
    if (aLeModele(liste, m.nom)) ok(`${m.nom} vorhanden — ${m.role}`);
    else if (m.requis) arreter(`${m.nom} fehlt weiterhin.`);
    else alerte(`${m.nom} fehlt — ${m.role}. Die Seite Rentenbeiträge weicht auf ein anderes Modell aus oder lehnt den Start des Agenten ab.`);
  }
}

async function etape5_donnees() {
  titre(5, 'Fiktive Daten und Qdrant-Collections');
  const d = join(racine, 'data');
  let r = lancer('npm', ['install', '--no-audit', '--no-fund'], { cwd: d });
  if (r.status !== 0) arreter('npm install (data/) ist fehlgeschlagen.');
  const tout = option('sans-epa') ? ['run', 'generer'] : ['run', 'tout'];
  if (option('sans-epa')) {
    for (const s of ['generer', 'postgres', 'fhir', 'kim']) {
      r = lancer('npm', ['run', s], { cwd: d });
      if (r.status !== 0) arreter(`npm run ${s} (data/) ist fehlgeschlagen.`);
    }
  } else {
    r = lancer('npm', tout, { cwd: d });
    if (r.status !== 0) arreter('npm run tout (data/) ist fehlgeschlagen.', 'Wenn nur der Teil „epa“ fehlgeschlagen ist, sind die ePA-Mocks nicht bereit: --depuis=3.');
  }
  r = lancer('npm', ['run', 'qdrant'], { cwd: d });
  if (r.status !== 0) arreter('Erstellung der Qdrant-Collections fehlgeschlagen.');
  ok('PostgreSQL, HAPI FHIR, KIM-Postfach, ePA und Qdrant-Collections geladen');
}

async function etape6_workflows() {
  titre(6, 'n8n-Workflows (etwa 15 Minuten, n8n startet am Ende neu)');
  const r = lancer('node', ['workflows/importer.mjs']);
  if (r.status !== 0) arreter('Der Import der Workflows ist fehlgeschlagen.', 'Die obige Meldung lesen. Der Import ist wiederholbar: --depuis=6.');
  info('Warten auf den Neustart von n8n…');
  if (!(await attendre(`${N8N}/healthz`, 4))) arreter('n8n antwortet nach dem Import nicht mehr.', 'cd compose && docker compose logs n8n --tail 50');
  ok('Workflows importiert und veröffentlicht');
}

async function etape7_comptes() {
  titre(7, 'Konten der Pflegekräfte und Oberfläche');
  let r = lancer('node', ['scripts/creer-soignants.mjs']);
  if (r.status !== 0) arreter('Die Erstellung der Konten ist fehlgeschlagen.');
  r = lancer('npm', ['install', '--no-audit', '--no-fund'], { cwd: join(racine, 'front') });
  if (r.status !== 0) arreter('npm install (front/) ist fehlgeschlagen.');
  const f = join(racine, '.env');
  const t = readFileSync(f, 'utf8');
  if (/^VITE_MOCK=true/m.test(t)) {
    writeFileSync(f, t.replace(/^VITE_MOCK=true/m, 'VITE_MOCK=false'), 'utf8');
    ok('VITE_MOCK=false: Die Oberfläche spricht mit n8n');
  } else ok('VITE_MOCK steht bereits auf false');
}

async function etape8_rag() {
  titre(8, 'Erste Indexierung des RAG (sonst müsste man bis 06:00 warten)');
  const r = lancer('node', ['tests/test-du-soir.mjs', '1']);
  if (r.status !== 0) arreter('Die Indexierung oder ihre Prüfung ist fehlgeschlagen.', option('sans-epa') ? 'Mit --sans-epa ist das Fehlschlagen der Quelle „ePA“ zu erwarten.' : 'Prüfen, ob nomic-embed-text vorhanden ist (Schritt 4).');
  ok('RAG indexiert');
}

// ------------------------------------------------------------------ Prüfung (ohne etwas zu ändern)
async function verifier() {
  console.log('\n=== Prüfung: Dienste ===');
  let echecs = 0;
  const test = (cond, msg) => { console.log(`  ${cond ? 'OK   ' : 'FEHLER'} ${msg}`); if (!cond) echecs++; };
  test((await http(`${N8N}/healthz`)).ok, 'n8n antwortet (5679)');
  test((await http(`${QDRANT}/collections`)).ok, 'Qdrant antwortet (6335)');
  test((await http('http://localhost:8090/fhir/metadata')).ok, 'HAPI FHIR antwortet (8090)');
  test((await http('http://localhost:8025/api/v1/info')).ok, 'Mailpit antwortet (8025)');
  if (!option('sans-epa')) test((await http('http://localhost:8084/fhir/metadata')).ok, 'ePA-Medikation antwortet (8084)');
  const liste = await modelesPresents();
  test(liste !== null, 'Ollama antwortet (11434)');
  if (liste) for (const m of MODELES.filter((x) => x.requis)) test(aLeModele(liste, m.nom), `Modell ${m.nom} vorhanden`);
  const col = await http(`${QDRANT}/collections`);
  if (col.ok) {
    const noms = JSON.parse(col.texte).result.collections.map((c) => c.name);
    for (const c of ['patients', 'connaissances', 'a_verifier']) test(noms.includes(c), `Qdrant-Collection „${c}“`);
  }
  const nb = capturer('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM soins.soignants"'], { cwd: compose });
  test(nb.status === 0 && Number(nb.stdout.trim()) >= 4, 'Konten der Pflegekräfte erstellt (PostgreSQL)');
  // Anmeldung mit falscher PIN: Der Webhook muss existieren (nicht 404) und sauber ablehnen (nicht 500)
  const dem = await fetch(`${N8N}/webhook/aicare-connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': lireEnv().AICARE_CLE_WEBHOOK ?? '' }, body: JSON.stringify({ identifiant: 'inconnu', pin: '000000' }), signal: AbortSignal.timeout(8000) }).catch(() => null);
  test(dem !== null && dem.status !== 404 && dem.status < 500, 'die n8n-Webhooks sind veröffentlicht (Anmeldung)');

  console.log('\n=== Prüfung: Tests ohne KI (sofort) ===');
  const tests = readdirSync(join(racine, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();
  for (const t of tests) {
    const r = capturer('node', [join('tests', t)], { timeout: 300000 });
    test(r.status === 0, `tests/${t}`);
    if (r.status !== 0) console.log((r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
  }
  if (option('demo')) {
    console.log('\n=== Prüfung: Schnelldemonstration (ohne Llama) ===');
    const r = lancer('node', ['scripts/demo-nuit.mjs', '--rapide']);
    test(r.status === 0, 'scripts/demo-nuit.mjs --rapide');
  }
  console.log(echecs ? `\n${echecs} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen sind grün.');
  return echecs;
}

// ------------------------------------------------------------------ Programm
if (option('verifier')) process.exit((await verifier()) ? 1 : 0);

const etapes = [etape1_prerequis, etape2_secrets, etape3_docker, etape4_modeles, etape5_donnees, etape6_workflows, etape7_comptes, etape8_rag];
console.log('AI-Care Assistant — Installation (vollständig fiktive Daten)');
const jusqua = Number(args.find((a) => a.startsWith('--jusqua='))?.split('=')[1] ?? etapes.length);
for (let i = depuis - 1; i < Math.min(jusqua, etapes.length); i++) await etapes[i]();
if (jusqua < etapes.length) { console.log(`\nGewollter Halt nach Schritt ${jusqua} (--jusqua).`); process.exit(0); }

const echecs = await verifier();
console.log(`
Installation abgeschlossen${avertissements ? ` (${avertissements} Warnung(en) oben)` : ''}${echecs ? ', aber Prüfungen schlagen fehl' : ''}.

Um die Oberfläche zu öffnen:
  cd front
  npm run dev
dann http://localhost:5173 — Kennungen: martin, keller, roth oder arsene; PIN in .env (DEMO_PIN_*).

Für die längeren Tests siehe docs/INSTALLATION.md (Demonstration, Batterie mit 30 Fragen, Beiträge).`);
process.exit(echecs ? 1 : 0);
