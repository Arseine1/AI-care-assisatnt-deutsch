// Tests ohne n8n zur RELEVANZ der Fakten (Tag 4, Schritt 9): « Suchen » (Knoten « Fakten zusammenstellen ») stellt die
// Fakten nach vorn, die von der Anfrage der Pflegekraft handeln (Modus B), und gibt dem Modell KEINEN Fakt, wenn kein Fakt
// des Bewohners davon handelt (die Antwort lautet dann « Information nicht verfügbar », nie ein Fakt ohne Bezug).
// Start: node tests/pertinence.test.mjs   (nach node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { jsCode, lancer } from './lib/prompts-harness.mjs';

const code = jsCode('60-brique-chercher.json', 'Fakten zusammenstellen');
const heure = (m) => new Date(Date.parse('2026-10-25T06:00:00Z') - m * 60000).toISOString();

// Ein Bewohner mit vielen Fakten (mehr als die 8 behaltenen), von denen nur einer vom Fieber und ein anderer vom Gewicht handelt.
const notes = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, horodatage: heure(600 - i * 10), auteur: 'Pflegekraft Keller', categorie: 'observation', texte: `Beobachtung ${i + 1}: Körperpflege erledigt, Mahlzeit eingenommen, Stimmung stabil.` }));
notes.push({ id: 90, horodatage: heure(700), auteur: 'Pflegekraft Keller', categorie: 'observation', texte: 'Gewicht 71,2 kg heute Morgen, Urinausscheidung 900 ml in 24 Stunden.' });
const vitaux = [{ horodatage: heure(800), type: 'temperature', valeur: '37,9', unite: '°C' }];

function chercher(requete, filtrer = true, extra = {}) {
  return lancer(code, {
    noeuds: {
      'Parameter': [{ patient_id: 'PAT-003', depuis: heure(1440), jusqua: heure(0), requete, filtrer_requete: filtrer, protocoles: true, max_faits: 8, ...extra }],
      'Bewohner': [{ patient_id: 'PAT-003', civilite: 'Herr', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: ['Bluthochdruck'], allergies: ['Penicillin'], regime: 'normal', risques: ['Sturz'] }],
      'Andere Bewohner': [],
      'Notizen des Zeitraums': notes,
      'Vitalwerte des Zeitraums': vitaux,
      'Medikationsplan': [{ medicament: 'Ramipril', dosage: '5 mg', schema_prise: '1-0-0', indication: 'Bluthochdruck' }],
      'Qdrant Zeitraum': [{ result: [] }],
      'Qdrant Hintergrund': [{ result: [] }],
      'Qdrant Standards': [{ result: [{ payload: { source: 'fichier', source_label: 'Dateien', source_ref: 'fichiers/protocole-chutes.md', chunk_index: 0, type: 'protocole', theme: 'sturz', texte: 'Sturzprotokoll: neurologische Überwachung alle 2 Stunden.', date: null } }] }],
      'Qdrant Schreiben': [{ result: { points: [] } }],
    },
  })[0];
}
let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

test('Die Frage nach dem Fieber findet die Temperatur, auch unter mehr als 8 Fakten (Synonym)', () => {
  const r = chercher('Hat er Fieber?');
  assert.equal(r.faits.length, 8);
  assert.ok(r.faits.some((f) => /temperature 37,9/i.test(f.texte)), 'die Temperatur muss unter den Fakten sein');
  assert.equal(r.stats.aucune_correspondance, false);
});
test('Die Frage nach Gewicht und Ausscheidung findet die Notiz, die davon handelt', () => {
  const r = chercher('Wie sind Gewicht und Ausscheidung?');
  assert.ok(r.faits.some((f) => /71,2 kg/.test(f.texte)));
});
test('Ohne Relevanz (Modus A) hängen die Fakten nur von ihrer allgemeinen Wichtigkeit ab', () => {
  const r = chercher('Hat er Fieber?', false);
  assert.equal(r.stats.aucune_correspondance, false);
  assert.ok(r.faits.length > 0);
});
test('Ein Thema, das die Akte nicht erwähnt: Dem Modell wird KEIN Fakt gegeben', () => {
  for (const q of ['Welche Blutgruppe hat er?', 'Hatte er eine Darmspiegelung?', 'Trägt er eine Brille oder Zahnersatz?', 'Welche Religion hat er?']) {
    const r = chercher(q);
    assert.equal(r.faits.length, 0, `kein Fakt erwartet für « ${q} »`);
    assert.equal(r.stats.aucune_correspondance, true);
  }
});
test('Eine allgemeine Anfrage (kein bestimmtes Wort) behält die üblichen Fakten', () => {
  for (const q of ['Zusammenfassung der Nacht.', 'Wie war die Nacht?', 'Nenne mir die wichtigen Informationen']) {
    const r = chercher(q);
    assert.ok(r.faits.length > 0, `Fakten erwartet für « ${q} »`);
  }
});
test('« Person » findet nicht « Personal » (nur Endungen)', () => {
  const r = chercher('Hat er eine Person des Vertrauens benannt?', true, {});
  assert.equal(r.stats.aucune_correspondance, true);
});
test('Ein Protokoll erscheint als « Protokoll sturz » (und nicht als « Dateien »)', () => {
  const r = chercher('Was sagt das Protokoll zum Sturz?');
  const p = r.faits.find((f) => f.type === 'protocole');
  assert.ok(p, 'das Protokoll muss zu den Fakten gehören');
  assert.equal(p.label, 'Protokoll sturz');
});

test('Mehrere indexierte Sensoralarme bilden EINEN einzigen Fakt: Sie verdrängen die anderen nicht aus den 8 Plätzen', () => {
  const alarme = (i, h) => ({ payload: { source: 'capteurs', source_label: 'Sensoren', source_ref: `alarme-${i}`, chunk_index: 0, type: 'alarme', texte: `Sensoralarm (Sturz) am 27.10. um ${h}, Zimmer 12.`, date: heure(300 - i * 60) } });
  const base = lancer(code, {
    noeuds: {
      'Parameter': [{ patient_id: 'PAT-003', depuis: heure(1440), jusqua: heure(0), requete: 'x', filtrer_requete: false, protocoles: false, max_faits: 8 }],
      'Bewohner': [{ patient_id: 'PAT-003', civilite: 'Herr', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: ['Bluthochdruck'], allergies: ['Penicillin'], regime: 'normal', risques: ['Sturz'] }],
      'Andere Bewohner': [], 'Notizen des Zeitraums': notes, 'Vitalwerte des Zeitraums': vitaux, 'Medikationsplan': [],
      'Qdrant Zeitraum': [{ result: [alarme(1, '10:35 Uhr'), alarme(2, '13:35 Uhr'), alarme(3, '13:47 Uhr'), alarme(4, '14:02 Uhr')] }],
      'Qdrant Hintergrund': [{ result: [] }], 'Qdrant Standards': [{ result: [] }], 'Qdrant Schreiben': [{ result: { points: [] } }],
    },
  })[0];
  const fAlarmes = base.faits.filter((f) => f.label === 'Sensoren');
  assert.equal(fAlarmes.length, 1, 'ein einziger Fakt « Sensoren »');
  assert.match(fAlarmes[0].texte, /\(Sturz\) am 27\.10\. um 10:35 Uhr ; \(Sturz\) am 27\.10\. um 13:35 Uhr ; \(Sturz\) am 27\.10\. um 13:47 Uhr ; \(Sturz\) am 27\.10\. um 14:02 Uhr/);
  assert.ok(!/Zimmer 12/.test(fAlarmes[0].texte));
  assert.ok(base.faits.some((f) => /^Allergien/.test(f.texte)), 'Die Allergie bleibt unter den Fakten');
  assert.equal(base.faits.length, 8);
});

console.log(`\n${nb} Tests bestanden.`);
