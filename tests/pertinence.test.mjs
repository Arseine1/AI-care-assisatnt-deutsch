// Tests hors n8n de la PERTINENCE des faits (jour 4, étape 9) : « chercher » (nœud « Assembler les faits ») met en
// premier les faits qui parlent de la demande du soignant (Mode B), et ne donne AUCUN fait au modèle quand aucun fait
// du résident n'en parle (la réponse est alors « information non disponible », jamais un fait sans rapport).
// Lancer : node tests/pertinence.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { jsCode, lancer } from './lib/prompts-harness.mjs';

const code = jsCode('60-brique-chercher.json', 'Assembler les faits');
const heure = (m) => new Date(Date.parse('2026-10-25T06:00:00Z') - m * 60000).toISOString();

// Un résident avec beaucoup de faits (plus que les 8 retenus) dont un seul parle de la fièvre et un autre du poids.
const notes = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, horodatage: heure(600 - i * 10), auteur: 'IDE Keller', categorie: 'observation', texte: `Observation ${i + 1} : toilette faite, repas pris, humeur stable.` }));
notes.push({ id: 90, horodatage: heure(700), auteur: 'IDE Keller', categorie: 'observation', texte: 'Poids 71,2 kg ce matin, diurèse 900 ml sur 24 heures.' });
const vitaux = [{ horodatage: heure(800), type: 'temperature', valeur: '37,9', unite: '°C' }];

function chercher(requete, filtrer = true, extra = {}) {
  return lancer(code, {
    noeuds: {
      'Paramètres': [{ patient_id: 'PAT-003', depuis: heure(1440), jusqua: heure(0), requete, filtrer_requete: filtrer, protocoles: true, max_faits: 8, ...extra }],
      'Résident': [{ patient_id: 'PAT-003', civilite: 'M.', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: ['Hypertension'], allergies: ['Pénicilline'], regime: 'normal', risques: ['chute'] }],
      'Autres résidents': [],
      'Notes de la période': notes,
      'Constantes de la période': vitaux,
      'Plan de médication': [{ medicament: 'Ramipril', dosage: '5 mg', schema_prise: '1-0-0', indication: 'HTA' }],
      'Qdrant période': [{ result: [] }],
      'Qdrant fond': [{ result: [] }],
      'Qdrant protocoles': [{ result: [{ payload: { source: 'fichier', source_label: 'Fichiers', source_ref: 'fichiers/protocole-chutes.md', chunk_index: 0, type: 'protocole', theme: 'chutes', texte: 'Protocole chutes : surveillance neurologique toutes les 2 heures.', date: null } }] }],
      'Qdrant lettres': [{ result: { points: [] } }],
    },
  })[0];
}
let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

test('la question sur la fièvre retrouve la température, même noyée parmi plus de 8 faits (synonyme)', () => {
  const r = chercher('A-t-il de la fièvre ?');
  assert.equal(r.faits.length, 8);
  assert.ok(r.faits.some((f) => /temperature 37,9/i.test(f.texte)), 'la température doit être parmi les faits');
  assert.equal(r.stats.aucune_correspondance, false);
});
test('la question sur le poids et la diurèse retrouve la note qui en parle', () => {
  const r = chercher('Quels sont le poids et la diurèse ?');
  assert.ok(r.faits.some((f) => /71,2 kg/.test(f.texte)));
});
test('sans la pertinence (Mode A), les faits ne dépendent que de leur importance générale', () => {
  const r = chercher('A-t-il de la fièvre ?', false);
  assert.equal(r.stats.aucune_correspondance, false);
  assert.ok(r.faits.length > 0);
});
test('un sujet que le dossier ne mentionne pas : AUCUN fait n\'est donné au modèle', () => {
  for (const q of ['Quel est son groupe sanguin ?', 'A-t-il fait une coloscopie ?', 'Porte-t-il des lunettes ou un dentier ?', 'Quelle est sa religion ?']) {
    const r = chercher(q);
    assert.equal(r.faits.length, 0, `aucun fait attendu pour « ${q} »`);
    assert.equal(r.stats.aucune_correspondance, true);
  }
});
test('une demande générale (aucun mot précis) garde les faits habituels', () => {
  for (const q of ['Résume la nuit.', 'Comment s\'est passée la nuit ?', 'Donne-moi les informations importantes']) {
    const r = chercher(q);
    assert.ok(r.faits.length > 0, `faits attendus pour « ${q} »`);
  }
});
test('« personne » ne trouve pas « personnel » (terminaisons seulement)', () => {
  const r = chercher('A-t-il désigné une personne de confiance ?', true, {});
  assert.equal(r.stats.aucune_correspondance, true);
});
test('un protocole s\'affiche comme « Protocole chutes » (et non « Fichiers »)', () => {
  const r = chercher('Que dit le protocole de chute ?');
  const p = r.faits.find((f) => f.type === 'protocole');
  assert.ok(p, 'le protocole doit faire partie des faits');
  assert.equal(p.label, 'Protocole chutes');
});

test('plusieurs alarmes de capteur indexées forment UN SEUL fait : elles ne chassent pas les autres des 8 places', () => {
  const alarme = (i, h) => ({ payload: { source: 'capteurs', source_label: 'Capteurs', source_ref: `alarme-${i}`, chunk_index: 0, type: 'alarme', texte: `Alarme de capteur (chute) le 27.10. à ${h}, chambre 12.`, date: heure(300 - i * 60) } });
  const base = lancer(code, {
    noeuds: {
      'Paramètres': [{ patient_id: 'PAT-003', depuis: heure(1440), jusqua: heure(0), requete: 'x', filtrer_requete: false, protocoles: false, max_faits: 8 }],
      'Résident': [{ patient_id: 'PAT-003', civilite: 'M.', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: ['Hypertension'], allergies: ['Pénicilline'], regime: 'normal', risques: ['chute'] }],
      'Autres résidents': [], 'Notes de la période': notes, 'Constantes de la période': vitaux, 'Plan de médication': [],
      'Qdrant période': [{ result: [alarme(1, '10h35'), alarme(2, '13h35'), alarme(3, '13h47'), alarme(4, '14h02')] }],
      'Qdrant fond': [{ result: [] }], 'Qdrant protocoles': [{ result: [] }], 'Qdrant lettres': [{ result: { points: [] } }],
    },
  })[0];
  const fAlarmes = base.faits.filter((f) => f.label === 'Capteurs');
  assert.equal(fAlarmes.length, 1, 'un seul fait « Capteurs »');
  assert.match(fAlarmes[0].texte, /\(chute\) le 27\.10\. à 10h35 ; \(chute\) le 27\.10\. à 13h35 ; \(chute\) le 27\.10\. à 13h47 ; \(chute\) le 27\.10\. à 14h02/);
  assert.ok(!/chambre 12/.test(fAlarmes[0].texte));
  assert.ok(base.faits.some((f) => /^Allergies/.test(f.texte)), 'l\'allergie reste parmi les faits');
  assert.equal(base.faits.length, 8);
});

console.log(`\n${nb} tests réussis.`);
