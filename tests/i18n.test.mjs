// Garde-fou des textes de l'interface : (1) aucune clé en double dans fr.json (la seconde écraserait la première, et les textes
// de la première s'afficheraient comme « alertes.page.titre ») ; (2) toute clé écrite en dur dans t('…') existe.
// Lancer : node tests/i18n.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const brut = readFileSync(join(racine, 'front', 'src', 'i18n', 'fr.json'), 'utf8');
let nb = 0;
const test = (nom, fn) => { fn(); nb++; console.log(`OK  ${nom}`); };

// parcours du JSON brut en suivant les niveaux : une clé répétée dans le même objet est une erreur
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
test('fr.json : aucune clé en double dans un même objet', () => assert.deepEqual(clesEnDouble(brut), []));

const textes = JSON.parse(brut);
const existe = (cle) => cle.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), textes) !== undefined;
function fichiers(dossier) {
  return readdirSync(dossier).flatMap((f) => {
    const p = join(dossier, f);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : [];
  });
}
test('toute clé t(\'…\') écrite en dur dans l\'interface existe dans fr.json', () => {
  const manquantes = [];
  for (const f of fichiers(join(racine, 'front', 'src'))) {
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!existe(m[1])) manquantes.push(`${f.split('src')[1]} : ${m[1]}`);
  }
  assert.deepEqual(manquantes, []);
});
test('les pages « alarmes » et « documents » ont les mêmes textes, et leurs clés dynamiques existent', () => {
  assert.deepEqual(Object.keys(textes.alertes.alarmes).sort(), Object.keys(textes.alertes.documents).sort());
  for (const jeu of ['alarmes', 'documents']) for (const cle of ['titre', 'description', 'enAttente', 'aucune', 'historique', 'historiqueVide', 'acquitteeA']) assert.ok(existe(`alertes.${jeu}.${cle}`), `alertes.${jeu}.${cle}`);
});console.log(`\n${nb} tests réussis.`);
