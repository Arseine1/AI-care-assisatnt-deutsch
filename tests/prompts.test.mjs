// Tests der 6 Prompts OHNE KI (sofort): Struktur der Prompts, 3 Testfälle je Prompt, Zusammensetzung der
// Vorlage, Referenzantworten, die durch die Kontrollen bestätigt werden. Die Versuche mit dem echten Modell stehen in
// tests/prompts-live.mjs (langsam).
// Starten: node tests/prompts.test.mjs   (nach node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { IDS_PROMPTS, prompts, chargerCas, assembler, controler, verifierAttendu, nomsResidents, referenceVersPhrases } from './lib/prompts-harness.mjs';

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

const P = prompts();

test('die 6 Prompts des Plans und der Prompt des Modus B existieren', () => {
  for (const id of IDS_PROMPTS) assert.ok(P[id], `Prompt « ${id} » fehlt`);
});

for (const id of IDS_PROMPTS) {
  const p = P[id];

  test(`${id}: Version, Ausgabe, Parameter und Rubriken vollständig`, () => {
    assert.match(p.version, /^\d+\.\d+\.\d+$/, 'semantische Version');
    assert.ok(['texte', 'json', 'phrases'].includes(p.sortie));
    assert.equal(p.temperature, 0.1);
    assert.ok(p.heures >= 1 && p.heures <= 168);
    assert.ok(p.requete.length > 10);
    assert.equal(typeof p.protocoles, 'boolean');
    assert.ok(p.instruction.length > 100, 'Anweisung');
    assert.ok(p.format.length > 100, 'Ausgabeformat');
    if (p.sortie === 'json') assert.ok(p.cles_json.length >= 2, 'ein JSON-Prompt deklariert seine Schlüssel');
  });

  test(`${id}: kein konkretes Beispiel (Uhrzeit, Name eines Bewohners), das wie ein Fakt abgeschrieben werden könnte`, () => {
    const texte = `${p.instruction}\n${p.format}`;
    assert.doesNotMatch(texte, /\b\d{1,2}h\d{2}\b/, 'Uhrzeit im Beispiel (französische Schreibweise)');
    assert.doesNotMatch(texte, /\b\d{1,2}:\d{2}\s*Uhr\b/, 'Uhrzeit im Beispiel');
    for (const nom of nomsResidents()) assert.doesNotMatch(texte, new RegExp(`\\b${nom}\\b`), `Name « ${nom} »`);
  });

  const { cas } = chargerCas(id);

  test(`${id}: genau 3 Testfälle (nominal, fehlende Information, Falle)`, () => {
    assert.equal(cas.length, 3);
    assert.deepEqual(cas.map((c) => c.type).sort(), ['manquant', 'nominal', 'piege']);
    assert.equal(new Set(cas.map((c) => c.nom)).size, 3, 'verschiedene Namen');
  });

  for (const c of cas) {
    const t = assembler(c, id);

    test(`${id} / ${c.type}: die Vorlage setzt 4 Blöcke zusammen, nur ein Bewohner, die Fakten nur in ihrem Block`, () => {
      for (const m of ['[ROLLE UND REGELN]', '[QUELLENFAKTEN]', '[ANWEISUNG PFLEGEKRAFT]', '[AUSGABEFORMAT]']) {
        assert.equal(t.prompt.split(m).length - 1, 1, `${m} nur einmal`);
      }
      assert.equal(t.prompt_id, id);
      assert.equal(t.prompt_version, p.version);
      assert.equal(t.nb_faits, c.faits.length);
      assert.equal(t.blocs.faits.split('Bewohner:').length - 1, 1);
      for (const f of c.faits) {
        assert.ok(!t.blocs.instruction.includes(f.texte.slice(0, 30)), 'ein Fakt darf nie im Block ANWEISUNG landen');
        assert.ok(!t.blocs.regles.includes(f.texte.slice(0, 30)), 'und auch nicht im Regelblock');
      }
    });

    if (c.instruction_soignant) {
      test(`${id} / ${c.type}: die Anweisung der Pflegekraft steht nur im Block ANWEISUNG PFLEGEKRAFT`, () => {
        assert.ok(t.blocs.instruction.includes(c.instruction_soignant), 'die Anweisung steht im Block ANWEISUNG');
        for (const bloc of ['regles', 'faits', 'format']) assert.ok(!t.blocs[bloc].includes(c.instruction_soignant), `die Anweisung darf nicht im Block ${bloc} stehen`);
      });
    }

    test(`${id} / ${c.type}: die Referenzantwort ist konform (Kontrollen und Erwartungen)`, () => {
      // Ausgabe « phrases »: Die Referenz wird in JSON umgewandelt, wie das Modell es liefern würde; geprüft wird dann der vom Code ZUSAMMENGESETZTE Text
      const phrases = p.sortie === 'phrases';
      const brute = phrases ? referenceVersPhrases(c, p) : c.reponse_reference;
      const controle = controler(brute, c, t, id);
      if (phrases) assert.deepEqual(controle.retirees, [], `eine Referenzantwort darf keinen Satz verlieren: ${JSON.stringify(controle.retirees)}`);
      const echecs = verifierAttendu(phrases ? controle.texte : brute, c.attendu, controle);
      assert.deepEqual(echecs, [], `${c.nom}: ${echecs.join(' | ')}`);
    });
  }
}

test('extraire_faits: ein Medikament ohne Schlüssel « duree » wird gemeldet (Schema der Listen)', () => {
  const { cas } = chargerCas('extraire_faits');
  const c = cas[0];
  const t = assembler(c, 'extraire_faits');
  const sansDuree = '{"patient":{"nom":"Weber","prenom":"Hans","naissance":"23.11.1941"},"diagnostics":[],"medicaments":[{"nom":"Amoxicillin","dose":"1000 mg","frequence":"1-0-1","action":"debut"}],"allergies_mentionnees":[],"autres_recommandations":[]}';
  const controle = controler(sansDuree, c, t, 'extraire_faits');
  assert.ok(controle.avertissements.some((a) => a.type === 'json_incomplet' && /duree/.test(a.detail)), JSON.stringify(controle.avertissements));
});
test('comparer: eine nicht leere Liste von Widersprüchen mit aucune_contradiction=true wird gemeldet (Unstimmigkeit des Modells)', () => {
  const { cas } = chargerCas('comparer');
  const c = cas[0];
  const t = assembler(c, 'comparer');
  const incoherent = '{"contradictions":[{"type":"allergie","gravite":"haute","description":"x","element_lettre":"a","element_source":"b","sources":["ePA"]}],"aucune_contradiction":true}';
  assert.ok(controler(incoherent, c, t, 'comparer').avertissements.some((a) => a.type === 'json_incoherent'));
});
test('die Kontrollen erkennen eine schlechte Antwort an einem echten Fall (der Test der Tests)', () => {
  const { cas } = chargerCas('generer_sbar');
  const c = cas[0];
  const t = assembler(c, 'generer_sbar');
  // Die Fakten der Testfälle (prompts/tests/*.json) bestimmen Sprache und Werte; die falschen Sätze sind daran angepasst.
  const mauvaise = JSON.stringify({ phrases: [
    { r: 'S', t: 'Sturz festgestellt um 10:13 Uhr, Blutdruck erhöht und Puls abnormal.', f: 'F5' },
    { r: 'S', t: 'Frau Schulz geht es gut.', f: 'F5' },
    { r: 'B', t: 'Allergie gegen Amoxicillin.', f: 'F1' },
    { r: 'A', t: 'Blutdruck 142/86 um 06:02 Uhr.', f: 'F7' },
    { r: 'R', t: 'Neurologische Überwachung alle 2 Stunden.', f: 'F9' },
  ] });
  const controle = controler(mauvaise, c, t, 'generer_sbar');
  const codes = controle.retirees.flatMap((r) => r.motifs.map((m) => m.code));
  for (const attendu of ['source_inconnue', 'valeur_absente', 'jugement_non_source', 'autre_resident', 'medicament_absent']) assert.ok(codes.includes(attendu), `müsste wegen ${attendu} entfernen (erhalten: ${codes})`);
  assert.doesNotMatch(controle.texte, /10:13|Schulz|amoxicillin/i, 'nichts Erfundenes im Text');
});

console.log(`\n${nb} Tests bestanden.`);
