// Tests des REGELNETZES « Dokument prüfen » (workflows/77-maitre-verifier.json, Knoten « Nur Regeln » und « Regeln und Zusammenführung »).
// Diese Regeln hängen nicht vom Sprachmodell ab: Sie lesen den Text des Schreibens und die Fakten der Akte.
// Starten: node tests/regles.test.mjs   (nach node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { jsCode, lancer } from './lib/prompts-harness.mjs';
import { residents } from '../data/source/residents.mjs';
import { LETTRES } from '../data/source/lettres.mjs';

const code = jsCode('77-maitre-verifier.json', 'Regeln und Zusammenführung');

// Fakten der Akte eines Bewohners, so wie « Suchen » sie erzeugt (Quelle « Pflegesoftware »).
function faitsDe(id) {
  const r = residents.find((x) => x.id === id);
  const liste = (a, vide) => (a.length ? a.join(' ; ') : vide);
  return [
    { label: 'Pflegesoftware', texte: `Diagnosen: ${liste(r.diagnostics.map((d) => d.libelle), 'keine')}` },
    { label: 'Pflegesoftware', texte: `Allergien: ${liste(r.allergies.map((a) => `${a.substance} (${a.reaction})`), 'keine bekannt')}` },
    { label: 'Pflegesoftware', texte: `Risiken: ${liste(r.risques, 'keine gemeldet')}` },
    { label: 'Pflegesoftware', texte: `Medikationsplan: ${r.medication.map((m) => `${m.nom} ${m.dosage} (${m.schema})`).join(' ; ')}` },
    // ein allgemeines Protokoll beschreibt den Bewohner nicht: Es darf allein keine Regel auslösen
    { label: 'Dateien', texte: 'Protokoll Antikoagulanzien: Marcumar, Apixaban, Rivaroxaban. Protokoll NSAR: chronische Niereninsuffizienz, Ibuprofen, Diclofenac.' },
  ];
}
const texteLettre = (l) => `${l.expediteur.nom}. Arztbrief. Patient: ${l.patient}. ${l.corps.map(([t, x]) => `${t}: ${x}`).join(' ')}`;
const lettreDe = (nom) => LETTRES.find((l) => l.fichier === `arztbrief-${nom}.pdf`);
// Eingescanntes Schreiben von Herrn Wagner, so wie die OCR es liest (siehe data/scripts/generer-lettres.mjs)
const TEXTE_WAGNER =
  'Dr. med. Peter Neumann Hausarzt, Allgemeinmedizin An: Pflegeheim Haus Sonnenhof (KIM) Arztbrief Patient: Herr Otto Wagner, geb. 05.08.1936 Diagnose: Lumbalgie, chronische Niereninsuffizienz bekannt. Therapie: Ibuprofen 600 mg, 1-1-1, ueber 10 Tage. Magenschutz mit Pantoprazol 40 mg, 1-0-0.';

function verifier(texte, faits, modele = { texte: '{"contradictions":[],"aucune_contradiction":true}', avertissements: [], modele: 'test', prompt_version: '1.0.1' }) {
  return lancer(code, {
    noeuds: {
      'Schreiben wählen': [{ lettre: { texte, titre: 'Arztbrief test', expediteur: 'Dr. Test', ref: 'kim/test', date: '2026-10-23T08:00:00Z' }, faits }],
      'Verfassen (Extraktion)': [{ texte: '', avertissements: [], prompt_version: '1.0.1' }],
      'Verfassen (Vergleich)': [modele],
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

test('Weber: Amoxicillin + Penicillin-Allergie -> allergie (hoch)', () => {
  const r = verifier(texteLettre(lettreDe('weber')), faitsDe('PAT-003'));
  assert.deepEqual(types(r), ['allergie']);
  assert.equal(r.contradictions[0].gravite, 'haute');
  assert.match(r.contradictions[0].element_lettre, /Amoxicillin/);
  assert.match(r.contradictions[0].element_source, /Penicillin/);
  assert.deepEqual(r.contradictions[0].sources, ['KIM (Arztbrief)', 'Pflegesoftware']);
});

test('Schulz: Apixaban, obwohl Marcumar nicht abgesetzt ist -> anticoagulation_double', () => {
  const r = verifier(texteLettre(lettreDe('schulz')), faitsDe('PAT-001'));
  assert.deepEqual(types(r), ['anticoagulation_double']);
  assert.match(r.contradictions[0].description, /apixaban/i);
  assert.match(r.contradictions[0].element_source, /Marcumar/);
});

test('Wagner (eingescanntes Schreiben): Ibuprofen + Niereninsuffizienz -> insuffisance_renale', () => {
  const r = verifier(TEXTE_WAGNER, faitsDe('PAT-005'));
  assert.deepEqual(types(r), ['insuffisance_renale']);
  assert.match(r.contradictions[0].element_lettre, /Ibuprofen/);
});

test('Müller: das Schreiben hat nur für den richtigen Müller einen Widerspruch (den mit der Sulfonamid-Allergie)', () => {
  const lettre = texteLettre(lettreDe('mueller')); // Cotrimoxazol, geboren am 01.12.1947 = Zimmer 21
  assert.deepEqual(types(verifier(lettre, faitsDe('PAT-006'))), ['allergie']);
  assert.deepEqual(types(verifier(lettre, faitsDe('PAT-002'))), [], 'dem anderen Müller zugeordnet, keine Meldung: daher die Bedeutung des Geburtsdatums');
});

test('Fischer: Schreiben ohne Widerspruch -> keine falsche Meldung', () => {
  const r = verifier(texteLettre(lettreDe('fischer')), faitsDe('PAT-007'));
  assert.deepEqual(r.contradictions, []);
  assert.match(r.texte, /Kein Widerspruch von den Kontrollregeln erkannt/);
  assert.match(r.texte, /ersetzt nicht die Durchsicht/);
});

test('Antikoagulanzien: erwähntes Absetzen oder derselbe Wirkstoff -> keine Meldung', () => {
  const faits = faitsDe('PAT-001');
  assert.deepEqual(types(verifier('Therapie: Marcumar absetzen. Apixaban 5 mg, 1-0-1 ab sofort.', faits)), [], 'Absetzen von Marcumar erwähnt');
  assert.deepEqual(types(verifier('Therapie: Phenprocoumon 3 mg unverändert fortführen.', faits)), [], 'derselbe Wirkstoff (Marcumar = Phenprocoumon)');
  assert.deepEqual(types(verifier('Therapie: Apixaban 5 mg, 1-0-1.', faitsDe('PAT-003'))), [], 'Bewohner ohne Antikoagulans');
});

test('allgemeine Protokolle zählen nicht als Akte des Bewohners', () => {
  // Weber hat weder Niereninsuffizienz noch ein Antikoagulans: Nur das Protokoll spricht davon
  assert.deepEqual(types(verifier('Therapie: Ibuprofen 400 mg, 1-0-1. Apixaban 5 mg.', faitsDe('PAT-003'))), []);
});

test('ein Medikament aus einer anderen Familie als die Allergie löst nichts aus', () => {
  assert.deepEqual(types(verifier('Therapie: Paracetamol 500 mg. Ibuprofen ohne.', faitsDe('PAT-003'))), []);
  assert.deepEqual(types(verifier('Therapie: Azithromycin 500 mg.', faitsDe('PAT-003'))), []);
});

test('mehrere Widersprüche im selben Schreiben werden alle gemeldet', () => {
  const faits = [...faitsDe('PAT-005'), { label: 'Pflegesoftware', texte: 'Allergien: Penicillin (Urtikaria)' }];
  const r = verifier('Therapie: Amoxicillin 1000 mg. Ibuprofen 600 mg. Niereninsuffizienz bekannt.', faits);
  assert.deepEqual(types(r), ['allergie', 'insuffisance_renale']);
  assert.equal(r.alertes.length, 2);
  assert.ok(r.alertes.every((a) => a.type === 'contradiction' && a.message.length > 20));
});

test('Zusammenführung mit dem Modell: keine Doppelung, Meldung nur des Modells « zu prüfen », Versäumnis des Modells gemeldet', () => {
  const faits = faitsDe('PAT-003');
  const lettre = texteLettre(lettreDe('weber'));
  const contra = (type) => ({ type, gravite: 'haute', description: 'Detail des Modells', element_lettre: 'a', element_source: 'b', sources: ['[KIM (Arztbrief)]', '[Pflegesoftware]'] });

  // das Modell sieht dieselbe Allergie: eine einzige Meldung (die der Regeln)
  const memeType = verifier(lettre, faits, { texte: JSON.stringify({ contradictions: [contra('allergie')], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.equal(memeType.contradictions.length, 1);
  assert.equal(memeType.contradictions[0].origine, 'regles');

  // das Modell sieht einen anderen Widerspruch, gestützt auf einen echten Fakt der Akte und eine echte Stelle des Schreibens: hinzugefügt, « zu prüfen »
  const appuyee = { ...contra('autre'), element_lettre: 'Ramipril 5 mg wird unverändert fortgeführt', element_source: 'Medikationsplan: Ramipril 5 mg (1-0-0) bei Hypertonie' };
  const autre = verifier(lettre, faits, { texte: JSON.stringify({ contradictions: [appuyee], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.equal(autre.contradictions.length, 2);
  assert.match(autre.contradictions.find((c) => c.origine === 'modele').description, /zu prüfen/);
  assert.deepEqual(autre.contradictions.find((c) => c.origine === 'modele').sources, ['KIM (Arztbrief)', 'Pflegesoftware'], 'die eckigen Klammern der Quellen werden entfernt');

  // das Modell erfindet einen Widerspruch ohne stützenden Fakt der Akte: verworfen, und das wird gesagt (keine falsche Meldung)
  const inventee = verifier(lettre, faits, { texte: JSON.stringify({ contradictions: [{ ...contra('autre'), element_lettre: 'Paracetamol 500 mg bei Bedarf', element_source: '' }], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.equal(inventee.contradictions.length, 1, 'nur der Widerspruch der Regeln bleibt');
  assert.ok(inventee.avertissements.some((a) => a.type === 'contradiction_modele_ecartee'));

  // das Modell sieht nichts (echtes falsch Negatives): die Regeln retten, und das wird gesagt
  const aRate = verifier(lettre, faits);
  assert.equal(aRate.contradictions.length, 1);
  assert.ok(aRate.avertissements.some((a) => a.type === 'modele_a_rate'));
});

test('Modell nicht verfügbar oder JSON unlesbar: die Regeln genügen, ausdrückliche Warnungen', () => {
  const r = lancer(code, {
    noeuds: {
      'Schreiben wählen': [{ lettre: { texte: texteLettre(lettreDe('weber')), titre: 't', expediteur: 'e', ref: 'r', date: 'd' }, faits: faitsDe('PAT-003') }],
      'Verfassen (Extraktion)': [{ error: 'ECONNREFUSED' }],
      'Verfassen (Vergleich)': [{ texte: 'kein json', avertissements: [{ type: 'json_invalide', detail: 'x' }], modele: 'test' }],
    },
  })[0];
  assert.deepEqual(types(r), ['allergie']);
  assert.ok(r.avertissements.some((a) => a.type === 'extraction_indisponible'));
  assert.ok(r.avertissements.some((a) => a.type === 'json_invalide'));
});

test('Fischer: ein vom Modell erfundener Widerspruch erzeugt keine falsche Meldung (realer Fall vom 25.10.)', () => {
  const inventee = {
    type: 'autre', gravite: 'moyenne', description: 'Medikamente: Paracetamol 500 mg, bei Bedarf (debut)',
    element_lettre: 'Paracetamol 500 mg, bei Bedarf (debut)', element_source: '', sources: ['[KIM (Arztbrief)]', '[Dateien]'],
  };
  const r = verifier(texteLettre(lettreDe('fischer')), faitsDe('PAT-007'), { texte: JSON.stringify({ contradictions: [inventee], aucune_contradiction: false }), avertissements: [], modele: 'test' });
  assert.deepEqual(r.contradictions, []);
  assert.deepEqual(r.alertes, []);
  assert.ok(r.avertissements.some((a) => a.type === 'contradiction_modele_ecartee'));
});

test('fehlende optionale Schlüssel der Extraktion werden der Pflegekraft nicht gezeigt', () => {
  const r = lancer(code, {
    noeuds: {
      'Schreiben wählen': [{ lettre: { texte: 'Therapie: Paracetamol 500 mg.', titre: 't', expediteur: 'e', ref: 'r', date: 'd' }, faits: faitsDe('PAT-007') }],
      'Verfassen (Extraktion)': [{ texte: '{}', avertissements: [{ type: 'json_incomplet', detail: 'medicaments[0]: Schlüssel « duree » fehlt' }], modele: 'test' }],
      'Verfassen (Vergleich)': [{ texte: '{"contradictions":[],"aucune_contradiction":true}', avertissements: [], modele: 'test' }],
    },
  })[0];
  assert.deepEqual(r.avertissements, []);
});

test('der Bericht wird vom Code verfasst, jede Widerspruchszeile nennt ihre Quellen in eckigen Klammern', () => {
  const r = verifier(texteLettre(lettreDe('schulz')), faitsDe('PAT-001'));
  const lignes = r.texte.split('\n');
  assert.match(lignes[0], /^Analysiertes Dokument: Arztbrief test/);
  assert.match(lignes[1], /1 Widerspruch\/Widersprüche vor jeder Verabreichung mit der Ärztin oder dem Arzt zu klären/);
  assert.match(lignes[2], /^1\. .+\[KIM \(Arztbrief\)\] \[Pflegesoftware\]$/);
  assert.ok(r.sources.includes('KIM (Arztbrief)') && r.sources.includes('Pflegesoftware'));
});

// ---- Schritt 3 von Tag 4: die Regeln antworten ALLEIN, ohne jeden KI-Schritt ----
function reglesSeules(texte, faits) {
  // « Nur Regeln »: Zum Zeitpunkt der sofortigen Antwort existiert noch kein Knoten « Verfassen »
  return lancer(jsCode('77-maitre-verifier.json', 'Nur Regeln'), {
    noeuds: { 'Schreiben wählen': [{ lettre: { texte, titre: 'Arztbrief test', expediteur: 'Dr. Test', ref: 'kim/test', date: '2026-10-23T08:00:00Z' }, faits }] },
  })[0];
}
test('sofortige Antwort: die Regeln allein finden die 3 schweren Widersprüche, ohne KI-Schritt', () => {
  assert.deepEqual(types(reglesSeules(texteLettre(lettreDe('weber')), faitsDe('PAT-003'))), ['allergie']);
  assert.deepEqual(types(reglesSeules(texteLettre(lettreDe('schulz')), faitsDe('PAT-001'))), ['anticoagulation_double']);
  assert.deepEqual(types(reglesSeules(TEXTE_WAGNER, faitsDe('PAT-005'))), ['insuffisance_renale']);
});
test('sofortige Antwort: ohne Widerspruch (Fischer) keine falsche Meldung; der Text spricht nicht von der KI, solange sie nicht gelaufen ist', () => {
  const r = reglesSeules(texteLettre(lettreDe('fischer')), faitsDe('PAT-007'));
  assert.deepEqual(types(r), []);
  assert.equal(r.ia_executee, false);
  assert.doesNotMatch(r.texte, /KI-Assistent/);
  assert.deepEqual(r.avertissements, [], 'keine Warnung « nicht verfügbar »: Die KI ist einfach noch nicht gelaufen');
  assert.equal(r.prompt_versions, 'regles@1.0.0');
});
test('zusätzliche Analyse: dieselben Regeln, plus das, was die KI hinzufügt (zu prüfen); die Regeln ändern sich nicht', () => {
  const faits = faitsDe('PAT-003');
  const seules = reglesSeules(texteLettre(lettreDe('weber')), faits);
  const complet = verifier(texteLettre(lettreDe('weber')), faits);
  assert.equal(complet.ia_executee, true);
  assert.deepEqual(complet.contradictions.filter((c) => c.origine === 'regles'), seules.contradictions);
});
test('zusätzliche Analyse: Schlägt die KI fehl, bleiben die Regeln erhalten und die Nichtverfügbarkeit wird gemeldet', () => {
  const r = verifier(texteLettre(lettreDe('weber')), faitsDe('PAT-003'), { avertissements: [] }); // kein « texte »: Schritt fehlgeschlagen
  assert.deepEqual(types(r), ['allergie']);
  assert.ok(r.avertissements.some((a) => a.type === 'comparaison_indisponible'));
});
console.log(`\n${nb} Tests bestanden.`);
