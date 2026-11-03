// Test ohne n8n des Knotens « Zerlegen und Hashen » (workflows/code/indexeur-decouper.js).
// Start: node tests/indexeur-decoupage.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(racine, 'workflows', 'code', 'indexeur-decouper.js'), 'utf8');
const require = createRequire(import.meta.url);

function lancer(documents) {
  const entree = { all: () => documents.map((json) => ({ json })) };
  return new Function('$input', 'require', code)(entree, require).map((x) => x.json);
}

const doc = (texte, extra = {}) => ({
  collection: 'patients',
  texte,
  titre: 'Test',
  source: 'fichier',
  source_label: 'Dateien',
  source_ref: 'test.md',
  type: 'protocole',
  date: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const phrase = (i) => `Satz Nummer ${i}, der genau einige nützliche Wörter für den Test enthält.`;
const longTexte = (n) => Array.from({ length: n }, (_, i) => phrase(i)).join(' ');
const mots = (s) => s.trim().split(/\s+/).length;

// 1. Ein kurzes Dokument bleibt ein einziger Abschnitt.
let r = lancer([doc('Ruhige Nacht, durchgehender Schlaf.')]);
assert.equal(r.length, 1);
assert.equal(r[0].payload.chunk_total, 1);

// 2. Ein langes Dokument: Jeder Abschnitt hat höchstens 500 Wörter und mindestens 300, außer dem letzten.
r = lancer([doc(longTexte(110))]);
assert.ok(r.length >= 3, `mindestens 3 Abschnitte erwartet, erhalten ${r.length}`);
r.forEach((m, i) => {
  const n = mots(m.payload.texte);
  assert.ok(n <= 500, `Abschnitt ${i}: ${n} Wörter (> 500)`);
  if (i < r.length - 1) assert.ok(n >= 300, `Abschnitt ${i}: ${n} Wörter (< 300)`);
  assert.equal(m.payload.chunk_index, i);
  assert.equal(m.payload.chunk_total, r.length);
});

// 3. Stabile Kennung; Fingerabdruck, der dem Inhalt folgt.
const a = lancer([doc(longTexte(110))]);
const b = lancer([doc(longTexte(110))]);
assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
assert.deepEqual(a.map((x) => x.payload.empreinte), b.map((x) => x.payload.empreinte));
const c = lancer([doc(longTexte(110) + ' Zusatz.')]);
assert.equal(c[0].id, a[0].id);
assert.notEqual(c[c.length - 1].payload.empreinte, a[a.length - 1].payload.empreinte);

// 4. Zwei verschiedene Dokumente haben nicht dieselbe Kennung; ein leerer Text wird ignoriert.
r = lancer([doc('A.', { source_ref: 'a' }), doc('A.', { source_ref: 'b' }), doc('   ')]);
assert.equal(r.length, 2);
assert.notEqual(r[0].id, r[1].id);

// 5. Ein einziger riesiger Satz wird zwangsweise geteilt (nie mehr als 500 Wörter).
r = lancer([doc('Wort '.repeat(1300).trim())]);
r.forEach((m) => assert.ok(mots(m.payload.texte) <= 500));

// 6. Der Name des Bewohners steht im zu vektorisierenden Text (hilft der Suche « Herr Weber Sturz »).
r = lancer([doc('Sturz um 04:41 Uhr.', { patient_label: 'Herr Hans Weber (Zimmer 12)', patient_id: 'PAT-003' })]);
assert.match(r[0].embedText, /^search_document: Herr Hans Weber \(Zimmer 12\) – Test\n/);
assert.equal(r[0].payload.patient_id, 'PAT-003');

console.log('OK – Zerlegung in 300-500 Wörter, stabile Kennungen, Fingerabdrücke.');
