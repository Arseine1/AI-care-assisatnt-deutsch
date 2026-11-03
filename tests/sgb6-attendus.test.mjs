// Die 9 fiktiven Fragebögen laufen durch die Engine (dieselbe wie im simulierten Modus der Seite „Rentenbeiträge“):
// Jeder Status, jede Regel, jede Abweichung und jeder Beitrag muss data/sgb6/attendus.json entsprechen.
// Starten: node --test tests/sgb6-attendus.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerTraitement, etapeCalculer, etapeCaisse, etapeControler, etapeDeclaration, etapeRegles, extraireChamps, finaliserTraitement, traiterQuestionnaire } from '../workflows/code/sgb6/regles.js';

const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sgb6');
const lire = (f) => JSON.parse(readFileSync(join(dossier, f), 'utf8'));
const caisse = lire('caisse.json');
const attendus = lire('attendus.json');
const ids = readdirSync(join(dossier, 'questionnaires')).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, '')).sort();

test('9 Fragebögen, jeder mit seinem erwarteten Ergebnis', () => {
  assert.equal(ids.length, 9);
  assert.deepEqual(ids, Object.keys(attendus).filter((k) => !k.startsWith('_')).sort());
});

for (const id of ids) {
  test(`${id}: Status, Regeln, Abweichungen und Beitrag stimmen`, () => {
    const a = attendus[id];
    const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8'), { caisse, annee: 2026, id });
    assert.equal(r.statut, a.statut, `Status (${r.motifs.join(' | ')})`);
    for (const [nom, statut] of Object.entries(a.regles)) assert.equal(r.regles.find((x) => x.regle === nom).statut, statut, nom);
    assert.deepEqual(r.regles.filter((x) => x.regle === 'ECART').map((x) => x.champ), a.ecarts, 'Abweichungen');
    assert.equal(r.suspects.length > 0, a.suspect, 'verdächtiges Dokument');
    assert.equal(r.calcul?.cotisation ?? null, a.cotisation, 'Beitrag');
    assert.equal(r.calcul?.base ?? null, a.base, 'Basis');
    assert.equal(r.provisoire, a.provisoire, 'provisoire');
    assert.deepEqual(r.controle.erreurs.map((e) => e.champ), a.champs_en_erreur ?? [], 'fehlerhafte Felder');
    if (Object.values(a.regles).includes('non')) assert.equal(r.declaration, null, 'kein Entwurf, wenn eine Regel „non“ ist');
    else {
      assert.equal(r.declaration.length, 8, 'die Meldung enthält genau 8 Angaben');
      const degre = r.declaration.find((x) => x.cle === 'degre');
      assert.equal(degre.valeur, String(caisse.dossiers.find((c) => c.id === r.donnees.ref_caisse).degre), 'Pflegegrad aus der Akte der Kasse gelesen');
    }
    assert.equal(r.refus_possible, a.statut === 'exception');
  });
}

test('kein Meldungsentwurf für d, e und h; vorläufiger Entwurf für f, g und i', () => {
  for (const id of ids) {
    const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8'), { caisse, annee: 2026, id });
    if (/^[deh]-/.test(id)) assert.equal(r.declaration, null, id);
    else assert.equal(r.declaration.length, 8, id);
  }
});

test('Fall i: Der Grund „verdächtiges Dokument“ erscheint nur einmal', () => {
  const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', 'i-richter-piege.txt'), 'utf8'), { caisse, annee: 2026 });
  assert.equal(r.motifs.filter((m) => /verdächtig/i.test(m)).length, 1);
});

test('die Meldung von Fall a enthält die 8 Angaben nach § 44 Abs. 3 SGB XI', () => {
  const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', 'a-becker-clair.txt'), 'utf8'), { caisse, annee: 2026 });
  const d = Object.fromEntries(r.declaration.map((x) => [x.cle, x.valeur]));
  assert.deepEqual(Object.keys(d), ['numero_assurance', 'nom_prenoms', 'date_naissance', 'nationalite', 'adresse', 'periode_soins', 'degre', 'base_cotisation']);
  assert.equal(d.numero_assurance, '21 140371 B 523'.replace(/ /g, ''));
  assert.equal(d.nom_prenoms, 'Becker, Anna');
  assert.equal(d.date_naissance, '14.03.1971');
  assert.equal(d.periode_soins, '01.11.2025 – laufend');
  assert.equal(d.base_cotisation, '1.700,65 €');
});

test('der präparierte Fragebogen hat keine Wirkung: gleiches Rechenergebnis wie ohne den Satz, aber gemeldet', () => {
  const brut = readFileSync(join(dossier, 'questionnaires', 'i-richter-piege.txt'), 'utf8');
  const avec = traiterQuestionnaire(brut, { caisse, annee: 2026 });
  const sans = traiterQuestionnaire(brut.replace(/^Bemerkung:.*$/m, ''), { caisse, annee: 2026 });
  assert.equal(avec.statut, 'exception');
  assert.equal(sans.statut, 'pret_a_valider');
  assert.equal(avec.calcul.cotisation, sans.calcul.cotisation);
  assert.deepEqual(avec.regles, sans.regles);
});

test('von der KI gelesene Werte: kein Betrag (auch kein vorläufiger), solange noch etwas zu prüfen ist; sauberer Fall unverändert', () => {
  const de = (id) => readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8');
  const parIA = (id) => traiterQuestionnaire(de(id), { caisse, annee: 2026, id, lu: { ...extraireChamps(de(id)), par_ia: true } });
  // g (Abweichung beim Pflegegrad), f (falsche Nummer), i (verdächtiges Dokument): vorläufiger Betrag mit den Regeln, KEIN Betrag mit der KI
  for (const id of ['g-wolf-ecart-degre', 'f-schaefer-numero-faux', 'i-richter-piege']) {
    const r = parIA(id);
    assert.equal(r.calcul, null, id);
    assert.equal(r.provisoire, false, id);
    assert.equal(r.calcul_motif, 'donnees_a_verifier', id);
    assert.equal(r.statut, 'exception', id);
    assert.equal(r.declaration.find((x) => x.cle === 'base_cotisation').valeur, 'Betrag nicht berechnet: Daten sind zu prüfen.', id);
    assert.ok(r.motifs.some((m) => m.startsWith('Betrag nicht berechnet: Daten sind zu prüfen.')), id);
    assert.equal(r.declaration.find((x) => x.cle === 'degre').valeur, String(caisse.dossiers.find((c) => c.id === r.donnees.ref_caisse).degre), `${id}: Pflegegrad der Kasse`);
  }
  // Fall b mit einem falsch gelesenen Anteil (gleiche Anteile angewendet, R6 „zu prüfen“): kein Betrag von 312,64 €
  const b = de('b-krueger-degre5-combinee').replace(/^Weitere Pflegepersonen:.*$/m, 'Weitere Pflegepersonen: Krüger, Paul');
  const rb = traiterQuestionnaire(b, { caisse, annee: 2026, lu: { ...extraireChamps(b), par_ia: true } });
  assert.equal(rb.regles.find((x) => x.regle === 'R6').statut, 'incertain');
  assert.equal(rb.calcul, null);
  // sauberer Fall, von der KI gelesen: Der Betrag wird wie zuvor berechnet
  const a = parIA('a-becker-clair');
  assert.equal(a.statut, 'pret_a_valider');
  assert.equal(a.calcul.cotisation, 316.32);
  // Regel „non“: eigener calcul_motif
  assert.equal(parIA('d-lehmann-8-heures').calcul_motif, 'regle_non_remplie');
});

test('die einzeln aneinandergereihten Schritte 3 bis 7 (Zustand als JSON, wie zwischen den n8n-Knoten) ergeben dasselbe Ergebnis wie die Bearbeitung in einem Block', () => {
  for (const id of ids) {
    const texte = readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8');
    const copie = (e) => JSON.parse(JSON.stringify(e)); // n8n serialisiert den Zustand zwischen zwei Knoten
    let e = copie(demarrerTraitement(texte, { annee: 2026, id }));
    const lignes = [];
    for (const etape of [etapeControler, (x) => etapeCaisse(x, caisse), etapeRegles, etapeCalculer, etapeDeclaration]) {
      e = copie(etape(e));
      lignes.push(e.journal.at(-1).etape); // die Protokollzeile DIESES Schritts ist die letzte
    }
    assert.deepEqual(lignes, ['controler', 'caisse', 'regles', 'calculer', 'declaration']);
    const pasAPas = finaliserTraitement(e);
    const dUnBloc = traiterQuestionnaire(texte, { caisse, annee: 2026, id });
    const sansDuree = (r) => ({ ...r, journal: r.journal.map(({ duree_ms, ...x }) => x) });
    assert.deepEqual(sansDuree(pasAPas), sansDuree(dUnBloc), id);
  }
});