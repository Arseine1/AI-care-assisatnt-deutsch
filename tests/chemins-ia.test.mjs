// TEST DER WEGE: « Kein Weg sendet den Text der Pflegekraft direkt an die KI ».
// Statische Analyse der ERZEUGTEN Workflows (derjenigen, die in n8n importiert werden): Der Graph jedes
// Eingangs-Workflows wird durchlaufen und geprüft, dass der Freitext der Pflegekraft « Verfassen » (der einzige Aufruf der KI)
// erst nach der Prüfung der Anweisung, dem Tor « akzeptiert » und der gesperrten Vorlage erreichen kann.
// Starten: node tests/chemins-ia.test.mjs   (nach node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { racine, workflow } from './lib/prompts-harness.mjs';

const fichiers = readdirSync(join(racine, 'workflows')).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();
const tous = Object.fromEntries(fichiers.map((f) => [f, workflow(f)]));
const idDe = (fichier) => tous[fichier].id;
const ID_REDIGER = idDe('62-brique-rediger.json');
const ID_TEMPLATE = idDe('61-brique-template.json');
const ID_CHERCHER = idDe('60-brique-chercher.json');
const ID_ENREGISTRER = idDe('63-brique-enregistrer.json');

// --- Graph -----------------------------------------------------------------------------------------------
const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);
function voisins(wf, nom) {
  const sorties = wf.connections[nom]?.main ?? [];
  return sorties.flatMap((liste, indexSortie) => (liste ?? []).map((l) => ({ vers: l.node, sortie: indexSortie })));
}
// alle einfachen Wege von `depart` zu den Knoten, die `estCible` erfüllen
function chemins(wf, depart, estCible) {
  const res = [];
  const aller = (nom, chemin) => {
    if (estCible(noeud(wf, nom))) res.push([...chemin, { nom, sortie: null }]);
    for (const v of voisins(wf, nom)) if (!chemin.some((c) => c.nom === v.vers)) aller(v.vers, [...chemin, { nom, sortie: v.sortie }]);
  };
  aller(depart, []);
  return res;
}
const appelle = (id) => (n) => n?.type === 'n8n-nodes-base.executeWorkflow' && n.parameters?.workflowId?.value === id;
const declencheurs = (wf) => wf.nodes.filter((n) => /webhook|trigger/i.test(n.type) && !/executeWorkflowTrigger/.test(n.type));

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};

// --- 1. der Freitext des Modus B --------------------------------------------------------------------------
const consigne = tous['71-maitre-consigne.json'];
test('Modus B: jeder Weg vom Webhook zu « Verfassen » führt über die Prüfung, das Tor « akzeptiert », « Suchen » und dann die Vorlage', () => {
  const vers = chemins(consigne, 'Webhook', appelle(ID_REDIGER));
  assert.ok(vers.length >= 1, 'mindestens ein Weg zu Verfassen');
  for (const chemin of vers) {
    const noms = chemin.map((c) => c.nom);
    const rang = (nom) => noms.indexOf(nom);
    assert.ok(rang('Anweisung prüfen') >= 0, 'die Prüfung liegt auf dem Weg');
    assert.ok(rang('Anweisung prüfen') < rang('Anweisung akzeptiert?'), 'Prüfung vor dem Tor');
    assert.ok(rang('Anweisung akzeptiert?') < rang('Suchen'), 'Tor vor Suchen');
    assert.ok(rang('Suchen') < rang('Vorlage') && rang('Vorlage') < rang('Verfassen'), 'Suchen, dann Vorlage, dann Verfassen');
    // das Tor muss über seinen Ausgang « wahr » (0) passiert werden, nie über « falsch »
    const porte = chemin.find((c) => c.nom === 'Anweisung akzeptiert?');
    assert.equal(porte.sortie, 0, 'nur der Ausgang « Anweisung akzeptiert » führt zur KI');
  }
});

test('der Wegetest erkennt eine Umleitung (Prüfung in einer Kopie des Workflows umgangen)', () => {
  const copie = JSON.parse(JSON.stringify(consigne));
  // eine Abkürzung, die die Prüfung umgeht: Das Zimmer führt direkt zu den Suchparametern
  copie.connections['Bewohner des Zimmers'].main[0].push({ node: 'Parameter Anweisung', type: 'main', index: 0 });
  const sansControle = chemins(copie, 'Webhook', appelle(ID_REDIGER)).filter((c) => !c.some((x) => x.nom === 'Anweisung prüfen'));
  assert.ok(sansControle.length >= 1, 'die Abkürzung muss als Weg ohne Prüfung erkannt werden');
});

test('Modus B: der Ausgang « Anweisung abgelehnt » führt nie zur KI (weder zu Suchen noch zur Vorlage)', () => {
  const refus = voisins(consigne, 'Anweisung akzeptiert?').find((v) => v.sortie === 1).vers;
  const versIa = chemins(consigne, refus, (n) => [ID_CHERCHER, ID_TEMPLATE, ID_REDIGER].some((id) => appelle(id)(n)));
  assert.deepEqual(versIa, [], 'der Weg « Ablehnung » erreicht keinen KI-Knoten');
});

test('Modus B: nur « Anweisung prüfen » liest den Freitext aus der Anfrage; die anderen Knoten lesen nur die geprüfte Anweisung', () => {
  for (const n of consigne.nodes) {
    const code = n.parameters?.jsCode ?? '';
    const lit = /\$\('Webhook'\)|\$input\.first\(\)\.json\?\.body/.test(code) && /consigne/.test(code.replace(/\/\/.*$/gm, ''));
    if (n.name === 'Anweisung prüfen') assert.ok(code.includes("$('Webhook')"), 'die Prüfung liest die Anfrage');
    else assert.ok(!lit, `« ${n.name} » darf die rohe Anweisung der Anfrage nicht lesen`);
    // Knoten, die die Anweisung verwenden, übernehmen sie NACH der Prüfung
    if (n.name !== 'Anweisung prüfen' && /\.consigne\b/.test(code)) {
      assert.ok(code.includes("$('Anweisung prüfen')"), `« ${n.name} » muss die Anweisung vom Prüfknoten übernehmen`);
    }
    // Datenbank- und HTTP-Knoten enthalten die Anweisung nie in ihren Parametern
    if (['n8n-nodes-base.postgres', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.executeWorkflow'].includes(n.type)) assert.ok(!/consigne/i.test(JSON.stringify(n.parameters).replace(/Anweisung prüfen/g, '')), `« ${n.name} » darf die Anweisung nicht verarbeiten`);
  }
});

test('Modus B: die Anweisung der Pflegekraft gelangt nur über « instruction_soignant » der Vorlage in den Prompt', () => {
  const quiLit = [];
  for (const [f, wf] of Object.entries(tous)) {
    for (const n of wf.nodes) {
      if (/instruction_soignant/.test(n.parameters?.jsCode ?? '')) quiLit.push(`${f} / ${n.name}`);
    }
  }
  assert.deepEqual(quiLit.sort(), ['61-brique-template.json / Gesperrte Vorlage', '71-maitre-consigne.json / Zur Vorlage (Anweisung)'].sort());
});

// --- 2. kein anderer Weg ---------------------------------------------------------------------------------
test('In allen Workflows geht einem Aufruf von « Verfassen » auf allen Wegen die Vorlage voraus', () => {
  for (const [f, wf] of Object.entries(tous)) {
    for (const depart of declencheurs(wf)) {
      for (const chemin of chemins(wf, depart.name, appelle(ID_REDIGER))) {
        const noms = chemin.map((c) => noeud(wf, c.nom));
        const iTemplate = noms.findIndex(appelle(ID_TEMPLATE));
        const iRediger = noms.findIndex(appelle(ID_REDIGER));
        assert.ok(iTemplate >= 0 && iTemplate < iRediger, `${f}: Weg zu Verfassen ohne Vorlage (${chemin.map((c) => c.nom).join(' > ')})`);
      }
    }
  }
});

test('Modus A: die Anfrage enthält keinen Freitext (nur Aktion und Zimmer)', () => {
  const code = noeud(tous['70-maitre-action.json'], 'Anfrage prüfen').parameters.jsCode;
  const lus = [...code.matchAll(/\be\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(lus)].sort(), ['action', 'chambre']);
});

test('« Bestätigen & Speichern » führt weder zu Suchen noch zur Vorlage noch zur KI: Der bestätigte Text wird nur gespeichert', () => {
  const wf = tous['72-maitre-valider.json'];
  const versIa = chemins(wf, 'Webhook', (n) => [ID_CHERCHER, ID_TEMPLATE, ID_REDIGER].some((id) => appelle(id)(n)));
  assert.deepEqual(versIa, []);
  assert.ok(chemins(wf, 'Webhook', appelle(ID_ENREGISTRER)).length >= 1);
});

test('nur zwei Knoten des gesamten Repositorys rufen die generative KI auf (/api/generate): der Baustein « Verfassen » und, AUSDRÜCKLICH, die SGB-VI-Extraktion der Beiträge', () => {
  const appels = [];
  for (const [f, wf] of Object.entries(tous)) for (const n of wf.nodes) if (/\/api\/(generate|chat)/.test(JSON.stringify(n.parameters))) appels.push(`${f} / ${n.name}`);
  assert.deepEqual([...appels].sort(), ['62-brique-rediger.json / Sprachmodell (Ollama)', '93-sgb6-agent.json / SGB-VI-Extraktion (Ollama)', ...Array.from({ length: 12 }, (_, i) => `93-sgb6-agent.json / SGB-VI-Pilot (Runde ${i + 1})`), '97-sgb6-tour.json / SGB-VI-Pilot: Wächter und Werkzeuge'].sort());
});
test('Beiträge: der KI-Aufruf erfolgt nur für das Lesen der Felder (feste Anweisung, Temperatur 0, vorgegebenes JSON-Schema), nach dem Lesen des Dokuments', () => {
  const wf = tous['93-sgb6-agent.json'];
  const preparer = wf.nodes.find((n) => n.name === 'Lesen durch die KI vorbereiten').parameters.jsCode;
  assert.match(preparer, /temperature: 0,/);
  assert.match(preparer, /format: SCHEMA_LECTURE_IA/);
  assert.match(preparer, /prompt: consigneLectureIA\(texte\)/);
  // die KI wird nur über das Feld « Lesen durch die KI » erreicht (nach Schritt 1), nie vor der Schrittkontrolle
  const vers = chemins(wf, 'Eingang', (n) => n?.name === 'SGB-VI-Extraktion (Ollama)');
  assert.ok(vers.length >= 1);
  for (const c of vers) {
    const noms = c.map((x) => x.nom);
    assert.ok(noms.includes('Schritt 1 beendet') && noms.includes('Lesen durch die KI?'));
  }
  // die KI erreicht weder die Berechnung noch die Entscheidung: Die Antwort des Modells läuft vor den Regeln über « KI-Antwort lesen »
  assert.ok(chemins(wf, 'SGB-VI-Extraktion (Ollama)', (n) => n?.name === 'Felder prüfen').every((c) => c.map((x) => x.nom).includes('KI-Antwort lesen')));
});

test('die Eingangs-Workflows der Oberfläche erlauben die Oberfläche (CORS) und antworten über ihren letzten Knoten', () => {
  for (const f of ['70-maitre-action.json', '71-maitre-consigne.json', '72-maitre-valider.json', '78-maitre-reglage.json']) {
    const w = noeud(tous[f], 'Webhook');
    assert.equal(w.parameters.responseMode, 'lastNode', f);
    assert.ok(w.parameters.options.allowedOrigins, `${f} : CORS`);
    assert.equal(w.parameters.httpMethod, 'POST');
  }
});

const verif = tous['77-maitre-verifier.json'];
const REPONSES = ['Sofort antworten', 'Antworten (ohne KI)', 'Antworten (ohne Schreiben)'];
test('« Dokument prüfen »: die Kontrollregeln liegen VOR jeder Antwort und vor dem geringsten KI-Schritt auf dem Weg', () => {
  for (const reponse of REPONSES) {
    const vers = chemins(verif, 'Webhook', (n) => n?.name === reponse);
    assert.ok(vers.length >= 1, reponse);
    for (const c of vers) {
      const noms = c.map((x) => x.nom);
      if (reponse === 'Antworten (ohne Schreiben)') continue; // kein Schreiben: nichts zu vergleichen, keine KI
      assert.ok(noms.includes('Nur Regeln'), `${reponse}: die Regeln müssen der Antwort vorausgehen`);
      assert.ok(noms.indexOf('Nur Regeln') < noms.indexOf(reponse));
      for (const ia of [ID_REDIGER, ID_TEMPLATE]) assert.ok(!c.some((x) => appelle(ia)(noeud(verif, x.nom))), `${reponse}: kein KI-Schritt vor der Antwort`);
    }
  }
});
test('« Dokument prüfen »: die KI-Schritte werden erst NACH der Antwort erreicht, und nur wenn die Analyse aktiviert ist', () => {
  const versIa = chemins(verif, 'Webhook', (n) => appelle(ID_REDIGER)(n) || appelle(ID_TEMPLATE)(n));
  assert.ok(versIa.length >= 1);
  for (const c of versIa) {
    const noms = c.map((x) => x.nom);
    assert.ok(noms.includes('Sofort antworten') && noms.indexOf('Sofort antworten') < noms.indexOf('Zu extrahierendes Dokument'), 'Antwort vor der KI');
    const porte = c.find((x) => x.nom === 'KI-Analyse aktiviert?');
    assert.equal(porte.sortie, 0, 'nur der Ausgang « aktiviert » führt zur KI');
  }
  // deaktiviert: Der Zweig führt zu keinem KI-Schritt
  const sansIa = voisins(verif, 'KI-Analyse aktiviert?').find((v) => v.sortie === 1).vers;
  assert.deepEqual(chemins(verif, sansIa, (n) => appelle(ID_REDIGER)(n) || appelle(ID_TEMPLATE)(n) || appelle(ID_CHERCHER)(n)), []);
});
test('« Dokument prüfen »: Schlägt ein KI-Schritt fehl, endet die Analyse trotzdem (die Regeln haben bereits geantwortet)', () => {
  assert.equal(noeud(verif, 'Verfassen (Extraktion)').onError, 'continueRegularOutput');
  assert.equal(noeud(verif, 'Verfassen (Vergleich)').onError, 'continueRegularOutput');
});
test('« Dokument prüfen »: gelesen werden nur das Zimmer und, optional, die Referenz eines Schreibens (strenges Muster); keine Aktion', () => {
  const code = noeud(verif, 'Anfrage prüfen').parameters.jsCode;
  assert.deepEqual([...new Set([...code.matchAll(/\be\.(\w+)/g)].map((m) => m[1]))].sort(), ['chambre', 'ref']);
  assert.match(code, /\^kim\\\/\[\^\\s\]\{1,200\}\$/, 'die Referenz muss die Form kim/<Absender>/<Datei> haben, ohne Leerzeichen');
  const mode_a = noeud(tous['70-maitre-action.json'], 'Anfrage prüfen').parameters.jsCode;
  assert.doesNotMatch(mode_a, /verifier_document/, 'der Modus A hat keinen Prüfweg mehr');
});
test('« Dokument prüfen »: Antwort über einen Knoten « Antworten » (die Arbeit läuft danach weiter), CORS erlaubt', () => {
  const w = noeud(verif, 'Webhook');
  assert.equal(w.parameters.responseMode, 'responseNode');
  assert.ok(w.parameters.options.allowedOrigins);
});
test('Einstellung: nur ein änderbarer Schlüssel, boolescher Wert', () => {
  const wf = tous['78-maitre-reglage.json'];
  const code = noeud(wf, 'Einstellung prüfen').parameters.jsCode;
  assert.match(code, /const cle = 'verification_ia'/);
  assert.match(code, /typeof e\.valeur !== 'boolean'/);
  assert.equal(noeud(wf, 'Webhook').parameters.responseMode, 'lastNode');
});
console.log(`\n${nb} Tests bestanden.`);
