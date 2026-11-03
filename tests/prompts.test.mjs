// Tests des 6 prompts SANS IA (instantanés) : structure des prompts, 3 cas de test par prompt, assemblage du
// template, réponses de référence validées par les contrôles. Les essais avec le vrai modèle sont dans
// tests/prompts-live.mjs (lents).
// Lancer : node tests/prompts.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { IDS_PROMPTS, prompts, chargerCas, assembler, controler, verifierAttendu, nomsResidents, referenceVersPhrases } from './lib/prompts-harness.mjs';

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

const P = prompts();

test('les 6 prompts du plan et le prompt du Mode B existent', () => {
  for (const id of IDS_PROMPTS) assert.ok(P[id], `prompt « ${id} » manquant`);
});

for (const id of IDS_PROMPTS) {
  const p = P[id];

  test(`${id} : version, sortie, paramètres et sections complets`, () => {
    assert.match(p.version, /^\d+\.\d+\.\d+$/, 'version sémantique');
    assert.ok(['texte', 'json', 'phrases'].includes(p.sortie));
    assert.equal(p.temperature, 0.1);
    assert.ok(p.heures >= 1 && p.heures <= 168);
    assert.ok(p.requete.length > 10);
    assert.equal(typeof p.protocoles, 'boolean');
    assert.ok(p.instruction.length > 100, 'instruction');
    assert.ok(p.format.length > 100, 'format de sortie');
    if (p.sortie === 'json') assert.ok(p.cles_json.length >= 2, 'un prompt JSON déclare ses clés');
  });

  test(`${id} : aucun exemple concret (heure, nom de résident) qui pourrait être recopié comme un fait`, () => {
    const texte = `${p.instruction}\n${p.format}`;
    assert.doesNotMatch(texte, /\b\d{1,2}h\d{2}\b/, 'heure en exemple');
    for (const nom of nomsResidents()) assert.doesNotMatch(texte, new RegExp(`\\b${nom}\\b`), `nom « ${nom} »`);
  });

  const { cas } = chargerCas(id);

  test(`${id} : exactement 3 cas de test (nominal, information manquante, piège)`, () => {
    assert.equal(cas.length, 3);
    assert.deepEqual(cas.map((c) => c.type).sort(), ['manquant', 'nominal', 'piege']);
    assert.equal(new Set(cas.map((c) => c.nom)).size, 3, 'noms distincts');
  });

  for (const c of cas) {
    const t = assembler(c, id);

    test(`${id} / ${c.type} : le template assemble 4 blocs, un seul résident, les faits seulement dans leur bloc`, () => {
      for (const m of ['[RÔLE ET RÈGLES]', '[FAITS DES SOURCES]', '[INSTRUCTION SOIGNANT]', '[FORMAT DE SORTIE]']) {
        assert.equal(t.prompt.split(m).length - 1, 1, `${m} une seule fois`);
      }
      assert.equal(t.prompt_id, id);
      assert.equal(t.prompt_version, p.version);
      assert.equal(t.nb_faits, c.faits.length);
      assert.equal(t.blocs.faits.split('Résident :').length - 1, 1);
      for (const f of c.faits) {
        assert.ok(!t.blocs.instruction.includes(f.texte.slice(0, 30)), 'un fait ne doit jamais se retrouver dans le bloc INSTRUCTION');
        assert.ok(!t.blocs.regles.includes(f.texte.slice(0, 30)), 'ni dans le bloc des règles');
      }
    });

    if (c.instruction_soignant) {
      test(`${id} / ${c.type} : la consigne du soignant ne va que dans le bloc INSTRUCTION SOIGNANT`, () => {
        assert.ok(t.blocs.instruction.includes(c.instruction_soignant), 'la consigne est dans le bloc INSTRUCTION');
        for (const bloc of ['regles', 'faits', 'format']) assert.ok(!t.blocs[bloc].includes(c.instruction_soignant), `la consigne ne doit pas être dans le bloc ${bloc}`);
      });
    }

    test(`${id} / ${c.type} : la réponse de référence est conforme (contrôles et attendus)`, () => {
      // sortie « phrases » : la référence est convertie en JSON comme le modèle le renverrait, puis le texte ASSEMBLÉ par le code est vérifié
      const phrases = p.sortie === 'phrases';
      const brute = phrases ? referenceVersPhrases(c, p) : c.reponse_reference;
      const controle = controler(brute, c, t, id);
      if (phrases) assert.deepEqual(controle.retirees, [], `une réponse de référence ne doit perdre aucune phrase : ${JSON.stringify(controle.retirees)}`);
      const echecs = verifierAttendu(phrases ? controle.texte : brute, c.attendu, controle);
      assert.deepEqual(echecs, [], `${c.nom} : ${echecs.join(' | ')}`);
    });
  }
}

test('extraire_faits : un médicament sans clé « duree » est signalé (schéma des listes)', () => {
  const { cas } = chargerCas('extraire_faits');
  const c = cas[0];
  const t = assembler(c, 'extraire_faits');
  const sansDuree = '{"patient":{"nom":"Weber","prenom":"Hans","naissance":"23.11.1941"},"diagnostics":[],"medicaments":[{"nom":"Amoxicillin","dose":"1000 mg","frequence":"1-0-1","action":"debut"}],"allergies_mentionnees":[],"autres_recommandations":[]}';
  const controle = controler(sansDuree, c, t, 'extraire_faits');
  assert.ok(controle.avertissements.some((a) => a.type === 'json_incomplet' && /duree/.test(a.detail)), JSON.stringify(controle.avertissements));
});
test('comparer : une liste de contradictions non vide avec aucune_contradiction=true est signalée (incohérence du modèle)', () => {
  const { cas } = chargerCas('comparer');
  const c = cas[0];
  const t = assembler(c, 'comparer');
  const incoherent = '{"contradictions":[{"type":"allergie","gravite":"haute","description":"x","element_lettre":"a","element_source":"b","sources":["ePA"]}],"aucune_contradiction":true}';
  assert.ok(controler(incoherent, c, t, 'comparer').avertissements.some((a) => a.type === 'json_incoherent'));
});
test('les contrôles repèrent bien une mauvaise réponse sur un cas réel (le test des tests)', () => {
  const { cas } = chargerCas('generer_sbar');
  const c = cas[0];
  const t = assembler(c, 'generer_sbar');
  const mauvaise = JSON.stringify({ phrases: [
    { r: 'S', t: 'Chute constatée à 10h13, tension élevée et pouls anormal.', f: 'F5' },
    { r: 'S', t: 'Mme Schulz va bien.', f: 'F5' },
    { r: 'B', t: "Allergie à l'amoxicilline.", f: 'F1' },
    { r: 'A', t: 'Tension 142/86 à 06h02.', f: 'F7' },
    { r: 'R', t: 'Surveillance neurologique toutes les 2 heures.', f: 'F9' },
  ] });
  const controle = controler(mauvaise, c, t, 'generer_sbar');
  const codes = controle.retirees.flatMap((r) => r.motifs.map((m) => m.code));
  for (const attendu of ['source_inconnue', 'valeur_absente', 'jugement_non_source', 'autre_resident', 'medicament_absent']) assert.ok(codes.includes(attendu), `devrait retirer pour ${attendu} (obtenu : ${codes})`);
  assert.match(controle.texte, /Tension 142\/86 à 06h02\. \[Logiciel de soins\]/, 'la phrase exacte est gardée');
  assert.doesNotMatch(controle.texte, /10h13|Schulz|amoxicilline/i, 'rien d\'inventé dans le texte');
});

console.log(`\n${nb} tests réussis.`);
