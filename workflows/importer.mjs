// Importe dans n8n (conteneur du docker-compose) le credential PostgreSQL et les workflows de workflows/.
// Rejouable : un workflow ré-importé remplace l'ancien (même identifiant).
//
// Usage : node workflows/importer.mjs            (tout importer + publier les connecteurs + redémarrer n8n)
//         node workflows/importer.mjs --sans-redemarrage
//
// Prérequis : `docker compose up -d` dans compose/ et un fichier .env à la racine (voir .env.exemple).
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = join(racine, 'compose');
const sansRedemarrage = process.argv.includes('--sans-redemarrage');

function docker(args, input) {
  const r = spawnSync('docker', ['compose', ...args], { cwd: compose, input, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`docker compose ${args.join(' ')}\n${r.stderr || r.stdout}`);
    process.exit(1);
  }
  return r.stdout;
}
const dansN8n = (commande, input) => docker(['exec', '-T', 'n8n', 'sh', '-c', commande], input);

// ---- credential PostgreSQL (valeurs lues dans .env, jamais écrites dans le dépôt) ----
const env = Object.fromEntries(
  readFileSync(join(racine, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const credential = [
  {
    id: 'aicarepg00000001',
    name: 'AI-Care Postgres',
    type: 'postgres',
    data: {
      host: 'postgres',
      port: 5432,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      ssl: 'disable',
      allowUnauthorizedCerts: false,
      maxConnections: 5,
    },
  },
  {
    id: 'aicaremqtt0000001',
    name: 'AI-Care MQTT',
    type: 'mqtt',
    // Mosquitto du docker-compose : compte « n8n » (lecture seule des capteurs, voir compose/mosquitto/acl) ; identifiants lus dans .env
    data: { protocol: 'mqtt', host: 'mosquitto', port: 1883, username: env.MQTT_UTILISATEUR_N8N, password: env.MQTT_MOT_DE_PASSE_N8N, clean: true, clientId: 'aicare-n8n', ssl: false, passwordless: false },
  },
];
// clés des webhooks n8n (en-tête X-AICare-Cle) : celle de l'interface (visible dans son code) et la clé INTERNE de n8n (jamais envoyée à l'interface)
if (!env.AICARE_CLE_WEBHOOK || !env.AICARE_CLE_INTERNE) {
  console.error('AICARE_CLE_WEBHOOK ou AICARE_CLE_INTERNE manque dans .env : lancer d\'abord node scripts/generer-secrets.mjs');
  process.exit(1);
}
credential.push(
  { id: 'aicarecle000000001', name: 'AI-Care clé des webhooks', type: 'httpHeaderAuth', data: { name: 'X-AICare-Cle', value: env.AICARE_CLE_WEBHOOK } },
  { id: 'aicarecleint0000001', name: 'AI-Care clé interne', type: 'httpHeaderAuth', data: { name: 'X-AICare-Cle', value: env.AICARE_CLE_INTERNE } },
);// TTN (The Things Stack) : seulement si le compte est renseigné dans .env (TTN_APPLICATION = « identifiant@locataire », TTN_CLE_API = clé en lecture du trafic)
const ttn = Boolean(env.TTN_APPLICATION && env.TTN_CLE_API && env.TTN_CLE_API !== 'TA-CLE' && !env.TTN_APPLICATION.startsWith('TON-'));
if (ttn) {
  credential.push({
    id: 'aicarettn00000001',
    name: 'AI-Care TTN',
    type: 'mqtt',
    data: { protocol: 'mqtts', host: env.TTN_SERVEUR, port: Number(env.TTN_PORT || 8883), username: env.TTN_APPLICATION, password: env.TTN_CLE_API, clean: true, clientId: 'aicare-ttn', ssl: true, passwordless: false },
  });
}
dansN8n('cat > /tmp/credential.json && n8n import:credentials --input=/tmp/credential.json && rm -f /tmp/credential.json', JSON.stringify(credential));
console.log('credential « AI-Care Postgres » importé');

// ---- workflows ----
// --seulement=66,74 : ne réimporter que ces workflows (par leur numéro), pour aller plus vite après une retouche.
const seulement = (process.argv.find((a) => a.startsWith('--seulement=')) ?? '').slice(12).split(',').filter(Boolean);
const fichiers = readdirSync(join(racine, 'workflows'))
  .filter((f) => /^\d\d-.*\.json$/.test(f) && (!seulement.length || seulement.includes(f.slice(0, 2))))
  .sort();
const publies = [];
for (const f of fichiers) {
  let contenu = readFileSync(join(racine, 'workflows', f), 'utf8');
  let wf = JSON.parse(contenu);
  const noeudTtn = wf.nodes.find((n) => n.name === 'Alarme TTN');
  if (noeudTtn && ttn) {
    // on active le point d'entrée TTN et on y met le sujet de VOTRE application (le fichier du dépôt reste neutre et désactivé)
    noeudTtn.disabled = false;
    noeudTtn.parameters.topics = `v3/${env.TTN_APPLICATION}/devices/+/up`;
    contenu = JSON.stringify(wf);
    console.log('  pont TTN activé pour', env.TTN_APPLICATION);
  }
  dansN8n('cat > /tmp/workflow.json && n8n import:workflow --input=/tmp/workflow.json && rm -f /tmp/workflow.json', contenu);
  console.log(`importé  ${f}`);
  // n8n 2 : un sous-workflow doit lui aussi être publié, sinon l'appel échoue (« Workflow is not active »).
  const declencheursPublies = ['webhook', 'scheduleTrigger', 'executeWorkflowTrigger', 'n8nTrigger', 'mqttTrigger'].map((t) => `n8n-nodes-base.${t}`);
  if (wf.nodes.some((n) => declencheursPublies.includes(n.type))) {
    dansN8n(`n8n publish:workflow --id=${wf.id}`);
    publies.push(wf.id);
  }
}
console.log(`publiés : ${publies.join(', ') || 'aucun'}`);

if (!sansRedemarrage) {
  docker(['restart', 'n8n']);
  process.stdout.write('redémarrage de n8n');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    process.stdout.write('.');
    try {
      const rep = await fetch('http://localhost:5679/healthz');
      if (rep.ok) break;
    } catch {
      /* pas encore prêt */
    }
  }
  console.log(' prêt.');
}
