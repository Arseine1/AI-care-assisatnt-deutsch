// Tests ohne n8n, Tag 3, Schritt 4: Dienstbericht einer Etage und was auf eine Bestätigung folgt
// (Hinzufügen zum RAG, Weitergabe an das nächste Team), an den GENERIERTEN Workflows.
// Start: node tests/apres-validation.test.mjs   (nach node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const workflow = (fichier) => JSON.parse(readFileSync(join(racine, 'workflows', fichier), 'utf8'));
const noeud = (fichier, nom) => {
  const n = workflow(fichier).nodes.find((x) => x.name === nom);
  assert.ok(n, `Knoten « ${nom} » nicht gefunden in ${fichier}`);
  return n;
};
const jsCode = (fichier, nom) => noeud(fichier, nom).parameters.jsCode;
function lancer(code, { entree = {}, noeuds = {} } = {}) {
  const enveloppe = (items) => ({ first: () => items[0], all: () => items, last: () => items.at(-1) });
  const $input = enveloppe(Array.isArray(entree) ? entree.map((json) => ({ json })) : [{ json: entree }]);
  const $ = (nom) => {
    if (!(nom in noeuds)) throw new Error(`unbekannter Knoten: ${nom}`);
    return enveloppe(noeuds[nom].map((json) => ({ json })));
  };
  return new Function('$input', '$', 'require', code)($input, $, require).map((x) => x.json);
}
let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

const ligne = (extra = {}) => ({
  validation_id: 7, patient_id: 'PAT-003', texte: 'S: Sturz um 04:41 Uhr. [Pflegesoftware]', sources: ['Pflegesoftware', 'ePA'],
  valide_par: 'Pflegekraft Keller', valide_le: '2026-10-25T07:30:00Z', civilite: 'Herr', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, ...extra,
});

// ---------------------------------------------------------------- Hinzufügen zum RAG
test('RAG: Das hinzugefügte Dokument ist der BESTÄTIGTE Text aus der Tabelle, vom Typ rapport_valide, dem Bewohner zugeordnet', () => {
  const docs = lancer(jsCode('66-brique-apres-validation.json', 'RAG-Dokumente'), { entree: [ligne(), { json: 'leer' }, {}] });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].type, 'rapport_valide');
  assert.equal(docs[0].collection, 'patients');
  assert.equal(docs[0].patient_id, 'PAT-003');
  assert.equal(docs[0].texte, ligne().texte);
  assert.equal(docs[0].source_ref, 'validation-7');
  assert.equal(docs[0].source_label, 'Bestätigter Bericht');
});
test('RAG: Die SQL-Abfrage liest die Bestätigungen von DIENSTBERICHTEN, nur über numerische Kennungen', () => {
  const n = noeud('66-brique-apres-validation.json', 'Bestätigte Berichte');
  assert.match(n.parameters.query, /FROM soins\.validations/);
  assert.match(n.parameters.query, /action = 'generer_sbar'/);
  assert.match(n.parameters.options.queryReplacement, /map\(Number\)\.filter\(Number\.isInteger\)/);
});
test('RAG: Bestätigte Berichte dienen einem neuen Bericht nicht als Fakten, außer bei Prompts, die das verlangen', () => {
  const resultat = { result: [
    { payload: { source: 'validation', source_label: 'Bestätigter Bericht', source_ref: 'validation-7', chunk_index: 0, type: 'rapport_valide', texte: 'früherer SBAR', date: '2026-10-25T07:30:00Z' } },
    { payload: { source: 'epa', source_label: 'ePA', source_ref: 'e1', chunk_index: 0, type: 'diagnostic', texte: 'ePA-Diagnose', date: null } },
  ] };
  const base = (rapports_valides) => ({
    'Parameter': [{ patient_id: 'PAT-003', depuis: '2026-10-24T20:00:00Z', jusqua: '2026-10-25T08:00:00Z', protocoles: false, rapports_valides }],
    'Bewohner': [{ patient_id: 'PAT-003', civilite: 'Herr', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: [], allergies: [], regime: null, risques: [] }],
    'Andere Bewohner': [], 'Notizen des Zeitraums': [], 'Vitalwerte des Zeitraums': [], 'Medikationsplan': [],
    'Qdrant Zeitraum': [resultat], 'Qdrant Hintergrund': [{ result: [] }], 'Qdrant Standards': [{ result: [] }], 'Qdrant Schreiben': [{ result: { points: [] } }],
  });
  const code = jsCode('60-brique-chercher.json', 'Fakten zusammenstellen');
  const sans = lancer(code, { noeuds: base(false) })[0];
  assert.ok(!sans.faits.some((f) => f.label === 'Bestätigter Bericht'), 'ein bestätigter Bericht darf kein Fakt sein');
  assert.ok(sans.faits.some((f) => f.label === 'ePA'));
  const avec = lancer(code, { noeuds: base(true) })[0];
  assert.ok(avec.faits.some((f) => f.label === 'Bestätigter Bericht'));
});
test('RAG: Nur Modus B (geführte Anweisung) liest die bestätigten Berichte erneut', () => {
  const prompts = JSON.parse(jsCode('70-maitre-action.json', 'Prompt-Parameter').match(/const PROMPTS = (.*);\n/)[1]);
  assert.equal(prompts.consigne_guidee.rapports_valides, true);
  for (const [id, p] of Object.entries(prompts)) if (id !== 'consigne_guidee') assert.equal(p.rapports_valides, false, id);
});

// ---------------------------------------------------------------- Weitergabe
const message = (rapports, entree = { portee: 'resident' }) =>
  lancer(jsCode('66-brique-apres-validation.json', 'Übergabenachricht'), { noeuds: { 'Eingang': [entree], 'Bestätigte Berichte': rapports } })[0];

test('Weitergabe: Die Nachricht übernimmt den bestätigten Text, seine Quellen und den Namen der bestätigenden Person', () => {
  const m = message([ligne()]);
  assert.match(m.texte, /Sturz um 04:41 Uhr/);
  assert.match(m.texte, /Quellen: \[Pflegesoftware\] \[ePA\]/);
  assert.match(m.texte, /Bestätigt von Pflegekraft Keller/);
  assert.match(m.sujet, /Zimmer 12 \(Herr Weber\)/);
  assert.equal(m.mailpit.To[0].Email, m.destinataire);
  assert.deepEqual(m.validation_ids, [7]);
});
test('Weitergabe: Eine ganze Etage ergibt eine einzige Nachricht mit einem Block je Bewohner', () => {
  const m = message([ligne(), ligne({ validation_id: 8, patient_id: 'PAT-004', nom: 'Schulz', chambre: '14', texte: 'S: ruhige Nacht. [Pflegesoftware]' })], { portee: 'etage', etage: 1 });
  assert.match(m.sujet, /Etage 1/);
  assert.equal(m.texte.split('=== Zimmer').length - 1, 2);
  assert.deepEqual(m.patient_ids, ['PAT-003', 'PAT-004']);
});
test('Weitergabe: Ohne bestätigten Bericht wird nichts gesendet', () => {
  assert.throws(() => message([{}]), /Kein bestätigter Bericht/);
});
test('Weitergabe: Ein fehlgeschlagener Versand wird vermerkt (Status echec), er macht die Bestätigung nicht rückgängig', () => {
  const resume = lancer(jsCode('66-brique-apres-validation.json', 'Zusammenfassung'), { noeuds: {
    'Übergabenachricht': [message([ligne()])], 'Senden (Mailpit)': [{ error: { message: 'Verbindung abgelehnt' } }],
    'Übergabe vermerken': [{ id: 3 }], 'Indizieren (RAG)': [{ morceaux_indexes: 1, ignores_deja_importes: 0 }],
  } })[0];
  assert.equal(resume.transmission.statut, 'echec');
  assert.equal(resume.rag.ajoutes, 1);
  assert.deepEqual(resume.evenements_journal.map((e) => e.evenement), ['ajout_rag', 'transmission']);
  assert.ok(noeud('66-brique-apres-validation.json', 'Senden (Mailpit)').onError === 'continueRegularOutput');
});

// ---------------------------------------------------------------- Pfade
const trouveLiens = (fichier) => {
  const wf = workflow(fichier);
  const liens = [];
  for (const [de, sorties] of Object.entries(wf.connections)) sorties.main.forEach((cibles, i) => cibles.forEach((c) => liens.push({ de, vers: c.node, sortie: i })));
  return liens;
};
test('Bestätigung: « Zur Nachbearbeitung » wird nur nach einer erfolgreichen Bestätigung eines Dienstberichts erreicht', () => {
  const liens = trouveLiens('72-maitre-valider.json');
  const versApres = liens.filter((l) => l.vers === 'Zur Nachbearbeitung');
  assert.deepEqual(versApres, [{ de: 'Dienstbericht?', vers: 'Zur Nachbearbeitung', sortie: 0 }]);
  assert.match(noeud('72-maitre-valider.json', 'Dienstbericht?').parameters.conditions.conditions[0].leftValue, /ok === true && \$json\.action === 'generer_sbar'/);
  assert.ok(liens.some((l) => l.de === 'Speichern' && l.vers === 'Dienstbericht?'));
});
test('Bestätigung: Der Stapel einer Etage durchläuft für jeden Bericht « Speichern » (Entwurf erforderlich), bevor etwas zum RAG hinzugefügt wird', () => {
  const wf = workflow('73-maitre-valider-lot.json');
  const ordre = trouveLiens('73-maitre-valider-lot.json');
  assert.ok(ordre.some((l) => l.de === 'Speichern' && l.vers === 'Stapel zusammenführen'));
  assert.equal(noeud('73-maitre-valider-lot.json', 'Speichern').parameters.mode, 'each');
  assert.equal(wf.nodes.filter((n) => n.name === 'Nach der Bestätigung').length, 1);
  const lot = lancer(jsCode('73-maitre-valider-lot.json', 'Stapel zusammenführen'), {
    entree: [{ ok: true, validation_id: 5, action: 'generer_sbar' }, { ok: false, erreur: 'Entwurf nicht gefunden oder bereits bestätigt.', brouillon_id: 'x' }, { ok: true, validation_id: 6, action: 'resume_epa' }],
    noeuds: { 'Inhalt des Stapels': [{ etage: 2 }] },
  })[0];
  assert.deepEqual(lot.validation_ids, [5]);
  assert.equal(lot.refuses.length, 2);
  assert.equal(lot.portee, 'etage');
});
test('Etage: Der Prompt ist auf generer_sbar festgelegt, die Etage ist eine Zahl, ein Bewohner nach dem anderen', () => {
  const el = lancer(jsCode('68-brique-etage-complet.json', 'Zu bearbeitende Bewohner'), { noeuds: { 'Eingang': [{ task_id: 'T' }], "Bewohner der Etage": [{ patient_id: 'PAT-001' }, { patient_id: 'PAT-002' }] } });
  assert.deepEqual(el.map((x) => x.prompt_id), ['generer_sbar', 'generer_sbar']);
  assert.equal(noeud('68-brique-etage-complet.json', 'Dienstbericht').parameters.mode, 'each');
  const ctrl = jsCode('74-maitre-etage.json', "Etage prüfen");
  assert.equal(lancer(ctrl, { entree: { body: { etage: '2' } } })[0].etage, 2);
  assert.throws(() => lancer(ctrl, { entree: { body: { etage: "2; DROP TABLE soins.residents" } } }), /Ungültige Etage/);
  assert.throws(() => lancer(ctrl, { entree: { body: {} } }), /Ungültige Etage/);
});
test('Etage: Die Antwort geht sofort raus (Aufgabenkennung), die Erstellung läuft danach weiter', () => {
  const liens = trouveLiens('74-maitre-etage.json');
  assert.equal(noeud('74-maitre-etage.json', 'Webhook').parameters.responseMode, 'responseNode');
  assert.ok(liens.some((l) => l.de === 'Sofort antworten' && l.vers === 'Zum vollständigen Etagenbericht'));
  assert.ok(liens.some((l) => l.de === 'Aufgabe erstellen' && l.vers === 'Sofort antworten'));
});
test('Etage: Die Aufgabe behält Entwürfe, nie eine Bestätigung; ein Fehler bei einem Bewohner stoppt die anderen nicht', () => {
  const r = lancer(jsCode('67-brique-rapport-garde.json', 'Ergebnis des Berichts'), {
    entree: { error: { message: 'Ollama injoignable' } },
    noeuds: { 'Eingang': [{ task_id: 'T' }], 'Suchen': [{ patient: { patient_id: 'PAT-001', chambre: '2', label: 'Frau Schulz' } }] },
  })[0];
  assert.equal(r.entree.erreur, 'Ollama injoignable');
  assert.equal(noeud('67-brique-rapport-garde.json', 'Verfassen').onError, 'continueRegularOutput');
  const ok = lancer(jsCode('67-brique-rapport-garde.json', 'Ergebnis des Berichts'), {
    entree: { brouillon_id: 'b1', texte: 'S : ...', sources: ['ePA'], avertissements: [{ type: 'repetitions', detail: 'd' }] },
    noeuds: { 'Eingang': [{ task_id: 'T' }], 'Suchen': [{ patient: { patient_id: 'PAT-001', chambre: '2', label: 'Frau Schulz' } }] },
  })[0];
  assert.equal(ok.entree.brouillon_id, 'b1');
  assert.ok(!('validation_id' in ok.entree));
});
test('Etage: Die KI wird nur über « Verfassen » aufgerufen (kein neuer Aufruf von /api/generate)', () => {
  for (const f of ['66-brique-apres-validation.json', '67-brique-rapport-garde.json', '68-brique-etage-complet.json', '73-maitre-valider-lot.json', '74-maitre-etage.json', '75-maitre-tache.json', '76-etage-automatique.json']) {
    assert.ok(!JSON.stringify(workflow(f)).includes('/api/generate'), `${f} darf die KI nicht direkt aufrufen`);
  }
});
test('Aufgabe: Nur eine UUID-Kennung wird akzeptiert', () => {
  const ctrl = jsCode('75-maitre-tache.json', 'Aufgabe prüfen');
  assert.equal(lancer(ctrl, { entree: { body: { tache_id: 'a1c3e000-0001-4000-8000-000000000001' } } })[0].tache_id, 'a1c3e000-0001-4000-8000-000000000001');
  assert.throws(() => lancer(ctrl, { entree: { body: { tache_id: "x'; DROP TABLE soins.taches;--" } } }), /Ungültige tache_id/);
});
test('Weitergabe: Der KIM-Konnektor hält die Weitergabe-Mail nie für ein Schreiben (nur Anhänge werden gelesen)', () => {
  const kim = lancer(jsCode('50-connecteur-kim.json', 'Zu lesende Nachrichten'), { entree: { messages: [{ ID: 'a', Attachments: 0 }, { ID: 'b', Attachments: 1 }] } });
  assert.deepEqual(kim.map((x) => x.id), ['b']);
});

test('Aufgabe: Der letzte Bericht einer Etage wird über {etage, recent} abgefragt, die Etage ist eine Zahl', () => {
  const ctrl = jsCode('75-maitre-tache.json', 'Aufgabe prüfen');
  assert.deepEqual(lancer(ctrl, { entree: { body: { etage: 2, recent: true } } })[0], { tache_id: '', etage: '2' });
  assert.throws(() => lancer(ctrl, { entree: { body: { etage: "2' OR 1=1", recent: true } } }), /Ungültige Etage/);
  const rep = jsCode('75-maitre-tache.json', 'Antwort');
  assert.equal(lancer(rep, { entree: {}, noeuds: { 'Aufgabe prüfen': [{ tache_id: '', etage: '2' }] } })[0].tache_id, null, 'kein aktueller Bericht: leere Antwort, kein Fehler');
  assert.throws(() => lancer(rep, { entree: {}, noeuds: { 'Aufgabe prüfen': [{ tache_id: 'x', etage: '' }] } }), /Aufgabe nicht gefunden/);
});
test('automatisch: jede Etage um 5:30 Uhr (Berliner Zeit), nie zweimal innerhalb von 3 Stunden, eine Etage nach der anderen', () => {
  const wf = workflow('76-etage-automatique.json');
  assert.equal(wf.settings.timezone, 'Europe/Berlin');
  assert.equal(noeud('76-etage-automatique.json', 'Zeitplan 5:30 Uhr').parameters.rule.interval[0].expression, '0 30 5 * * *');
  assert.match(noeud('76-etage-automatique.json', 'Aufgaben erstellen').parameters.query, /NOT EXISTS[\s\S]*automatique[\s\S]*interval '3 hours'/);
  assert.equal(noeud('76-etage-automatique.json', 'Vollständiger Etagenbericht').parameters.mode, 'each');
  const el = lancer(jsCode('76-etage-automatique.json', 'Zu bearbeitende Etagen'), { entree: [{ id: 'T1', etage: 1 }, { id: 'T2', etage: '2' }, {}] });
  assert.deepEqual(el, [{ etage: 1, task_id: 'T1' }, { etage: 2, task_id: 'T2' }]);
});
test('automatisch: Der Bericht um 5:30 Uhr ist derselbe wie beim Klick (gleicher Unter-Workflow, gleicher festgelegter Prompt)', () => {
  assert.equal(noeud('76-etage-automatique.json', 'Vollständiger Etagenbericht').parameters.workflowId.value, noeud('74-maitre-etage.json', 'Vollständiger Etagenbericht').parameters.workflowId.value);
});
test('Geschwindigkeit: höchstens 8 Fakten je Bewohner, die sicherheitsrelevantesten (Allergien, Vorfälle, Risiken) bleiben erhalten', () => {
  const notes = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, horodatage: `2026-10-25T0${i % 8}:${10 + i}:00Z`, auteur: 'IDE', categorie: i === 7 ? 'incident' : 'observation', texte: i === 7 ? 'Sturz festgestellt um 04:41 Uhr' : `Beobachtung Nummer ${i}` }));
  const noeuds = {
    'Parameter': [{ patient_id: 'PAT-003', depuis: '2026-10-24T20:00:00Z', jusqua: '2026-10-25T08:00:00Z', protocoles: false, max_faits: 8, sources_prioritaires: [] }],
    'Bewohner': [{ patient_id: 'PAT-003', civilite: 'Herr', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: ['Hypertonie'], allergies: ['Penicillin'], regime: 'normal', risques: ['Sturz'] }],
    'Andere Bewohner': [], 'Notizen des Zeitraums': notes, 'Vitalwerte des Zeitraums': [], 'Medikationsplan': [{ medicament: 'Ramipril', dosage: '5 mg', schema_prise: '1-0-0', indication: 'Hypertonie' }],
    'Qdrant Zeitraum': [{ result: [] }], 'Qdrant Hintergrund': [{ result: [] }], 'Qdrant Standards': [{ result: [] }], 'Qdrant Schreiben': [{ result: { points: [] } }],
  };
  const r = lancer(jsCode('60-brique-chercher.json', 'Fakten zusammenstellen'), { noeuds })[0];
  assert.equal(r.faits.length, 8);
  assert.deepEqual(r.faits.map((f) => f.id), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
  assert.ok(r.faits.some((f) => /^Allergien/.test(f.texte)), 'Allergie behalten');
  assert.ok(r.faits.some((f) => /Sturz festgestellt um 04:41 Uhr/.test(f.texte)), 'Vorfall behalten');
  assert.ok(r.faits.some((f) => /^Risiken/.test(f.texte)), 'Risiken behalten');
  assert.equal(r.stats.tronque, true);
  // Chronologie im Zeitraum erhalten
  const dates = r.faits.filter((f) => f.groupe === 'periode').map((f) => f.date);
  assert.deepEqual(dates, [...dates].sort());
});
test('Geschwindigkeit: Ein Sensoralarm wird immer behalten, auch unter vielen Fakten', () => {
  const qd = { result: [{ payload: { source: 'capteur', source_label: 'Sensoren', source_ref: 'alarme-1', chunk_index: 0, type: 'alarme', texte: 'Alarm sortie_lit Zimmer 12', date: '2026-10-25T07:50:00Z' } }] };
  const notes = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, horodatage: `2026-10-25T0${i % 8}:${10 + i}:00Z`, auteur: 'IDE', categorie: 'incident', texte: `Vorfall Nummer ${i}` }));
  const noeuds = {
    'Parameter': [{ patient_id: 'PAT-003', depuis: '2026-10-24T20:00:00Z', jusqua: '2026-10-25T08:00:00Z', max_faits: 8, sources_prioritaires: ['Sensoren'] }],
    'Bewohner': [{ patient_id: 'PAT-003', civilite: 'Herr', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: [], allergies: [], regime: null, risques: [] }],
    'Andere Bewohner': [], 'Notizen des Zeitraums': notes, 'Vitalwerte des Zeitraums': [], 'Medikationsplan': [],
    'Qdrant Zeitraum': [qd], 'Qdrant Hintergrund': [{ result: [] }], 'Qdrant Standards': [{ result: [] }], 'Qdrant Schreiben': [{ result: { points: [] } }],
  };
  const r = lancer(jsCode('60-brique-chercher.json', 'Fakten zusammenstellen'), { noeuds })[0];
  assert.ok(r.faits.some((f) => f.label === 'Sensoren'));
  assert.equal(r.faits.length, 8);
});
console.log(`\n${nb} Tests bestanden.`);
