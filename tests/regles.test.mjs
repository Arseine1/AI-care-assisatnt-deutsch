// Tests du FILET DE RÈGLES « Vérifier le document » (workflows/77-maitre-verifier.json, nœuds « Règles seules » et « Règles et fusion »).
// Ces règles ne dépendent pas du modèle de langage : elles lisent le texte de la lettre et les faits du dossier.
// Lancer : node tests/regles.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { jsCode, lancer } from './lib/prompts-harness.mjs';
import { residents } from '../data/source/residents.mjs';
import { LETTRES } from '../data/source/lettres.mjs';

const code = jsCode('77-maitre-verifier.json', 'Règles et fusion');

// Faits du dossier d'un résident, tels que « chercher » les produit (source « Logiciel de soins »).
function faitsDe(id) {
  const r = residents.find((x) => x.id === id);
  const liste = (a, vide) => (a.length ? a.join(' ; ') : vide);
  return [
    { label: 'Logiciel de soins', texte: `Diagnostics : ${liste(r.diagnostics.map((d) => d.libelle), 'aucun')}` },
    { label: 'Logiciel de soins', texte: `Allergies : ${liste(r.allergies.map((a) => `${a.substance} (${a.reaction})`), 'aucune connue')}` },
    { label: 'Logiciel de soins', texte: `Risques : ${liste(r.risques, 'aucun signalé')}` },
    { label: 'Logiciel de soins', texte: `Plan de médication : ${r.medication.map((m) => `${m.nom} ${m.dosage} (${m.schema})`).join(' ; ')}` },
    // un protocole général ne décrit pas le résident : il ne doit déclencher aucune règle à lui seul
    { label: 'Fichiers', texte: 'Protocole anticoagulants : Marcumar, apixaban, rivaroxaban. Protocole AINS : insuffisance rénale chronique, ibuprofène, diclofénac.' },
  ];
}
const texteLettre = (l) => `${l.expediteur.nom}. Arztbrief. Patient: ${l.patient}. ${l.corps.map(([t, x]) => `${t}: ${x}`).join(' ')}`;
const lettreDe = (nom) => LETTRES.find((l) => l.fichier === `arztbrief-${nom}.pdf`);
// Lettre scannée de M. Wagner, telle que la lit l'OCR (voir data/scripts/generer-lettres.mjs)
const TEXTE_WAGNER =
  'Dr. med. Peter Neumann Hausarzt, Allgemeinmedizin An: Pflegeheim Haus Sonnenhof (KIM) Arztbrief Patient: Herr Otto Wagner, geb. 05.08.1936 Diagnose: Lumbalgie, chronische Niereninsuffizienz bekannt. Therapie: Ibuprofen 600 mg, 1-1-1, ueber 10 Tage. Magenschutz mit Pantoprazol 40 mg, 1-0-0.';

function verifier(texte, faits, modele = { texte: '{"contradictions":[],"aucune_contradiction":true}', avertissements: [], modele: 'test', prompt_version: '1.0.1' }) {
  return lancer(code, {
    noeuds: {
      'Choisir la lettre': [{ lettre: { texte, titre: 'Arztbrief test', expediteur: 'Dr. Test', ref: 'kim/test', date: '2026-10-23T08:00:00Z' }, faits }],
      'Rédiger (extraction)': [{ texte: '', avertissements: [], prompt_version: '1.0.1' }],
      'Rédiger (comparaison)': [modele],
    },
  })[0];
}
const types = (r) => r.contradictions.map((c) => c.type).sort();

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

test('Weber : amoxicilline + allergie à la pénicilline -> allergie (haute)', () => {
  const r = verifier(texteLettre(lettreDe('weber')), faitsDe('PAT-003'));
  assert.deepEqual(types(r), ['allergie']);
  assert.equal(r.contradictions[0].gravite, 'haute');
  assert.match(r.contradictions[0].element_lettre, /Amoxicillin/);
  assert.match(r.contradictions[0].element_source, /Pénicilline/);
  assert.deepEqual(r.contradictions[0].sources, ['KIM (lettre de médecin)', 'Logiciel de soins']);
});

test('Schulz : apixaban alors que le Marcumar n\'est pas arrêté -> anticoagulation_double', () => {
  const r = verifier(texteLettre(lettreDe('schulz')), faitsDe('PAT-001'));
  assert.deepEqual(types(r), ['anticoagulation_double']);
  assert.match(r.contradictions[0].description, /apixaban/i);
  assert.match(r.contradictions[0].element_source, /Marcumar/);
});

test('Wagner (lettre scannée) : ibuprofène + insuffisance rénale -> insuffisance_renale', () => {
  const r = verifier(TEXTE_WAGNER, faitsDe('PAT-005'));
  assert.deepEqual(types(r), ['insuffisance_renale']);
  assert.match(r.contradictions[0].element_lettre, /Ibuprofen/);
});

test('Müller : la lettre n\'a de contradiction que pour le bon Müller (celui allergique aux sulfamides)', () => {
  const lettre = texteLettre(lettreDe('mueller')); // Cotrimoxazol, né le 01.12.1947 = chambre 21
  assert.deepEqual(types(verifier(lettre, faitsDe('PAT-006'))), ['allergie']);
  assert.deepEqual(types(verifier(lettre, faitsDe('PAT-002'))), [], 'rattachée à l\'autre Müller, aucune alerte : d\'où l\'importance de la date de naissance');
});

test('Fischer : lettre sans contradiction -> aucune fausse alerte', () => {
  const r = verifier(texteLettre(lettreDe('fischer')), faitsDe('PAT-007'));
  assert.deepEqual(r.contradictions, []);
  assert.match(r.texte, /Aucune contradiction détectée/);
  assert.match(r.texte, /ne remplace pas la relecture/);
});

test('anticoagulants : arrêt mentionné ou même substance -> pas d\'alerte', () => {
  const faits = faitsDe('PAT-001');
  assert.deepEqual(types(verifier('Therapie: Marcumar absetzen. Apixaban 5 mg, 1-0-1 ab sofort.', faits)), [], 'arrêt du Marcumar mentionné');
  assert.deepEqual(types(verifier('Therapie: Phenprocoumon 3 mg unverändert fortführen.', faits)), [], 'même substance (Marcumar = phenprocoumon)');
  assert.deepEqual(types(verifier('Therapie: Apixaban 5 mg, 1-0-1.', faitsDe('PAT-003'))), [], 'résident sans anticoagulant');
});

test('les protocoles généraux ne comptent pas comme le dossier du résident', () => {
  // Weber n'a ni insuffisance rénale ni anticoagulant : seul le protocole en parle
  assert.deepEqual(types(verifier('Therapie: Ibuprofen 400 mg, 1-0-1. Apixaban 5 mg.', faitsDe('PAT-003'))), []);
});

test('un médicament d\'une autre famille que l\'allergie ne déclenche rien', () => {
  assert.deepEqual(types(verifier('Therapie: Paracetamol 500 mg. Ibuprofen sans.', faitsDe('PAT-003'))), []);
  assert.deepEqual(types(verifier('Therapie: Azithromycin 500 mg.', faitsDe('PAT-003'))), []);
});

test('plusieurs contradictions dans la même lettre sont toutes signalées', () => {
  const faits = [...faitsDe('PAT-005'), { label: 'Logiciel de soins', texte: 'Allergies : Pénicilline (Urticaire)' }];
  const r = verifier('Therapie: Amoxicillin 1000 mg. Ibuprofen 600 mg. Niereninsuffizienz bekannt.', faits);
  assert.deepEqual(types(r), ['allergie', 'insuffisance_renale']);
  assert.equal(r.alertes.length, 2);
  assert.ok(r.alertes.every((a) => a.type === 'contradiction' && a.message.length > 20));
});

test('fusion avec le modèle : pas de doublon, alerte du modèle seul « à confirmer », oubli du modèle signalé', () => {
  const faits = faitsDe('PAT-003');
  const lettre = texteLettre(lettreDe('weber'));
  const contra = (type) => ({ type, gravite: 'haute', description: 'Détail du modèle', element_lettre: 'a', element_source: 'b', sources: ['[KIM (lettre de médecin)]', '[Logiciel de soins]'] });

  // le modèle voit la même allergie : une seule alerte (celle des règles)
  const memeType = verifier(lettre, faits, { texte: JSON.stringify({ contradictions: [contra('allergie')], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.equal(memeType.contradictions.length, 1);
  assert.equal(memeType.contradictions[0].origine, 'regles');

  // le modèle voit une autre contradiction, appuyée sur un vrai fait du dossier et un vrai passage de la lettre : ajoutée, « à confirmer »
  const appuyee = { ...contra('autre'), element_lettre: 'Ramipril 5 mg wird unverändert fortgeführt', element_source: 'Plan de médication : Ramipril 5 mg (1-0-0) pour Hypertension' };
  const autre = verifier(lettre, faits, { texte: JSON.stringify({ contradictions: [appuyee], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.equal(autre.contradictions.length, 2);
  assert.match(autre.contradictions.find((c) => c.origine === 'modele').description, /à confirmer/);
  assert.deepEqual(autre.contradictions.find((c) => c.origine === 'modele').sources, ['KIM (lettre de médecin)', 'Logiciel de soins'], 'les crochets des sources sont retirés');

  // le modèle invente une contradiction sans fait du dossier pour l'appuyer : écartée, et on le dit (pas de fausse alerte)
  const inventee = verifier(lettre, faits, { texte: JSON.stringify({ contradictions: [{ ...contra('autre'), element_lettre: 'Paracétamol 500 mg bei Bedarf', element_source: '' }], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.equal(inventee.contradictions.length, 1, 'seule la contradiction des règles reste');
  assert.ok(inventee.avertissements.some((a) => a.type === 'contradiction_modele_ecartee'));

  // le modèle ne voit rien (faux négatif réel) : les règles sauvent, et on le dit
  const aRate = verifier(lettre, faits);
  assert.equal(aRate.contradictions.length, 1);
  assert.ok(aRate.avertissements.some((a) => a.type === 'modele_a_rate'));
});

test('modèle indisponible ou JSON illisible : les règles suffisent, avertissements explicites', () => {
  const r = lancer(code, {
    noeuds: {
      'Choisir la lettre': [{ lettre: { texte: texteLettre(lettreDe('weber')), titre: 't', expediteur: 'e', ref: 'r', date: 'd' }, faits: faitsDe('PAT-003') }],
      'Rédiger (extraction)': [{ error: 'ECONNREFUSED' }],
      'Rédiger (comparaison)': [{ texte: 'pas du json', avertissements: [{ type: 'json_invalide', detail: 'x' }], modele: 'test' }],
    },
  })[0];
  assert.deepEqual(types(r), ['allergie']);
  assert.ok(r.avertissements.some((a) => a.type === 'extraction_indisponible'));
  assert.ok(r.avertissements.some((a) => a.type === 'json_invalide'));
});

test('Fischer : une contradiction inventée par le modèle ne crée pas de fausse alerte (cas réel du 25/10)', () => {
  const inventee = {
    type: 'autre', gravite: 'moyenne', description: 'Médicaments : Paracetamol 500 mg, bei Bedarf (debut)',
    element_lettre: 'Paracétamol 500 mg, bei Bedarf (debut)', element_source: '', sources: ['[KIM (lettre de médecin)]', '[Fichiers]'],
  };
  const r = verifier(texteLettre(lettreDe('fischer')), faitsDe('PAT-007'), { texte: JSON.stringify({ contradictions: [inventee], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.deepEqual(r.contradictions, []);
  assert.deepEqual(r.alertes, []);
  assert.ok(r.avertissements.some((a) => a.type === 'contradiction_modele_ecartee'));
});

test('les clés facultatives manquantes de l\'extraction ne sont pas montrées au soignant', () => {
  const r = lancer(code, {
    noeuds: {
      'Choisir la lettre': [{ lettre: { texte: 'Therapie: Paracetamol 500 mg.', titre: 't', expediteur: 'e', ref: 'r', date: 'd' }, faits: faitsDe('PAT-007') }],
      'Rédiger (extraction)': [{ texte: '{}', avertissements: [{ type: 'json_incomplet', detail: 'medicaments[0] : clé manquante « duree »' }], modele: 'test' }],
      'Rédiger (comparaison)': [{ texte: '{"contradictions":[],"aucune_contradiction":true}', avertissements: [], modele: 'test' }],
    },
  })[0];
  assert.deepEqual(r.avertissements, []);
});

test('le rapport est rédigé par le code, chaque ligne de contradiction cite ses sources entre crochets', () => {
  const r = verifier(texteLettre(lettreDe('schulz')), faitsDe('PAT-001'));
  const lignes = r.texte.split('\n');
  assert.match(lignes[0], /^Document analysé : Arztbrief test/);
  assert.match(lignes[1], /1 contradiction\(s\) à clarifier avec le médecin avant toute administration/);
  assert.match(lignes[2], /^1\. .+\[KIM \(lettre de médecin\)\] \[Logiciel de soins\]$/);
  assert.ok(r.sources.includes('KIM (lettre de médecin)') && r.sources.includes('Logiciel de soins'));
});

// ---- étape 3 du jour 4 : les règles répondent SEULES, sans aucune étape d'IA ----
function reglesSeules(texte, faits) {
  // « Règles seules » : aucun nœud « Rédiger » n'existe encore au moment de la réponse immédiate
  return lancer(jsCode('77-maitre-verifier.json', 'Règles seules'), {
    noeuds: { 'Choisir la lettre': [{ lettre: { texte, titre: 'Arztbrief test', expediteur: 'Dr. Test', ref: 'kim/test', date: '2026-10-23T08:00:00Z' }, faits }] },
  })[0];
}
test('réponse immédiate : les règles seules trouvent les 3 contradictions graves, sans étape d\'IA', () => {
  assert.deepEqual(types(reglesSeules(texteLettre(lettreDe('weber')), faitsDe('PAT-003'))), ['allergie']);
  assert.deepEqual(types(reglesSeules(texteLettre(lettreDe('schulz')), faitsDe('PAT-001'))), ['anticoagulation_double']);
  assert.deepEqual(types(reglesSeules(TEXTE_WAGNER, faitsDe('PAT-005'))), ['insuffisance_renale']);
});
test('réponse immédiate : sans contradiction (Fischer), aucune fausse alerte ; le texte ne parle pas de l\'IA tant qu\'elle n\'a pas tourné', () => {
  const r = reglesSeules(texteLettre(lettreDe('fischer')), faitsDe('PAT-007'));
  assert.deepEqual(types(r), []);
  assert.equal(r.ia_executee, false);
  assert.doesNotMatch(r.texte, /assistant IA/);
  assert.deepEqual(r.avertissements, [], 'aucun avertissement « indisponible » : l\'IA n\'a simplement pas encore tourné');
  assert.equal(r.prompt_versions, 'regles@1.0.0');
});
test('analyse complémentaire : les mêmes règles, plus ce que l\'IA ajoute (à confirmer) ; les règles ne changent pas', () => {
  const faits = faitsDe('PAT-003');
  const seules = reglesSeules(texteLettre(lettreDe('weber')), faits);
  const complet = verifier(texteLettre(lettreDe('weber')), faits);
  assert.equal(complet.ia_executee, true);
  assert.deepEqual(complet.contradictions.filter((c) => c.origine === 'regles'), seules.contradictions);
});
test('analyse complémentaire : si l\'IA échoue, les règles restent et l\'indisponibilité est signalée', () => {
  const r = verifier(texteLettre(lettreDe('weber')), faitsDe('PAT-003'), { avertissements: [] }); // pas de « texte » : étape en échec
  assert.deepEqual(types(r), ['allergie']);
  assert.ok(r.avertissements.some((a) => a.type === 'comparaison_indisponible'));
});
console.log(`\n${nb} tests réussis.`);
