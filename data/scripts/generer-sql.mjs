// Erzeugt data/sql/02_seed.sql aus data/source/residents.mjs.
// Die Zeitstempel werden als relatives SQL geschrieben (now() - interval): Beim erneuten Abspielen der Datei
// werden die „letzten 12 Stunden“ aktualisiert.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { residents, correspondances } from '../source/residents.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const tableau = (liste) => (liste.length ? `ARRAY[${liste.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const horloge = (min) => `to_char(now() - interval '${min} minutes', 'HH24"h"MI')`;

// Text mit {{h}} / {{h:N}} -> SQL-Verkettung mit der berechneten Uhrzeit.
function texteSql(texte, minutesNote) {
  const parts = texte.split(/(\{\{h(?::\d+)?\}\})/);
  return parts
    .filter((p) => p !== '')
    .map((p) => {
      const m = p.match(/^\{\{h(?::(\d+))?\}\}$/);
      return m ? horloge(m[1] ?? minutesNote) : q(p);
    })
    .join(' || ');
}

const sql = [];
sql.push(`-- ERZEUGT von data/scripts/generer-sql.mjs: nicht von Hand ändern.
-- 100 % fiktive Daten. Wiederholbar: ersetzt die Testdaten und aktualisiert die Zeitstempel.
BEGIN;
TRUNCATE soins.residents RESTART IDENTITY CASCADE;
`);

for (const r of residents) {
  sql.push(`INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES (${q(r.id)}, ${q(r.civilite)}, ${q(r.prenom)}, ${q(r.nom)}, ${q(r.naissance)}, ${q(r.sexe)}, ${q(r.chambre)}, ${r.etage}, ${q(r.admission)},
  ${tableau(r.diagnostics.map((d) => d.libelle))},
  ${tableau(r.allergies.map((a) => `${a.substance} (${a.reaction})`))},
  ${q(r.regime)}, ${tableau(r.risques)});`);

  for (const [systeme, identifiant] of correspondances(r)) {
    sql.push(`INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES (${q(r.id)}, ${q(systeme)}, ${q(identifiant)});`);
  }
  for (const m of r.medication) {
    sql.push(`INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES (${q(r.id)}, ${q(m.nom)}, ${q(m.dosage)}, ${q(m.schema)}, ${q(m.indication ?? '')}, ${m.remarque ? q(m.remarque) : 'NULL'});`);
  }
  for (const v of r.vitaux) {
    sql.push(`INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES (${q(r.id)}, now() - interval '${v.minutes} minutes', ${q(v.type)}, ${q(v.valeur)}, ${q(v.unite)});`);
  }
  for (const n of r.notes) {
    sql.push(`INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES (${q(r.id)}, now() - interval '${n.minutes} minutes', ${q(n.auteur)}, ${q(n.categorie)}, ${texteSql(n.texte, n.minutes)});`);
  }
  sql.push('');
}
sql.push('COMMIT;\n');

mkdirSync(join(racine, 'sql'), { recursive: true });
writeFileSync(join(racine, 'sql', '02_seed.sql'), sql.join('\n'), 'utf8');
console.log(`02_seed.sql erzeugt: ${residents.length} Bewohner.`);
