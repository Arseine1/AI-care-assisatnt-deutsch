// Installe AI-Care Assistant sur un poste neuf, étape par étape, et le vérifie.
// Rejouable : chaque étape contrôle d'abord si elle est déjà faite. Aucun secret n'est affiché.
//
// Usage : node scripts/installer.mjs                   installation complète (environ 30 à 45 minutes)
//         node scripts/installer.mjs --modeles         + télécharge les modèles Ollama manquants (llama3.2 2,0 Go, nomic-embed-text 0,3 Go)
//         node scripts/installer.mjs --modeles --pilote  + qwen2.5:7b (4,7 Go), modèle de l'agent « Cotisations retraite »
//         node scripts/installer.mjs --sans-epa        sans les mocks ePA de gematik (économise ~1,5 Go de mémoire, 5 min)
//         node scripts/installer.mjs --depuis=6        reprend à l'étape 6 (--jusqua=2 : s'arrête après l'étape 2)
//         node scripts/installer.mjs --verifier        ne change rien : contrôle les services et lance les tests sans IA
//         node scripts/installer.mjs --verifier --demo ajoute la démonstration rapide (moins de 5 minutes)
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
  { nom: 'llama3.2', role: 'rédaction (obligatoire)', taille: '2,0 Go', requis: true },
  { nom: 'nomic-embed-text', role: 'recherche RAG (obligatoire)', taille: '0,3 Go', requis: true },
  { nom: 'qwen2.5:7b', role: 'agent Cotisations retraite (facultatif)', taille: '4,7 Go', requis: false },
];

let avertissements = 0;
const titre = (n, t) => console.log(`\n=== Étape ${n} : ${t} ===`);
const ok = (m) => console.log(`  OK    ${m}`);
const info = (m) => console.log(`        ${m}`);
const alerte = (m) => { avertissements++; console.log(`  ATTENTION  ${m}`); };
function arreter(message, aide) {
  console.error(`\n  ARRÊT  ${message}`);
  if (aide) console.error(`         ${aide.split('\n').join('\n         ')}`);
  console.error(`\n  Après correction, reprendre là où cela s'est arrêté : node scripts/installer.mjs --depuis=<numéro de l'étape>`);
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

// ------------------------------------------------------------------ étapes
async function etape1_prerequis() {
  titre(1, 'Prérequis du poste');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) arreter(`Node.js ${process.versions.node} est trop ancien.`, 'Installer Node.js 20 ou plus récent (version LTS) : https://nodejs.org');
  ok(`Node.js ${process.versions.node}`);
  const d = capturer('docker', ['compose', 'version']);
  if (d.error || d.status !== 0) arreter('Docker Compose est introuvable.', 'Installer Docker Desktop (Windows, Mac) ou Docker Engine + le plugin compose (Linux), puis le démarrer.');
  ok(d.stdout.trim());
  const m = capturer('docker', ['info', '--format', '{{.MemTotal}}']);
  if (m.status !== 0) arreter('Docker est installé mais ne répond pas.', 'Démarrer Docker Desktop, attendre que la baleine soit stable, puis relancer.');
  const memDocker = Number(m.stdout.trim()) / 2 ** 30;
  ok(`Docker répond (${memDocker.toFixed(1)} Go de mémoire pour les conteneurs)`);
  if (memDocker < 7) alerte(`Docker ne voit que ${memDocker.toFixed(1)} Go : n8n, PostgreSQL et Qdrant risquent d'être arrêtés. Sous Windows, voir docs/INSTALLATION.md (fichier .wslconfig).`);
  const ram = totalmem() / 2 ** 30;
  ok(`Mémoire du poste : ${ram.toFixed(1)} Go (${(freemem() / 2 ** 30).toFixed(1)} Go libres)`);
  if (ram < 12) alerte('Moins de 12 Go : possible, mais la batterie complète et l\'agent Cotisations (modèle de 5 Go) seront très lents. Fermer les autres programmes.');
  if (existsSync(join(racine, 'compose', 'ocr', 'Dockerfile')) === false) arreter('Le dossier compose/ocr est incomplet : le dépôt n\'a pas été cloné en entier.');
  const g = capturer('git', ['--version']);
  if (g.status !== 0) alerte('Git est introuvable : indispensable seulement pour télécharger les mocks ePA (étape 3).');
}

async function etape2_secrets() {
  titre(2, 'Fichier .env et secrets');
  if (!existsSync(join(racine, '.env'))) {
    copyFileSync(join(racine, '.env.exemple'), join(racine, '.env'));
    ok('.env créé depuis .env.exemple');
  } else ok('.env existe déjà (conservé)');
  const r = lancer('node', ['scripts/generer-secrets.mjs']);
  if (r.status !== 0) arreter('La génération des secrets a échoué.', 'Docker doit tourner (le fichier des mots de passe MQTT est créé dans un conteneur).');
  const env = lireEnv();
  const manque = Object.entries(env).filter(([c, v]) => v === 'TA-CLE' && !c.startsWith('TTN_'));
  if (manque.length) arreter(`Valeurs encore à TA-CLE dans .env : ${manque.map(([c]) => c).join(', ')}`, 'Les remplacer à la main, ou supprimer .env et relancer l\'étape 2.');
  ok('tous les secrets sont créés (TTN_* reste vide : le pont TTN est facultatif)');
  info('Les codes PIN des comptes de démonstration sont dans .env (lignes DEMO_PIN_*). Ils ne sont pas affichés ici.');
}

async function etape3_docker() {
  titre(3, 'Services Docker (PostgreSQL, n8n, Qdrant, MQTT, Mailpit, HAPI FHIR, OCR)');
  info('Premier démarrage : téléchargement des images (environ 3 Go) et construction du service OCR.');
  let r = lancer('docker', ['compose', 'up', '-d', '--build'], { cwd: compose });
  if (r.status !== 0) arreter('docker compose up a échoué.', 'Lire le message ci-dessus. Cause fréquente : un port déjà pris (5679, 6335, 1884, 8025, 1025, 8090, 8009).');
  info('Attente de n8n (jusqu\'à 4 minutes)…');
  if (!(await attendre(`${N8N}/healthz`, 4))) arreter('n8n ne répond pas sur http://localhost:5679.', 'Voir : cd compose && docker compose logs n8n --tail 50');
  ok('n8n répond');
  if (!(await attendre(`${QDRANT}/collections`, 1))) arreter('Qdrant ne répond pas sur http://localhost:6335.');
  ok('Qdrant répond');
  info('Attente de HAPI FHIR (jusqu\'à 4 minutes)…');
  if (!(await attendre('http://localhost:8090/fhir/metadata', 4))) arreter('HAPI FHIR ne répond pas sur http://localhost:8090.', 'Premier démarrage lent : réessayer dans 2 minutes avec --depuis=3.');
  ok('HAPI FHIR répond');

  if (option('sans-epa')) { info('Mocks ePA ignorés (--sans-epa) : la source « ePA » de test-du-soir échouera.'); return; }
  const dossier = join(compose, 'epa-deployment');
  if (!existsSync(join(dossier, 'dc-mocks.yml'))) {
    info('Téléchargement des mocks ePA de gematik (dépôt public, quelques Mo)…');
    const c = lancer('git', ['clone', '--depth', '1', 'https://github.com/gematik/epa-deployment', 'epa-deployment'], { cwd: compose });
    if (c.status !== 0) arreter('Le clonage de gematik/epa-deployment a échoué.', 'Télécharger l\'archive https://codeload.github.com/gematik/epa-deployment/zip/refs/heads/main\net l\'extraire dans compose/epa-deployment/ (le fichier dc-mocks.yml doit s\'y trouver), puis --depuis=3.\nOu relancer avec --sans-epa.');
  }
  r = lancer('docker', ['compose', '-f', 'epa-deployment/dc-mocks.yml', '-f', 'epa-mocks.override.yml', 'up', '-d', 'medication-service', 'medication-render-service', 'information-service'], { cwd: compose });
  if (r.status !== 0) arreter('Le démarrage des mocks ePA a échoué.');
  info('Attente du service de médication ePA (environ 5 minutes, jusqu\'à 10)…');
  if (!(await attendre('http://localhost:8084/fhir/metadata', 10))) arreter('Le service de médication ePA ne répond pas sur http://localhost:8084.', 'Voir : docker logs medication-service --tail 50. Ou relancer avec --sans-epa.');
  ok('mocks ePA prêts');
}

async function etape4_modeles() {
  titre(4, 'Modèles Ollama');
  let liste = await modelesPresents();
  if (liste === null) {
    arreter('Ollama ne répond pas sur http://localhost:11434.', 'Installer Ollama (https://ollama.com/download) et le démarrer.\nLinux : le lancer avec OLLAMA_HOST=0.0.0.0 pour que les conteneurs puissent l\'appeler.\nPuis relancer avec --depuis=4.');
  }
  ok(`Ollama répond (${liste.length} modèle(s) : ${liste.join(', ') || 'aucun'})`);
  const voulus = MODELES.filter((m) => m.requis || option('pilote'));
  const manquants = voulus.filter((m) => !aLeModele(liste, m.nom));
  if (manquants.length && !option('modeles')) {
    arreter(`Modèle(s) manquant(s) : ${manquants.map((m) => `${m.nom} (${m.taille})`).join(', ')}.`, 'Les télécharger : relancer avec --modeles (ajouter --pilote pour qwen2.5:7b), ou à la main :\n' + manquants.map((m) => `ollama pull ${m.nom}`).join('\n'));
  }
  for (const m of manquants) {
    info(`Téléchargement de ${m.nom} (${m.taille}, depuis le registre officiel d'Ollama)…`);
    const r = lancer('ollama', ['pull', m.nom]);
    if (r.status !== 0) arreter(`ollama pull ${m.nom} a échoué.`, 'La commande « ollama » doit être disponible dans le terminal. Sinon la lancer depuis l\'application Ollama.');
  }
  liste = (await modelesPresents()) ?? [];
  for (const m of MODELES) {
    if (aLeModele(liste, m.nom)) ok(`${m.nom} présent — ${m.role}`);
    else if (m.requis) arreter(`${m.nom} toujours absent.`);
    else alerte(`${m.nom} absent — ${m.role}. La page Cotisations retraite se rabattra sur un autre modèle ou refusera de lancer l'agent.`);
  }
}

async function etape5_donnees() {
  titre(5, 'Données fictives et collections Qdrant');
  const d = join(racine, 'data');
  let r = lancer('npm', ['install', '--no-audit', '--no-fund'], { cwd: d });
  if (r.status !== 0) arreter('npm install (data/) a échoué.');
  const tout = option('sans-epa') ? ['run', 'generer'] : ['run', 'tout'];
  if (option('sans-epa')) {
    for (const s of ['generer', 'postgres', 'fhir', 'kim']) {
      r = lancer('npm', ['run', s], { cwd: d });
      if (r.status !== 0) arreter(`npm run ${s} (data/) a échoué.`);
    }
  } else {
    r = lancer('npm', tout, { cwd: d });
    if (r.status !== 0) arreter('npm run tout (data/) a échoué.', 'Si seule la partie « epa » a échoué, les mocks ePA ne sont pas prêts : --depuis=3.');
  }
  r = lancer('npm', ['run', 'qdrant'], { cwd: d });
  if (r.status !== 0) arreter('Création des collections Qdrant échouée.');
  ok('PostgreSQL, HAPI FHIR, boîte KIM, ePA et collections Qdrant chargés');
}

async function etape6_workflows() {
  titre(6, 'Workflows n8n (environ 15 minutes, n8n redémarre à la fin)');
  const r = lancer('node', ['workflows/importer.mjs']);
  if (r.status !== 0) arreter('L\'import des workflows a échoué.', 'Lire le message ci-dessus. L\'import est rejouable : --depuis=6.');
  info('Attente du redémarrage de n8n…');
  if (!(await attendre(`${N8N}/healthz`, 4))) arreter('n8n ne répond plus après l\'import.', 'cd compose && docker compose logs n8n --tail 50');
  ok('workflows importés et publiés');
}

async function etape7_comptes() {
  titre(7, 'Comptes des soignants et interface');
  let r = lancer('node', ['scripts/creer-soignants.mjs']);
  if (r.status !== 0) arreter('La création des comptes a échoué.');
  r = lancer('npm', ['install', '--no-audit', '--no-fund'], { cwd: join(racine, 'front') });
  if (r.status !== 0) arreter('npm install (front/) a échoué.');
  const f = join(racine, '.env');
  const t = readFileSync(f, 'utf8');
  if (/^VITE_MOCK=true/m.test(t)) {
    writeFileSync(f, t.replace(/^VITE_MOCK=true/m, 'VITE_MOCK=false'), 'utf8');
    ok('VITE_MOCK=false : l\'interface parle à n8n');
  } else ok('VITE_MOCK déjà à false');
}

async function etape8_rag() {
  titre(8, 'Première indexation du RAG (sinon il faudrait attendre 06:00)');
  const r = lancer('node', ['tests/test-du-soir.mjs', '1']);
  if (r.status !== 0) arreter('L\'indexation ou son contrôle a échoué.', option('sans-epa') ? 'Avec --sans-epa, l\'échec de la source « ePA » est attendu.' : 'Vérifier que nomic-embed-text est présent (étape 4).');
  ok('RAG indexé');
}

// ------------------------------------------------------------------ vérification (sans rien modifier)
async function verifier() {
  console.log('\n=== Vérification : services ===');
  let echecs = 0;
  const test = (cond, msg) => { console.log(`  ${cond ? 'OK   ' : 'ÉCHEC'} ${msg}`); if (!cond) echecs++; };
  test((await http(`${N8N}/healthz`)).ok, 'n8n répond (5679)');
  test((await http(`${QDRANT}/collections`)).ok, 'Qdrant répond (6335)');
  test((await http('http://localhost:8090/fhir/metadata')).ok, 'HAPI FHIR répond (8090)');
  test((await http('http://localhost:8025/api/v1/info')).ok, 'Mailpit répond (8025)');
  if (!option('sans-epa')) test((await http('http://localhost:8084/fhir/metadata')).ok, 'ePA médication répond (8084)');
  const liste = await modelesPresents();
  test(liste !== null, 'Ollama répond (11434)');
  if (liste) for (const m of MODELES.filter((x) => x.requis)) test(aLeModele(liste, m.nom), `modèle ${m.nom} présent`);
  const col = await http(`${QDRANT}/collections`);
  if (col.ok) {
    const noms = JSON.parse(col.texte).result.collections.map((c) => c.name);
    for (const c of ['patients', 'connaissances', 'a_verifier']) test(noms.includes(c), `collection Qdrant « ${c} »`);
  }
  const nb = capturer('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM soins.soignants"'], { cwd: compose });
  test(nb.status === 0 && Number(nb.stdout.trim()) >= 4, 'comptes des soignants créés (PostgreSQL)');
  // connexion avec un faux PIN : le webhook doit exister (pas 404) et refuser proprement (pas 500)
  const dem = await fetch(`${N8N}/webhook/aicare-connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': lireEnv().AICARE_CLE_WEBHOOK ?? '' }, body: JSON.stringify({ identifiant: 'inconnu', pin: '000000' }), signal: AbortSignal.timeout(8000) }).catch(() => null);
  test(dem !== null && dem.status !== 404 && dem.status < 500, 'les webhooks n8n sont publiés (connexion)');

  console.log('\n=== Vérification : tests sans IA (instantanés) ===');
  const tests = readdirSync(join(racine, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();
  for (const t of tests) {
    const r = capturer('node', [join('tests', t)], { timeout: 300000 });
    test(r.status === 0, `tests/${t}`);
    if (r.status !== 0) console.log((r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
  }
  if (option('demo')) {
    console.log('\n=== Vérification : démonstration rapide (sans Llama) ===');
    const r = lancer('node', ['scripts/demo-nuit.mjs', '--rapide']);
    test(r.status === 0, 'scripts/demo-nuit.mjs --rapide');
  }
  console.log(echecs ? `\n${echecs} contrôle(s) en échec.` : '\nTous les contrôles sont au vert.');
  return echecs;
}

// ------------------------------------------------------------------ programme
if (option('verifier')) process.exit((await verifier()) ? 1 : 0);

const etapes = [etape1_prerequis, etape2_secrets, etape3_docker, etape4_modeles, etape5_donnees, etape6_workflows, etape7_comptes, etape8_rag];
console.log('AI-Care Assistant — installation (données entièrement fictives)');
const jusqua = Number(args.find((a) => a.startsWith('--jusqua='))?.split('=')[1] ?? etapes.length);
for (let i = depuis - 1; i < Math.min(jusqua, etapes.length); i++) await etapes[i]();
if (jusqua < etapes.length) { console.log(`\nArrêt volontaire après l'étape ${jusqua} (--jusqua).`); process.exit(0); }

const echecs = await verifier();
console.log(`
Installation terminée${avertissements ? ` (${avertissements} avertissement(s) ci-dessus)` : ''}${echecs ? ', mais des contrôles échouent' : ''}.

Pour ouvrir l'interface :
  cd front
  npm run dev
puis http://localhost:5173 — identifiants : martin, keller, roth ou arsene ; PIN dans .env (DEMO_PIN_*).

Pour rejouer les tests plus longs : voir docs/INSTALLATION.md (démonstration, batterie de 30 questions, cotisations).`);
process.exit(echecs ? 1 : 0);
