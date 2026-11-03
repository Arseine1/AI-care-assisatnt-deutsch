// Erzeugt data/sql/03_sgb6.sql: die fiktiven Fragebögen aus data/sgb6/questionnaires/, importiert als Akten „zu bearbeiten“.
// „INSERT … ON CONFLICT DO NOTHING“: wiederholbar, eine bereits bearbeitete oder entschiedene Akte wird nie überschrieben.
// Aufruf: node data/scripts/generer-sgb6.mjs   (danach npm run postgres in data/, oder siehe docs/cotisations.md)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireChamps } from '../../workflows/code/sgb6/regles.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'sgb6', 'questionnaires');
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lignes = readdirSync(dossier)
  .filter((f) => f.endsWith('.txt'))
  .sort()
  .map((f) => {
    const texte = readFileSync(join(dossier, f), 'utf8').replace(/\r\n/g, '\n');
    const { donnees, recu_le } = extraireChamps(texte);
    const nom = (p, n) => `${donnees[p] ?? ''} ${donnees[n] ?? ''}`.trim();
    return `  (${lit(f.replace(/\.txt$/, ''))}, ${lit(texte)}, ${lit(nom('aidant_prenom', 'aidant_nom'))}, ${lit(nom('personne_prenom', 'personne_nom'))}, ${recu_le ? lit(recu_le) : 'current_date'})`;
  });
const sql = `-- ERZEUGT von data/scripts/generer-sgb6.mjs (nicht von Hand ändern). Vollständig fiktive Daten.
INSERT INTO soins.sgb6_dossiers (id, questionnaire, aidant, personne, recu_le) VALUES
${lignes.join(',\n')}
ON CONFLICT (id) DO NOTHING;
`;
writeFileSync(join(racine, 'sql', '03_sgb6.sql'), sql, 'utf8');
console.log(`geschrieben data/sql/03_sgb6.sql (${lignes.length} Akten)`);
