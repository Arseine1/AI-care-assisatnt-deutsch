// Génère data/sql/03_sgb6.sql : les questionnaires fictifs de data/sgb6/questionnaires/ importés comme dossiers « à traiter ».
// « INSERT … ON CONFLICT DO NOTHING » : rejouable, un dossier déjà traité ou décidé n'est jamais écrasé.
// Lancer : node data/scripts/generer-sgb6.mjs   (puis npm run postgres dans data/, ou voir docs/cotisations.md)
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
const sql = `-- GÉNÉRÉ par data/scripts/generer-sgb6.mjs (ne pas modifier à la main). Données entièrement fictives.
INSERT INTO soins.sgb6_dossiers (id, questionnaire, aidant, personne, recu_le) VALUES
${lignes.join(',\n')}
ON CONFLICT (id) DO NOTHING;
`;
writeFileSync(join(racine, 'sql', '03_sgb6.sql'), sql, 'utf8');
console.log(`écrit data/sql/03_sgb6.sql (${lignes.length} dossiers)`);
