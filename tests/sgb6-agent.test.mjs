// Vom Modell gesteuerter Agent (workflows/code/sgb6/agent.js): Tests OHNE echtes Modell (simuliertes Modell), ohne n8n.
//   Wächter, Rückfall auf den geführten Auftrag, widersprüchlicher Bericht, Protokoll ohne personenbezogene Daten, kurze Werkzeuge, Status und Beträge vom Code.
// Starten: node --test tests/sgb6-agent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_LIMITES, OUTILS, contradictions, garde, modeleSimule, nouvelleSession, piloterOuReplier, requeteChat, tourDeModele } from '../workflows/code/sgb6/agent.js';
import { extraireChamps, traiterQuestionnaire } from '../workflows/code/sgb6/regles.js';

const dossierData = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sgb6');
const lire = (f) => readFileSync(join(dossierData, f), 'utf8');
const caisse = JSON.parse(lire('caisse.json'));
const attendus = JSON.parse(lire('attendus.json'));
const ids = Object.keys(attendus).filter((k) => !k.startsWith('_'));
const texteDe = (id) => lire(`questionnaires/${id}.txt`);
const lancer = (id, chat, extra = {}) => piloterOuReplier({ texte: texteDe(id), caisse, annee: 2026, dossier_id: id, modele: 'modele-simule', chat, ...extra });
const reponse = (name, args, content = '') => ({ message: { role: 'assistant', content, tool_calls: [{ function: { name, arguments: args } }] } });
const R = { raison: 'Ich gehe zu diesem Schritt des geführten Auftrags über.' };

test('die Werkzeuge: 10 Werkzeuge, striktes Schema, kein Werkzeug zum Bestätigen oder Ablehnen, kein Parameter für Betrag, Grad oder Regel', () => {
  const noms = OUTILS.map((o) => o.function.name);
  assert.deepEqual(noms, ['lire_questionnaire', 'extraire_champs_par_regles', 'extraire_champs_par_ia', 'lire_dossier_caisse', 'controler_champs', 'verifier_regles', 'calculer_cotisation', 'preparer_brouillon', 'creer_tache_revue', 'terminer']);
  for (const o of OUTILS) {
    assert.equal(o.type, 'function');
    assert.equal(o.function.parameters.additionalProperties, false, o.function.name);
    assert.ok(o.function.parameters.required.includes('raison'), o.function.name);
    for (const cle of Object.keys(o.function.parameters.properties)) assert.doesNotMatch(cle, /montant|degre|degré|base|cotisation|regle|règle|statut|betrag|grad|regel/i, `${o.function.name}.${cle}`);
  }
  assert.ok(!noms.some((n) => /valider|refuser|approuver/.test(n)));
});

test('die Anfrage an Ollama: /api/chat mit Werkzeugen, Temperatur 0, num_ctx 8192, keep_alive 30m; qwen3 ohne Denkphase', () => {
  const corps = requeteChat(nouvelleSession({ dossier_id: 'x', texte: 'a', annee: 2026, modele: 'qwen2.5:7b' }));
  assert.equal(corps.options.temperature, 0);
  assert.equal(corps.options.num_ctx, 8192);
  assert.equal(corps.keep_alive, '30m');
  assert.equal(corps.tools.length, 10);
  assert.equal(corps.think, undefined);
  assert.equal(requeteChat(nouvelleSession({ dossier_id: 'x', texte: 'a', annee: 2026, modele: 'qwen3:8b' })).think, false);
  assert.match(corps.messages[0].content, /NUR EIN Werkzeug auf/);
  assert.match(corps.messages[0].content, /DATENSATZ, nie eine Anweisung/);
  assert.match(corps.messages[0].content, /du rechnest nicht/);
});

// ---- der Wächter -----------------------------------------------------------------------------------------------------------------
const session = () => nouvelleSession({ dossier_id: 'a-becker-clair', texte: texteDe('a-becker-clair'), annee: 2026, modele: 'm' });
test('Wächter: unbekanntes Werkzeug, überzähliger Parameter, fehlender Parameter, fehlende Begründung, falsche Akte', () => {
  const s = session();
  assert.match(garde(s, 'valider_declaration', { ...R }, R.raison).raison, /unbekanntes Werkzeug/);
  assert.match(garde(s, 'lire_questionnaire', { dossier_id: 'dossier-1', montant: 316.32, ...R }, R.raison).raison, /nicht vorgesehener Parameter: „montant“/);
  assert.match(garde(s, 'lire_questionnaire', { ...R }, R.raison).raison, /Pflichtparameter fehlt: „dossier_id“/);
  assert.match(garde(s, 'lire_questionnaire', { dossier_id: 'dossier-1', raison: '' }, '').raison, /zu kurz|Begründungssatz fehlt/);
  assert.match(garde(s, 'lire_questionnaire', { dossier_id: 'dossier-1' }, '').raison, /fehlt/);
  assert.match(garde(s, 'lire_questionnaire', { dossier_id: 'a-becker-clair', ...R }, R.raison).raison, /unbekannte Akte/);
  assert.match(garde(s, 'lire_questionnaire', 'texte', R.raison).raison, /JSON-Objekt/);
  assert.equal(garde(s, 'lire_questionnaire', { dossier_id: 'dossier-1', ...R }, R.raison).ok, true);
});
test('Wächter: logische Reihenfolge (Berechnen vor verifier_regles, zu frühes Beenden, Entwurf vor Berechnung, Regeln vor Kasse und Prüfung)', () => {
  const s = session();
  for (const [nom, args, motif] of [
    ['extraire_champs_par_regles', { dossier_id: 'dossier-1' }, /lies zuerst/],
    ['controler_champs', {}, /extrahiere zuerst/],
    ['verifier_regles', {}, /kommt nach lire_dossier_caisse und controler_champs/],
    ['calculer_cotisation', {}, /kommt nach verifier_regles/],
    ['preparer_brouillon', {}, /kommt nach calculer_cotisation/],
    ['creer_tache_revue', { motif: 'bitte prüfen' }, /kommt nach verifier_regles/],
    ['terminer', { compte_rendu: 'Ein Bericht, der lang genug ist, um die Längenprüfung zu bestehen.' }, /kommt nach verifier_regles/],
  ]) assert.match(garde(s, nom, { ...args, ...R }, R.raison).raison, motif, nom);
});
test('Wächter: „calculer_cotisation“ abgelehnt, wenn eine Regel „non“ ist; ein Werkzeug wird nur einmal ausgeführt', async () => {
  const r = await lancer('h-fischer-degre1', modeleSimule());
  assert.equal(r.resultat.calcul, null);
  const s = r.session;
  assert.match(garde(s, 'calculer_cotisation', { ...R }, R.raison).raison, /Regel ist „non“|bereits/);
  assert.match(garde(s, 'lire_questionnaire', { dossier_id: 'dossier-1', ...R }, R.raison).raison, /bereits ausgeführt/);
});
test('Wächter: Das Aktenzeichen der Kasse muss das der Extraktion sein', async () => {
  const faux = modeleSimule({ ecart: (tour, corps, appel) => (tour === 4 ? appel('lire_dossier_caisse', { reference: 'PK-2026-9999' }) : undefined) });
  const r = await lancer('a-becker-clair', faux);
  const refus = r.session.journal.filter((l) => !l.accepte);
  assert.equal(refus.length, 1);
  assert.equal(refus[0].outil, 'lire_dossier_caisse');
  assert.match(refus[0].resultat, /unbekanntes Aktenzeichen/);
  assert.equal(r.resultat.statut, 'pret_a_valider'); // das Modell hat nach der Ablehnung korrigiert
});
test('Wächter: Ein abgelehnter Aufruf geht mit der Begründung ans Modell zurück und wird protokolliert', async () => {
  let vu = null;
  const m = modeleSimule({
    ecart: (tour, corps, appel) => {
      if (tour === 2) return appel('calculer_cotisation');
      if (tour === 3) vu = corps.messages.filter((x) => x.role === 'tool').at(-1).content;
      return undefined;
    },
  });
  const r = await lancer('a-becker-clair', m);
  assert.match(vu, /^VOM WÄCHTER ABGELEHNT: calculer_cotisation kommt nach verifier_regles/);
  assert.deepEqual(r.session.journal.filter((l) => !l.accepte).map((l) => l.outil), ['calculer_cotisation']);
  assert.equal(r.session.refus, 1);
});

// ---- Grenzen und Rückfall -----------------------------------------------------------------------------------------------------------
test('2 ungültige Antworten in Folge: Steuerung abgebrochen, geführter Auftrag, ausdrücklicher Hinweis', async () => {
  const r = await lancer('a-becker-clair', async () => ({ message: { role: 'assistant', content: 'Ich weiß nicht, was ich tun soll.' } }));
  assert.equal(r.resultat.pilote.mode, 'mission_guidee');
  assert.equal(r.resultat.pilote.abandon, '2 ungültige Antworten in Folge');
  assert.equal(r.resultat.pilote.mention, 'Steuerung durch das Modell abgebrochen: 2 ungültige Antworten in Folge');
  assert.equal(r.session.tours, 2);
  // der geführte Auftrag liefert das übliche Ergebnis
  assert.equal(r.resultat.statut, 'pret_a_valider');
  assert.equal(r.resultat.calcul.cotisation, 316.32);
});
test('eine einzelne ungültige Antwort unterbricht die Steuerung nicht (der Zähler zählt in Folge)', async () => {
  const m = modeleSimule({ ecart: (tour) => (tour === 2 || tour === 5 ? { message: { role: 'assistant', content: 'äh' } } : undefined) });
  const r = await lancer('a-becker-clair', m);
  assert.equal(r.resultat.pilote.mode, 'modele');
  assert.equal(r.resultat.pilote.abandon, null);
  assert.equal(r.session.journal.filter((l) => l.outil === 'aucun').length, 2);
});
test('Modell nicht erreichbar (Netzwerkfehler, Zeitüberschreitung): zählt als ungültige Antwort', async () => {
  const r = await lancer('a-becker-clair', async () => {
    throw new Error('fetch failed');
  });
  assert.equal(r.resultat.pilote.abandon, '2 ungültige Antworten in Folge');
  assert.match(r.session.journal[0].resultat, /nicht erreichbar/);
});
test('mehr als 12 Runden: Abbruch', async () => {
  // das Modell ruft immer dasselbe erlaubte Werkzeug auf, dann Ablehnungen: nie „terminer“
  const m = async () => reponse('lire_questionnaire', { dossier_id: 'dossier-1', ...R });
  const r = await lancer('a-becker-clair', m);
  assert.equal(r.session.tours, AGENT_LIMITES.tours);
  assert.equal(r.resultat.pilote.abandon, 'mehr als 12 Runden');
  assert.equal(r.resultat.pilote.mode, 'mission_guidee');
});
test('mehr als 15 Minuten: Abbruch', async () => {
  let t = 0;
  const m = modeleSimule();
  const r = await lancer('a-becker-clair', async (corps) => {
    t += 6 * 60 * 1000;
    return m(corps);
  }, { horloge: () => t });
  assert.equal(r.resultat.pilote.abandon, 'Dauer von 15 Minuten überschritten');
  assert.equal(r.resultat.pilote.mode, 'mission_guidee');
});

// ---- Status und Beträge: der Code entscheidet -------------------------------------------------------------------------------------------
test('die 9 Fragebögen mit dem simulierten Modell: Status, Regeln und Beträge stammen vom Code und entsprechen attendus.json', async () => {
  for (const id of ids) {
    const a = attendus[id];
    const r = await lancer(id, modeleSimule());
    const res = r.resultat;
    assert.equal(res.pilote.mode, 'modele', id);
    assert.equal(res.statut, a.statut, id);
    assert.equal(res.calcul?.cotisation ?? null, a.cotisation, id);
    for (const [nom, st] of Object.entries(a.regles)) assert.equal(res.regles.find((x) => x.regle === nom).statut, st, `${id} ${nom}`);
    assert.equal(res.id, id);
    assert.equal(res.pilote.contradictions.length, 0, `${id}: ${res.pilote.contradictions}`);
    assert.ok(res.pilote.compte_rendu.length > 20, id);
    // gleiches Ergebnis wie der geführte Auftrag, bis auf die Dauern
    const guide = traiterQuestionnaire(texteDe(id), { caisse, annee: 2026, id });
    assert.equal(res.statut, guide.statut, id);
    assert.deepEqual(res.regles, guide.regles, id);
    assert.deepEqual(res.calcul, guide.calcul, id);
    assert.deepEqual(res.declaration, guide.declaration, id);
    // Prüfaufgabe nur dann vom Agenten erstellt, wenn etwas zu prüfen ist
    assert.equal(Boolean(res.revue_agent), a.statut === 'exception', id);
  }
});
test('das Modell, das zu früh beendet: Der Code ergänzt die fehlenden Schritte, der Status stammt von den Regeln', async () => {
  const m = modeleSimule({
    ecart: (tour, corps, appel) => {
      if (tour === 3) return appel('verifier_regles'); // abgelehnt: Kasse und Prüfung nicht erledigt
      if (tour === 4) return appel('terminer', { compte_rendu: 'Akte bearbeitet, alles ist für die Bestätigung in Ordnung.' }); // abgelehnt: zu früh
      return undefined;
    },
  });
  const r = await lancer('a-becker-clair', m);
  assert.equal(r.session.journal.filter((l) => !l.accepte).length, 2);
  assert.equal(r.resultat.statut, 'pret_a_valider');
  assert.equal(r.resultat.calcul.cotisation, 316.32);
});
test('ein Modell, das nach verifier_regles ohne Berechnung beendet: Der Code berechnet und ergänzt', async () => {
  const m = modeleSimule({
    ecart: (tour, corps, appel) => {
      const faits = corps.messages.filter((x) => x.role === 'assistant').map((x) => x.tool_calls?.[0]?.function?.name);
      if (faits.includes('verifier_regles') && !faits.includes('terminer')) return appel('terminer', { compte_rendu: 'Regeln geprüft, ich höre hier auf, ohne zu berechnen oder den Entwurf vorzubereiten.' });
      return undefined;
    },
  });
  const r = await lancer('a-becker-clair', m);
  assert.deepEqual(r.resultat.pilote.complete_par_le_code, ['calculer', 'declaration']);
  assert.equal(r.resultat.calcul.cotisation, 316.32);
  assert.equal(r.resultat.declaration.length, 8);
});
test('ein Bericht, der den Regeln widerspricht, wird gemeldet; das Ergebnis der Regeln bleibt angezeigt', async () => {
  const m = modeleSimule({ compteRendu: 'Die Akte ist bereit zur Bestätigung und der Beitrag beträgt 999,99 €. Alles entspricht allen Regeln, nichts zu prüfen.' });
  const r = await lancer('d-lehmann-8-heures', m); // R3 „non“: Ausnahme, kein Betrag
  assert.equal(r.resultat.statut, 'exception');
  assert.equal(r.resultat.calcul, null);
  assert.equal(r.resultat.pilote.contradictions.length, 2);
  assert.match(r.resultat.pilote.contradictions.join(' '), /bereit/);
  assert.match(r.resultat.pilote.contradictions.join(' '), /999.99/);
  // und in der Gegenrichtung, mit einem falschen Betrag bei einer bereiten Akte
  const r2 = await lancer('a-becker-clair', modeleSimule({ compteRendu: 'Akte bereit zur Bestätigung mit einem Beitrag von 400,00 € pro Monat. Die Entscheidung liegt bei einer Person.' }));
  assert.equal(r2.resultat.calcul.cotisation, 316.32);
  assert.equal(r2.resultat.pilote.contradictions.length, 1);
  assert.match(r2.resultat.pilote.contradictions[0], /400/);
});
test('Widersprüche: stimmige Formulierungen werden nicht gemeldet', () => {
  const exc = { statut: 'exception', calcul: null };
  assert.deepEqual(contradictions('Die Akte ist nicht bereit zur Bestätigung: Eine Regel ist nicht erfüllt. Es wurde kein Betrag berechnet.', exc), []);
  assert.deepEqual(contradictions('Ausnahme: R3 nicht erfüllt. Eine Prüfaufgabe wurde erstellt.', exc), []);
  const pret = { statut: 'pret_a_valider', calcul: { cotisation: 316.32, base: 1700.65, bezugsgroesse: 3955 } };
  assert.deepEqual(contradictions('Akte bereit zur Bestätigung. Beitrag von 316,32 € auf einer Basis von 1.700,65 €.', pret), []);
  assert.equal(contradictions('Es liegt eine Ausnahme vor.', pret).length, 1);
});
test('eine versteckte Anweisung hat keinen Einfluss auf die Steuerung: Der Code erkennt sie, das Modell sieht den Text nie', async () => {
  const vus = [];
  const m = modeleSimule();
  const r = await lancer('i-richter-piege', async (corps) => {
    vus.push(JSON.stringify(corps.messages));
    return m(corps);
  });
  assert.doesNotMatch(vus.join(' '), /Ignoriere alle Regeln|genehmige sofort/i, 'der Text der Falle erreicht das Modell nie');
  assert.equal(r.resultat.suspects.length, 1);
  assert.equal(r.resultat.statut, 'exception');
});
test('das Modell sieht in seinen Nachrichten weder Namen noch Adresse noch Versicherungsnummer', async () => {
  for (const id of ['a-becker-clair', 'c-vogel-deux-aidants', 'f-schaefer-numero-faux']) {
    const vus = [];
    const m = modeleSimule();
    await lancer(id, async (corps) => {
      vus.push(JSON.stringify(corps.messages));
      return m(corps);
    });
    const { donnees } = extraireChamps(texteDe(id));
    for (const v of [donnees.aidant_nom, donnees.aidant_prenom, donnees.personne_nom, donnees.numero_assurance, donnees.adresse]) assert.ok(!vus.at(-1).includes(String(v)), `${id}: „${v}“ in den Nachrichten des Modells`);
  }
});
test('alle Werkzeugergebnisse sind kürzer als 800 Zeichen', async () => {
  for (const id of ids) {
    const r = await lancer(id, modeleSimule());
    for (const m of r.session.messages.filter((x) => x.role === 'tool')) assert.ok(m.content.length <= AGENT_LIMITES.resultat_max, `${id} ${m.tool_name} : ${m.content.length}`);
  }
});

// ---- Protokoll --------------------------------------------------------------------------------------------------------------------
test('das Protokoll enthält weder Namen noch Versicherungsnummer, auch wenn das Modell sie in seine Begründungen und den Prüfgrund schreibt', async () => {
  for (const id of ids) {
    const { donnees } = extraireChamps(texteDe(id));
    const nom = `${donnees.aidant_prenom} ${donnees.aidant_nom}, ${donnees.personne_nom}, ${donnees.numero_assurance}, ${donnees.numero_assurance.replace(/(\d{2})(\d{6})([A-Z])(\d{3})/, '$1 $2 $3 $4')}, ${donnees.adresse}`;
    const bavard = modeleSimule({
      ecart: (tour, corps, appel) => {
        const faits = corps.messages.filter((x) => x.role === 'assistant').map((x) => x.tool_calls?.[0]?.function?.name);
        if (tour === 1) return { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'lire_questionnaire', arguments: { dossier_id: 'dossier-1', raison: `Ich lese die Akte von ${nom}, um zu beginnen.` } } }] } };
        if (tour === 2) return appel('valider_la_declaration', { raison: `Ich bestätige für ${donnees.aidant_nom}.` }); // unbekanntes Werkzeug: abgelehnt
        if (faits.includes('verifier_regles') && !faits.includes('creer_tache_revue') && /unsicher|non/.test(corps.messages.filter((x) => x.tool_name === 'verifier_regles').at(-1)?.content ?? '')) return appel('creer_tache_revue', { motif: `Zu prüfen: ${nom} hat ein Problem.`, raison: `Die Nummer ${donnees.numero_assurance} erscheint zweifelhaft.` });
        return undefined;
      },
    });
    const r = await lancer(id, bavard);
    const journal = JSON.stringify(r.session.journal) + JSON.stringify(r.resultat.journal ?? '') + JSON.stringify(r.resultat.pilote.revue ?? '');
    for (const v of [donnees.aidant_nom, donnees.aidant_prenom, donnees.personne_nom, donnees.numero_assurance, donnees.adresse.split(',')[0]]) assert.ok(!journal.includes(String(v)), `${id}: „${v}“ im Protokoll`);
    assert.doesNotMatch(journal, /\d{8}[A-Z]\d{3}|\d{2} \d{6} [A-Z] \d{3}/, id);
    assert.ok(r.session.journal.some((l) => !l.accepte && l.outil.startsWith('valider')), `${id}: Das unbekannte Werkzeug wird abgelehnt und protokolliert`);
  }
});
test('jede Protokollzeile: Werkzeug, Begründung, angenommen oder abgelehnt, Dauer', async () => {
  const r = await lancer('a-becker-clair', modeleSimule());
  assert.equal(r.session.journal.length, r.session.tours);
  for (const l of r.session.journal) {
    assert.ok(typeof l.outil === 'string' && typeof l.raison === 'string' && typeof l.accepte === 'boolean' && Number.isInteger(l.duree_ms) && typeof l.resultat === 'string');
    assert.ok(l.raison.length >= 10 && l.raison.length <= 300);
  }
  assert.deepEqual(r.session.journal.map((l) => l.outil), ['lire_questionnaire', 'extraire_champs_par_regles', 'controler_champs', 'lire_dossier_caisse', 'verifier_regles', 'calculer_cotisation', 'preparer_brouillon', 'terminer']);
});
test('Dateien des Projekts: agent.js enthält kein Werkzeug zum Bestätigen oder Ablehnen und verbindet sich mit keinem Netzwerk', () => {
  const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'workflows', 'code', 'sgb6', 'agent.js'), 'utf8');
  assert.doesNotMatch(code, /outil\('(valider|refuser)/);
  assert.doesNotMatch(code, /fetch\(|http:\/\/|https:\/\//);
  assert.equal(readdirSync(join(dossierData, 'questionnaires')).length, 9);
});
