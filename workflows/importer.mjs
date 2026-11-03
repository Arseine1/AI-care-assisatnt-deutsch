// Importiert die PostgreSQL-Zugangsdaten und die Workflows aus workflows/ in n8n (Container aus der docker-compose).
// Wiederholbar: ein erneut importierter Workflow ersetzt den alten (gleiche Kennung).
//
// Aufruf: node workflows/importer.mjs            (alles importieren + Anbindungen veröffentlichen + n8n neu starten)
//         node workflows/importer.mjs --sans-redemarrage
//
// Voraussetzungen: `docker compose up -d` in compose/ und eine .env-Datei im Hauptordner (siehe .env.exemple).
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

// ---- Zugangsdaten PostgreSQL (Werte aus der .env gelesen, nie im Repository gespeichert) ----
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
    // Mosquitto aus der docker-compose: Konto „n8n“ (nur Lesezugriff auf die Sensoren, siehe compose/mosquitto/acl); Zugangsdaten aus der .env
    data: { protocol: 'mqtt', host: 'mosquitto', port: 1883, username: env.MQTT_UTILISATEUR_N8N, password: env.MQTT_MOT_DE_PASSE_N8N, clean: true, clientId: 'aicare-n8n', ssl: false, passwordless: false },
  },
];
// Schlüssel der n8n-Webhooks (Header X-AICare-Cle): der Schlüssel der Oberfläche (in ihrem Code sichtbar) und der INTERNE n8n-Schlüssel (wird nie an die Oberfläche gesendet)
if (!env.AICARE_CLE_WEBHOOK || !env.AICARE_CLE_INTERNE) {
  console.error('AICARE_CLE_WEBHOOK oder AICARE_CLE_INTERNE fehlt in der .env: zuerst node scripts/generer-secrets.mjs ausführen');
  process.exit(1);
}
credential.push(
  { id: 'aicarecle000000001', name: 'AI-Care clé des webhooks', type: 'httpHeaderAuth', data: { name: 'X-AICare-Cle', value: env.AICARE_CLE_WEBHOOK } },
  { id: 'aicarecleint0000001', name: 'AI-Care clé interne', type: 'httpHeaderAuth', data: { name: 'X-AICare-Cle', value: env.AICARE_CLE_INTERNE } },
);// TTN (The Things Stack): nur wenn das Konto in der .env eingetragen ist (TTN_APPLICATION = „Kennung@Mandant“, TTN_CLE_API = Leseschlüssel für den Datenverkehr)
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
console.log('Zugangsdaten „AI-Care Postgres“ importiert');

// ---- Workflows ----
// --seulement=66,74: nur diese Workflows (nach Nummer) erneut importieren, damit es nach einer Änderung schneller geht.
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
    // Der TTN-Einstiegspunkt wird aktiviert und mit dem Topic IHRER Anwendung versehen (die Datei im Repository bleibt neutral und deaktiviert)
    noeudTtn.disabled = false;
    noeudTtn.parameters.topics = `v3/${env.TTN_APPLICATION}/devices/+/up`;
    contenu = JSON.stringify(wf);
    console.log('  TTN-Brücke aktiviert für', env.TTN_APPLICATION);
  }
  dansN8n('cat > /tmp/workflow.json && n8n import:workflow --input=/tmp/workflow.json && rm -f /tmp/workflow.json', contenu);
  console.log(`importiert  ${f}`);
  // n8n 2: Auch ein Unter-Workflow muss veröffentlicht sein, sonst schlägt der Aufruf fehl („Workflow is not active“).
  const declencheursPublies = ['webhook', 'scheduleTrigger', 'executeWorkflowTrigger', 'n8nTrigger', 'mqttTrigger'].map((t) => `n8n-nodes-base.${t}`);
  if (wf.nodes.some((n) => declencheursPublies.includes(n.type))) {
    dansN8n(`n8n publish:workflow --id=${wf.id}`);
    publies.push(wf.id);
  }
}
console.log(`veröffentlicht: ${publies.join(', ') || 'keine'}`);

if (!sansRedemarrage) {
  docker(['restart', 'n8n']);
  process.stdout.write('n8n wird neu gestartet');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    process.stdout.write('.');
    try {
      const rep = await fetch('http://localhost:5679/healthz');
      if (rep.ok) break;
    } catch {
      /* noch nicht bereit */
    }
  }
  console.log(' bereit.');
}
