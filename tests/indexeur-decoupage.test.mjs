// Test hors n8n du nœud « Découper et hacher » (workflows/code/indexeur-decouper.js).
// Lancer : node tests/indexeur-decoupage.test.mjs
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
  source_label: 'Fichiers',
  source_ref: 'test.md',
  type: 'protocole',
  date: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const phrase = (i) => `Phrase numéro ${i} qui contient exactement quelques mots utiles pour le test.`;
const longTexte = (n) => Array.from({ length: n }, (_, i) => phrase(i)).join(' ');
const mots = (s) => s.trim().split(/\s+/).length;

// 1. Un document court reste en un seul morceau.
let r = lancer([doc('Nuit calme, sommeil continu.')]);
assert.equal(r.length, 1);
assert.equal(r[0].payload.chunk_total, 1);

// 2. Un long document : chaque morceau fait au plus 500 mots, et au moins 300 sauf le dernier.
r = lancer([doc(longTexte(110))]);
assert.ok(r.length >= 3, `attendu au moins 3 morceaux, obtenu ${r.length}`);
r.forEach((m, i) => {
  const n = mots(m.payload.texte);
  assert.ok(n <= 500, `morceau ${i} : ${n} mots (> 500)`);
  if (i < r.length - 1) assert.ok(n >= 300, `morceau ${i} : ${n} mots (< 300)`);
  assert.equal(m.payload.chunk_index, i);
  assert.equal(m.payload.chunk_total, r.length);
});

// 3. Identifiant stable ; empreinte qui suit le contenu.
const a = lancer([doc(longTexte(110))]);
const b = lancer([doc(longTexte(110))]);
assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
assert.deepEqual(a.map((x) => x.payload.empreinte), b.map((x) => x.payload.empreinte));
const c = lancer([doc(longTexte(110) + ' Ajout.')]);
assert.equal(c[0].id, a[0].id);
assert.notEqual(c[c.length - 1].payload.empreinte, a[a.length - 1].payload.empreinte);

// 4. Deux documents différents n'ont pas le même identifiant ; un texte vide est ignoré.
r = lancer([doc('A.', { source_ref: 'a' }), doc('A.', { source_ref: 'b' }), doc('   ')]);
assert.equal(r.length, 2);
assert.notEqual(r[0].id, r[1].id);

// 5. Une seule phrase énorme est coupée de force (jamais plus de 500 mots).
r = lancer([doc('mot '.repeat(1300).trim())]);
r.forEach((m) => assert.ok(mots(m.payload.texte) <= 500));

// 6. Le nom du résident est dans le texte à vectoriser (aide la recherche « M. Weber chute »).
r = lancer([doc('Chute à 04h41.', { patient_label: 'M. Hans Weber (chambre 12)', patient_id: 'PAT-003' })]);
assert.match(r[0].embedText, /^search_document: M\. Hans Weber \(chambre 12\) – Test\n/);
assert.equal(r[0].payload.patient_id, 'PAT-003');

console.log('OK – découpage 300-500 mots, identifiants stables, empreintes.');
