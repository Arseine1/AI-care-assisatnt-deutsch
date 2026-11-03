// Wächter für die Texte der Oberfläche: (1) kein doppelter Schlüssel in de.json (der zweite würde den ersten überschreiben, und die Texte
// des ersten würden als « alertes.page.titre » angezeigt); (2) jeder fest in t('…') geschriebene Schlüssel existiert.
// Start: node tests/i18n.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const brut = readFileSync(join(racine, 'front', 'src', 'i18n', 'de.json'), 'utf8');
let nb = 0;
const test = (nom, fn) => { fn(); nb++; console.log(`OK  ${nom}`); };

// Durchlauf des rohen JSON entlang der Ebenen: Ein im selben Objekt wiederholter Schlüssel ist ein Fehler
function clesEnDouble(texte) {
  const pile = [];
  const doublons = [];
  const re = /"((?:[^"\\]|\\.)*)"\s*(:)?|[{}\[\]]/g;
  let m;
  while ((m = re.exec(texte))) {
    if (m[0] === '{') pile.push({ type: 'objet', cles: new Set() });
    else if (m[0] === '[') pile.push({ type: 'tableau' });
    else if (m[0] === '}' || m[0] === ']') pile.pop();
    else if (m[2]) {
      const niveau = pile.at(-1);
      if (niveau?.type === 'objet') {
        if (niveau.cles.has(m[1])) doublons.push(m[1]);
        niveau.cles.add(m[1]);
      }
    }
  }
  return doublons;
}
test('de.json: kein doppelter Schlüssel in einem Objekt', () => assert.deepEqual(clesEnDouble(brut), []));

const textes = JSON.parse(brut);
const existe = (cle) => cle.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), textes) !== undefined;
function fichiers(dossier) {
  return readdirSync(dossier).flatMap((f) => {
    const p = join(dossier, f);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : [];
  });
}
test('Jeder fest in der Oberfläche geschriebene Schlüssel t(\'…\') existiert in de.json', () => {
  const manquantes = [];
  for (const f of fichiers(join(racine, 'front', 'src'))) {
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!existe(m[1])) manquantes.push(`${f.split('src')[1]} : ${m[1]}`);
  }
  assert.deepEqual(manquantes, []);
});
test('Die Seiten « alarmes » und « documents » haben dieselben Texte, und ihre dynamischen Schlüssel existieren', () => {
  assert.deepEqual(Object.keys(textes.alertes.alarmes).sort(), Object.keys(textes.alertes.documents).sort());
  for (const jeu of ['alarmes', 'documents']) for (const cle of ['titre', 'description', 'enAttente', 'aucune', 'historique', 'historiqueVide', 'acquitteeA']) assert.ok(existe(`alertes.${jeu}.${cle}`), `alertes.${jeu}.${cle}`);
});console.log(`\n${nb} Tests bestanden.`);
