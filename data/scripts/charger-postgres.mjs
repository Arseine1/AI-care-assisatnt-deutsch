// Lädt das Schema und dann die Testdaten in das PostgreSQL des docker-compose.
// Voraussetzung: `docker compose up -d` in compose/. Wiederholbar (aktualisiert die Zeitstempel).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = join(racine, '..', 'compose');

function psql(fichier) {
  const sql = readFileSync(join(racine, 'sql', fichier), 'utf8');
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { cwd: compose, input: sql, encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  console.log(`OK  ${fichier}`);
}

psql('01_schema.sql');
psql('02_seed.sql');
psql('03_sgb6.sql');

