// Les 9 questionnaires fictifs passent dans le moteur (le même que celui du mode simulé de la page « Cotisations retraite »):
// chaque statut, chaque règle, chaque écart et chaque cotisation doit être conforme à data/sgb6/attendus.json.
// Lancer : node --test tests/sgb6-attendus.test.mjs
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

test('9 questionnaires, chacun avec son résultat attendu', () => {
  assert.equal(ids.length, 9);
  assert.deepEqual(ids, Object.keys(attendus).filter((k) => !k.startsWith('_')).sort());
});

for (const id of ids) {
  test(`${id} : statut, règles, écarts et cotisation conformes`, () => {
    const a = attendus[id];
    const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8'), { caisse, annee: 2026, id });
    assert.equal(r.statut, a.statut, `statut (${r.motifs.join(' | ')})`);
    for (const [nom, statut] of Object.entries(a.regles)) assert.equal(r.regles.find((x) => x.regle === nom).statut, statut, nom);
    assert.deepEqual(r.regles.filter((x) => x.regle === 'ECART').map((x) => x.champ), a.ecarts, 'écarts');
    assert.equal(r.suspects.length > 0, a.suspect, 'document suspect');
    assert.equal(r.calcul?.cotisation ?? null, a.cotisation, 'cotisation');
    assert.equal(r.calcul?.base ?? null, a.base, 'base');
    assert.equal(r.provisoire, a.provisoire, 'provisoire');
    assert.deepEqual(r.controle.erreurs.map((e) => e.champ), a.champs_en_erreur ?? [], 'champs en erreur');
    if (Object.values(a.regles).includes('non')) assert.equal(r.declaration, null, 'pas de brouillon quand une règle est « non »');
    else {
      assert.equal(r.declaration.length, 8, 'la déclaration contient exactement 8 données');
      const degre = r.declaration.find((x) => x.cle === 'degre');
      assert.equal(degre.valeur, String(caisse.dossiers.find((c) => c.id === r.donnees.ref_caisse).degre), 'degré lu dans le dossier de la caisse');
    }
    assert.equal(r.refus_possible, a.statut === 'exception');
  });
}

test('pas de brouillon de déclaration pour d, e et h ; brouillon provisoire pour f, g et i', () => {
  for (const id of ids) {
    const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8'), { caisse, annee: 2026, id });
    if (/^[deh]-/.test(id)) assert.equal(r.declaration, null, id);
    else assert.equal(r.declaration.length, 8, id);
  }
});

test('cas i : le motif « document suspect » n\'apparaît qu\'une fois', () => {
  const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', 'i-richter-piege.txt'), 'utf8'), { caisse, annee: 2026 });
  assert.equal(r.motifs.filter((m) => /suspect/i.test(m)).length, 1);
});

test('la déclaration du cas a reprend les 8 données du § 44 Abs. 3 SGB XI', () => {
  const r = traiterQuestionnaire(readFileSync(join(dossier, 'questionnaires', 'a-becker-clair.txt'), 'utf8'), { caisse, annee: 2026 });
  const d = Object.fromEntries(r.declaration.map((x) => [x.cle, x.valeur]));
  assert.deepEqual(Object.keys(d), ['numero_assurance', 'nom_prenoms', 'date_naissance', 'nationalite', 'adresse', 'periode_soins', 'degre', 'base_cotisation']);
  assert.equal(d.numero_assurance, '21 140371 B 523'.replace(/ /g, ''));
  assert.equal(d.nom_prenoms, 'Becker, Anna');
  assert.equal(d.date_naissance, '14.03.1971');
  assert.equal(d.periode_soins, '01.11.2025 – en cours');
  assert.equal(d.base_cotisation, '1 700,65 €');
});

test('le questionnaire piégé n\'a aucun effet : même résultat de calcul que sans la phrase, mais signalé', () => {
  const brut = readFileSync(join(dossier, 'questionnaires', 'i-richter-piege.txt'), 'utf8');
  const avec = traiterQuestionnaire(brut, { caisse, annee: 2026 });
  const sans = traiterQuestionnaire(brut.replace(/^Bemerkung:.*$/m, ''), { caisse, annee: 2026 });
  assert.equal(avec.statut, 'exception');
  assert.equal(sans.statut, 'pret_a_valider');
  assert.equal(avec.calcul.cotisation, sans.calcul.cotisation);
  assert.deepEqual(avec.regles, sans.regles);
});

test('valeurs lues par l\'IA : aucun montant (même provisoire) tant que quelque chose reste à vérifier ; cas propre inchangé', () => {
  const de = (id) => readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8');
  const parIA = (id) => traiterQuestionnaire(de(id), { caisse, annee: 2026, id, lu: { ...extraireChamps(de(id)), par_ia: true } });
  // g (écart de degré), f (numéro faux), i (document suspect) : montant provisoire avec les règles, AUCUN montant avec l'IA
  for (const id of ['g-wolf-ecart-degre', 'f-schaefer-numero-faux', 'i-richter-piege']) {
    const r = parIA(id);
    assert.equal(r.calcul, null, id);
    assert.equal(r.provisoire, false, id);
    assert.equal(r.calcul_motif, 'donnees_a_verifier', id);
    assert.equal(r.statut, 'exception', id);
    assert.equal(r.declaration.find((x) => x.cle === 'base_cotisation').valeur, 'Montant non calculé : données à vérifier', id);
    assert.ok(r.motifs.some((m) => m.startsWith('Montant non calculé : données à vérifier')), id);
    assert.equal(r.declaration.find((x) => x.cle === 'degre').valeur, String(caisse.dossiers.find((c) => c.id === r.donnees.ref_caisse).degre), `${id} : degré de la caisse`);
  }
  // cas b avec une part mal lue (parts égales appliquées, R6 « à vérifier ») : pas de 312,64 €
  const b = de('b-krueger-degre5-combinee').replace(/^Weitere Pflegepersonen:.*$/m, 'Weitere Pflegepersonen: Krüger, Paul');
  const rb = traiterQuestionnaire(b, { caisse, annee: 2026, lu: { ...extraireChamps(b), par_ia: true } });
  assert.equal(rb.regles.find((x) => x.regle === 'R6').statut, 'incertain');
  assert.equal(rb.calcul, null);
  // cas propre lu par l'IA : le montant est calculé comme avant
  const a = parIA('a-becker-clair');
  assert.equal(a.statut, 'pret_a_valider');
  assert.equal(a.calcul.cotisation, 316.32);
  // règle « non » : calcul_motif distinct
  assert.equal(parIA('d-lehmann-8-heures').calcul_motif, 'regle_non_remplie');
});

test('les étapes 3 à 7 enchaînées une à une (état en JSON, comme entre les nœuds de n8n) donnent le même résultat que le traitement d\'un bloc', () => {
  for (const id of ids) {
    const texte = readFileSync(join(dossier, 'questionnaires', `${id}.txt`), 'utf8');
    const copie = (e) => JSON.parse(JSON.stringify(e)); // n8n sérialise l'état entre deux nœuds
    let e = copie(demarrerTraitement(texte, { annee: 2026, id }));
    const lignes = [];
    for (const etape of [etapeControler, (x) => etapeCaisse(x, caisse), etapeRegles, etapeCalculer, etapeDeclaration]) {
      e = copie(etape(e));
      lignes.push(e.journal.at(-1).etape); // la ligne de journal de CETTE étape est la dernière
    }
    assert.deepEqual(lignes, ['controler', 'caisse', 'regles', 'calculer', 'declaration']);
    const pasAPas = finaliserTraitement(e);
    const dUnBloc = traiterQuestionnaire(texte, { caisse, annee: 2026, id });
    const sansDuree = (r) => ({ ...r, journal: r.journal.map(({ duree_ms, ...x }) => x) });
    assert.deepEqual(sansDuree(pasAPas), sansDuree(dUnBloc), id);
  }
});