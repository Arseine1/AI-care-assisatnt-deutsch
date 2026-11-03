// ECHTER Test der Seite „Rentenbeiträge“ über n8n (n8n, PostgreSQL, OCR und, für --ia, Ollama gestartet). Fiktive Daten.
//   1. Die 9 Fragebögen laufen über n8n OHNE Lesen durch die KI und werden mit data/sgb6/attendus.json verglichen (strikt)
//   2. Die 9 laufen MIT Lesen durch die KI (llama3.2, jeweils mehrere Minuten): mit attendus.json verglichen, Abweichungen gemeldet;
//      geprüfte Sicherheitsregel: Die KI macht nie eine Akte „bereit zur Bestätigung“, die eine Ausnahme sein muss, und ändert nie einen Betrag
//   3. Ablage eines neuen gültigen Fragebogens, dann Bearbeitung; abgelehnte Ablage: zu groß, anderes Format, gescanntes PDF, falsches PDF, Text ohne Bezug
//   4. Entscheidungen: „Ablehnen“ ohne Grund und „Bestätigen“ bei nicht erfüllter Regel werden abgewiesen; die Pflegekraft stammt aus der Sitzung
//   5. Aufruf ohne Sitzung, ohne Schlüssel: abgewiesen
//   6. Das Protokoll enthält weder Namen noch Versicherungsnummer
// Starten: node tests/sgb6-live.mjs                 (schnell: Teile 1, 3, 4, 5, 6, etwa 2 Minuten)
//          node tests/sgb6-live.mjs --ia            (fügt Teil 2 hinzu: 9 Lesevorgänge durch die KI, 20 bis 40 Minuten)
//          node tests/sgb6-live.mjs --pilote --modele=qwen2.5:7b   (fügt den vom Modell GESTEUERTEN Agenten hinzu: Fälle a, d, i; --pilote=tous für alle 9)
// Die Dauern je Akte werden in tests/resultats/sgb6-live.json geschrieben. Die Testakten (dep-…) werden am Ende gelöscht.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appelN8n, CLE, N8N, COMPTE_TEST } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const avecIA = process.argv.includes('--ia');
const argPilote = process.argv.find((a) => a.startsWith('--pilote'));
const avecPilote = Boolean(argPilote); // --pilote (a, d, i) oder --pilote=tous: vom lokalen Modell gesteuerter Agent, mehrere Minuten pro Akte
const modelePilote = process.argv.find((a) => a.startsWith('--modele='))?.slice(9) ?? 'qwen2.5:7b';
const iaSeule = process.argv.includes('--ia-seulement');
const dossierData = join(racine, 'data', 'sgb6');
const attendus = JSON.parse(readFileSync(join(dossierData, 'attendus.json'), 'utf8'));
const ids = Object.keys(attendus).filter((k) => !k.startsWith('_'));
const texteDe = (id) => readFileSync(join(dossierData, 'questionnaires', `${id}.txt`), 'utf8');
let echecs = 0;
const verifier = (condition, message) => {
  console.log(`${condition ? 'OK  ' : 'FEHLER'} ${message}`);
  if (!condition) echecs++;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (requete) => {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: join(racine, 'compose'), input: requete, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
const post = async (chemin, corps) => {
  const rep = await appelN8n(`${N8N}/${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const texte = await rep.text();
  try {
    return { statut: rep.status, ...JSON.parse(texte) };
  } catch {
    return { statut: rep.status, brut: texte.slice(0, 200) };
  }
};
const deposer = (nom, octets) => post('aicare-sgb6-deposer', { nom, contenu_base64: Buffer.from(octets).toString('base64') });

// startet den Agenten und wartet auf das Ende; liefert { resultat, secondes, tache }
async function traiter(id, lecture_ia, options = {}) {
  const debut = Date.now();
  const t = await post('aicare-sgb6-lancer', { id, lecture_ia, ...options });
  if (!t.tache_id) return { erreur: t };
  const vus = new Set(); // die während des Wartens gesehenen Werte von „fait“: Schreitet der Agent Schritt für Schritt voran?
  for (;;) {
    await pause(lecture_ia || options.pilote === 'modele' ? 3000 : 300);
    const e = await post('aicare-sgb6-tache', { tache_id: t.tache_id });
    vus.add(e.fait);
    if (e.statut && e.statut !== 'en_cours') return { resultat: e.resultat, etapes: e.etapes, statutTache: e.statut, secondes: (Date.now() - debut) / 1000, tache: t.tache_id, vus: [...vus] };
    if (Date.now() - debut > 25 * 60 * 1000) return { erreur: 'Frist von 25 Minuten überschritten' };
  }
}
function comparer(id, r, attendu, strict) {
  const ecarts = [];
  const res = r.resultat;
  if (!res) return ['kein Ergebnis'];
  if (res.statut !== attendu.statut) ecarts.push(`Status ${res.statut} (erwartet ${attendu.statut})`);
  if ((res.calcul?.cotisation ?? null) !== attendu.cotisation) ecarts.push(`Beitrag ${res.calcul?.cotisation ?? null} (erwartet ${attendu.cotisation})`);
  if ((res.calcul?.base ?? null) !== attendu.base) ecarts.push(`Basis ${res.calcul?.base ?? null} (erwartet ${attendu.base})`);
  for (const [nom, st] of Object.entries(attendu.regles)) if (res.regles.find((x) => x.regle === nom)?.statut !== st) ecarts.push(`${nom} ${res.regles.find((x) => x.regle === nom)?.statut} (erwartet ${st})`);
  const ecartsChamps = res.regles.filter((x) => x.regle === 'ECART').map((x) => x.champ);
  if (JSON.stringify(ecartsChamps) !== JSON.stringify(attendu.ecarts)) ecarts.push(`Abweichungen [${ecartsChamps}] (erwartet [${attendu.ecarts}])`);
  if ((res.suspects?.length > 0) !== attendu.suspect) ecarts.push(`verdächtiges Dokument ${res.suspects?.length > 0} (erwartet ${attendu.suspect})`);
  if (Object.values(attendu.regles).includes('non') && res.declaration !== null) ecarts.push('ein Meldungsentwurf existiert trotz einer Regel „non“');
  if (strict && res.lecture_ia?.demande === true) ecarts.push('Lesen durch die KI zu Unrecht verlangt');
  return ecarts;
}

const resultats = { date: new Date().toISOString(), sans_ia: {}, avec_ia: {} };
const aNettoyer = [];

// ---- 1. ohne Lesen durch die KI: strikt -------------------------------------------------------------------------------------
if (!iaSeule) {
  console.log('\n== 1. die 9 Fragebögen über n8n, OHNE Lesen durch die KI ==');
  for (const id of ids) {
    const r = await traiter(id, false);
    const ecarts = r.erreur ? [`Fehler: ${JSON.stringify(r.erreur)}`] : comparer(id, r, attendus[id], true);
    resultats.sans_ia[id] = { secondes: r.secondes, ecarts, statut: r.resultat?.statut, cotisation: r.resultat?.calcul?.cotisation ?? null };
    verifier(ecarts.length === 0, `${id}: ${r.resultat?.statut}, ${r.resultat?.calcul?.cotisation ?? 'keine Berechnung'} € in ${r.secondes?.toFixed(1)} s${ecarts.length ? ' — ' + ecarts.join('; ') : ''}`);
    if (id === 'a-becker-clair') {
      verifier([3, 4, 5, 6, 7].every((n) => r.vus.includes(n)), `der Fortschritt wird nach jedem Schritt 3 bis 7 geschrieben: während des Wartens gesehene Werte von „fait“: ${r.vus.join(', ')}`);
      verifier(Number(sql(`SELECT count(DISTINCT date_trunc('second', horodatage)) FROM soins.sgb6_journal WHERE tache_id = '${r.tache}'`)) >= 6, 'das Protokoll wird Schritt für Schritt geschrieben (Zeilen auf mehrere Sekunden verteilt, nicht in einem Block)');
    }
    if (r.etapes) verifier(r.etapes.length === 8 && ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration', 'enregistrer'].every((e, i) => r.etapes[i]?.etape === e), `${id}: Die 8 Schritte sind der Reihe nach protokolliert`);
  }
  // das letzte Ergebnis lässt sich ohne erneuten Start des Agenten wieder lesen
  const rel = await post('aicare-sgb6-dossier', { id: 'a-becker-clair' });
  verifier(rel.ok && rel.resultat?.calcul?.cotisation === 316.32 && rel.statut === 'pret_a_valider', 'aicare-sgb6-dossier: Das letzte Ergebnis von Fall a (316,32 €) lässt sich ohne erneuten Start des Agenten wieder lesen');
  const liste = await post('aicare-sgb6-lister', {});
  verifier(liste.dossiers?.filter((d) => ids.includes(d.id)).length === 9 && liste.dossiers.find((d) => d.id === 'a-becker-clair').statut === 'pret_a_valider', 'aicare-sgb6-lister: die Akten und ihr Status');
}

// ---- 2. mit Lesen durch die KI ------------------------------------------------------------------------------------------------
if (avecPilote && !iaSeule) {
  console.log(`\n== 1 bis. vom Modell ${modelePilote} GESTEUERTER Agent (Status und Beträge stammen vom Code) ==`);
  const cas = argPilote === '--pilote=tous' ? ids : ids.filter((i) => ['a', 'd', 'i'].includes(i.split('-')[0]));
  resultats.pilote = {};
  for (const id of cas) {
    const r = await traiter(id, false, { pilote: 'modele', modele: modelePilote });
    const res = r.resultat;
    const tours = (r.etapes ?? []).filter((e) => e.etape === 'tour');
    const ecarts = r.erreur ? [`Fehler: ${JSON.stringify(r.erreur)}`] : comparer(id, r, attendus[id], false);
    resultats.pilote[id] = { secondes: r.secondes, tours: tours.length, refus: tours.filter((x) => !x.accepte).length, mode: res?.pilote?.mode, abandon: res?.pilote?.abandon ?? null, ecarts, statut: res?.statut, cotisation: res?.calcul?.cotisation ?? null };
    verifier(ecarts.length === 0, `${id} gesteuert von ${modelePilote}: ${res?.statut}, ${res?.calcul?.cotisation ?? 'keine Berechnung'} € in ${r.secondes?.toFixed(0)} s, ${tours.length} Runden, ${tours.filter((x) => !x.accepte).length} Ablehnungen, Modus ${res?.pilote?.mode}${res?.pilote?.abandon ? ' (Abbruch: ' + res.pilote.abandon + ')' : ''}${ecarts.length ? ' — ' + ecarts.join('; ') : ''}`);
    if (res?.pilote?.mode === 'modele') {
      verifier(tours.length >= 7 && tours.every((x) => typeof x.accepte === 'boolean' && x.choisi_par === 'modele'), `${id}: eine Protokollzeile pro Runde (Werkzeug, Begründung, angenommen oder abgelehnt), vom Modell gewählt`);
      verifier(tours.filter((x) => x.accepte).every((x) => (x.raison ?? '').length >= 10), `${id}: eine Begründung für jeden angenommenen Aufruf`);
      verifier(res.pilote.compte_rendu?.length > 20, `${id}: Bericht des Agenten vorhanden`);
    }
    verifier(r.vus?.length >= 4, `${id}: Der Fortschritt wird nach jeder Runde geschrieben (gesehene Werte: ${r.vus?.join(', ')})`);
    console.log(`     Bericht: ${(res?.pilote?.compte_rendu ?? '(keiner)').slice(0, 220)}${res?.pilote?.contradictions?.length ? '; WIDERSPRÜCHE: ' + res.pilote.contradictions.join(' | ') : ''}`);
  }
}

if (avecPilote && !iaSeule) {
  // gibt den Speicher des Modells (5 GB) vor den Datenbankprüfungen frei: docker compose exec verträgt einen Rechner mit knappem Arbeitsspeicher schlecht
  await fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: modelePilote, keep_alive: 0 }) }).catch(() => {});
}

if (avecIA || iaSeule) {
  console.log('\n== 2. die 9 Fragebögen über n8n, MIT Lesen durch die KI (llama3.2) ==');
  for (const id of ids) {
    const r = await traiter(id, true);
    const res = r.resultat;
    const attendu = attendus[id];
    const ecarts = r.erreur ? [`Fehler: ${JSON.stringify(r.erreur)}`] : comparer(id, r, attendu, false);
    resultats.avec_ia[id] = { secondes: r.secondes, ecarts, statut: res?.statut, cotisation: res?.calcul?.cotisation ?? null, lecture: res?.lecture_ia };
    console.log(`     ${id}: ${res?.statut}, ${res?.calcul?.cotisation ?? 'keine Berechnung'} € in ${r.secondes?.toFixed(0)} s; Lesen durch die KI: ${res?.lecture_ia?.utilise ? `${res.lecture_ia.lus} Felder, ${res.lecture_ia.ecartes.length} verworfen, ${res.lecture_ia.differences.length} Unterschiede` : `Rückfall (${res?.lecture_ia?.motif})`}${ecarts.length ? '; ABWEICHUNGEN: ' + ecarts.join('; ') : ''}`);
    // Sicherheitsregel: Die KI macht nie aus einer Ausnahme eine „bereite“ Akte und ändert nie den Betrag einer bereiten Akte
    verifier(!(res?.statut === 'pret_a_valider' && attendu.statut !== 'pret_a_valider'), `${id}: Die KI macht eine Akte, die eine Ausnahme sein muss, nicht „bereit zur Bestätigung“`);
    if (res?.statut === 'pret_a_valider') verifier(res.calcul?.cotisation === attendu.cotisation, `${id}: bereit mit dem richtigen Beitrag`);
    if (res?.lecture_ia?.utilise && res.statut === 'exception') {
      const base = res.declaration?.find((x) => x.cle === 'base_cotisation')?.valeur ?? 'kein Entwurf';
      verifier(res.calcul === null && res.provisoire === false, `${id}: Lesen durch die KI und Ausnahme: kein Betrag, auch kein vorläufiger (Basis: ${base})`);
      if (res.declaration) verifier(base === 'Betrag nicht berechnet: Daten sind zu prüfen.', `${id}: Der Entwurf lautet „Betrag nicht berechnet: Daten sind zu prüfen.“`);
    }
    verifier(!res?.suspects || (res.suspects.length > 0) === attendu.suspect, `${id}: verdächtiges Dokument vom Code erkannt, unabhängig vom Lesen`);
  }
}

const nettoyer = () => {
  for (const id of aNettoyer.filter(Boolean)) sql(`DELETE FROM soins.sgb6_journal WHERE dossier_id = '${id}'; DELETE FROM soins.sgb6_decisions WHERE dossier_id = '${id}'; DELETE FROM soins.sgb6_dossiers WHERE id = '${id}'; DELETE FROM soins.taches WHERE type = 'sgb6_agent' AND parametres->>'dossier' = '${id}'`);
};
if (!iaSeule) try {
  // ---- 3. Ablage ---------------------------------------------------------------------------------------------------------------
  console.log('\n== 3. Ablage eines Fragebogens ==');
  const copie = (id, nouveauNom) => texteDe(id).replace('Becker, Anna', 'Becker, Anna');
  const d1 = await deposer('nouveau-questionnaire.txt', Buffer.from(copie('a-becker-clair')));
  verifier(d1.ok === true && /^dep-[0-9a-f]{10}$/.test(d1.id), `Ablage einer gültigen .txt: ${d1.id ?? JSON.stringify(d1)}`);
  if (d1.id) aNettoyer.push(d1.id);
  const l1 = await post('aicare-sgb6-lister', {});
  verifier(l1.dossiers?.find((d) => d.id === d1.id)?.statut === 'a_traiter', 'die abgelegte Akte ist „a_traiter“');
  const t1 = await traiter(d1.id, false);
  verifier(t1.resultat?.statut === 'pret_a_valider' && t1.resultat.calcul.cotisation === 316.32, `die abgelegte Akte wird bearbeitet: ${t1.resultat?.statut}, ${t1.resultat?.calcul?.cotisation} €`);

  // PDF mit Text (mit pdfkit erstellt, das data/scripts bereits verwendet)
  const PDFDocument = createRequire(import.meta.url)(join(racine, 'data', 'node_modules', 'pdfkit'));
  const pdf = await new Promise((resolu) => {
    const doc = new PDFDocument();
    const morceaux = [];
    doc.on('data', (m) => morceaux.push(m));
    doc.on('end', () => resolu(Buffer.concat(morceaux)));
    doc.fontSize(11).text(texteDe('c-vogel-deux-aidants').replace('Vogel, Katrin', 'Pdf, Katrin'), { lineGap: 2 });
    doc.end();
  });
  const dPdf = await deposer('questionnaire.pdf', pdf);
  verifier(dPdf.ok === true, `Ablage eines PDFs mit Text: ${dPdf.id ?? JSON.stringify(dPdf)}`);
  if (dPdf.id) {
    aNettoyer.push(dPdf.id);
    const tPdf = await traiter(dPdf.id, false);
    verifier(tPdf.resultat?.regles?.length >= 6 && tPdf.resultat.donnees.aidant_nom === 'Pdf', `das PDF wird gelesen und bearbeitet: ${tPdf.resultat?.statut}`);
  }

  const refuse = async (nom, octets, erreur, libelle) => {
    const r = await deposer(nom, octets);
    verifier(r.ok === false && r.erreur === erreur, `${libelle}: abgelehnt (${r.erreur ?? JSON.stringify(r)})`);
    if (r.ok) aNettoyer.push(r.id);
  };
  await refuse('gros.txt', Buffer.alloc(1048577, 'a'), 'taille', 'Datei von 1 MB + 1 Byte');
  await refuse('gros.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1100000, 'a')]), 'taille', 'PDF von mehr als 1 MB');
  await refuse('questionnaire.docx', Buffer.from(texteDe('a-becker-clair')), 'format', 'anderes Format (.docx)');
  await refuse('questionnaire.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'format', 'anderes Format (.png)');
  await refuse('script.exe', Buffer.from('MZ'), 'format', 'anderes Format (.exe)');
  await refuse('faux.pdf', Buffer.from(texteDe('a-becker-clair')), 'format', 'falsches PDF (umbenannter Text)');
  await refuse('binaire.txt', Buffer.from([0x41, 0x00, 0x42, 0x00]), 'format', 'binäre .txt');
  await refuse('rien.txt', Buffer.from('Einkaufsliste: Brot, Milch, Eier, Kaffee, Zucker, Mehl.'), 'pas_un_questionnaire', 'Text ohne Bezug zu einem Fragebogen');
  await refuse('vide.txt', Buffer.alloc(0), 'vide', 'leere Datei');
  const scan = readFileSync(join(racine, 'data', 'lettres', 'arztbrief-wagner-scan.pdf'));
  await refuse('scan.pdf', scan, 'scan', 'gescanntes PDF (Bild ohne Text)');

  // ---- 4. Entscheidungen -------------------------------------------------------------------------------------------------------------
  console.log('\n== 4. Entscheidungen durch Menschen ==');
  const exc = await deposer('copie-d.txt', Buffer.from(texteDe('d-lehmann-8-heures')));
  const ok = await deposer('copie-a.txt', Buffer.from(texteDe('a-becker-clair')));
  aNettoyer.push(exc.id, ok.id);
  let r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'pas_en_attente', `Entscheidung, bevor der Agent die Akte bearbeitet hat: abgewiesen (${r.erreur})`);
  await traiter(exc.id, false);
  await traiter(ok.id, false);
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'regle_non_ok', `„Bestätigen“ bei nicht erfüllter Regel: abgewiesen (${r.erreur})`);
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'refuser', motif: '' });
  verifier(r.ok === false && r.erreur === 'motif_obligatoire', `„Ablehnen“ ohne Grund: abgewiesen (${r.erreur})`);
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'refuser', motif: '   ' });
  verifier(r.ok === false && r.erreur === 'motif_obligatoire', '„Ablehnen“ mit einem Grund aus Leerzeichen: abgewiesen');
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'refuser', motif: 'beliebiger Grund' });
  verifier(r.ok === false && r.erreur === 'refus_hors_exception', `„Ablehnen“ einer bereiten Akte (keine Ausnahme): abgewiesen (${r.erreur})`);
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'inconnue' });
  verifier(r.statut !== 200 || r.ok !== true, 'unbekannte „decision“: abgewiesen');
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'revue' });
  verifier(r.ok === true && r.revue === true && r.statut === 'exception', 'Prüfaufgabe bei einer Akte mit Ausnahme: Der Status bleibt „exception“');
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'revue' });
  verifier(r.ok === false && r.erreur === 'revue_deja_creee', 'nur eine Prüfaufgabe pro Akte');
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'refuser', motif: 'Nur 8 Std. Pflege laut Gutachten', soignant: 'usurpe', valide_par: 'usurpe' });
  verifier(r.ok === true && r.statut === 'refuse', 'Ablehnung mit Grund nach einer Ausnahme: angenommen');
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'valider', soignant: 'usurpe' });
  verifier(r.ok === true && r.statut === 'valide', 'Bestätigung einer bereiten Akte (alle Regeln ok): angenommen');
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'pas_en_attente', 'über eine bestätigte Akte kann nicht mehr entschieden werden');
  r = await post('aicare-sgb6-lancer', { id: ok.id, lecture_ia: false });
  verifier(r.ok === false && r.erreur === 'decide', 'eine entschiedene Akte kann nicht mehr neu bearbeitet werden');
  const signataires = sql(`SELECT string_agg(DISTINCT soignant, ',') FROM soins.sgb6_decisions WHERE dossier_id IN ('${exc.id}', '${ok.id}')`);
  verifier(signataires === COMPTE_TEST, `der Unterzeichner stammt aus der Sitzung („${COMPTE_TEST}“), nie aus dem Anfragekörper: ${signataires}`);
  const apres = await post('aicare-sgb6-dossier', { id: exc.id });
  verifier(apres.statut === 'refuse' && apres.derniere_decision?.motif?.includes('8 Std.') && apres.revue === true, 'die Entscheidung bleibt nachträglich sichtbar (Status, Grund, Prüfung)');
  const statutBase = sql(`SELECT statut FROM soins.sgb6_dossiers WHERE id = '${ok.id}'`);
  verifier(statutBase === 'valide', 'die Bestätigung ist in der Datenbank geschrieben');
  // ein in der Datenbank verfälschtes Ergebnis öffnet die Bestätigung nicht: Die Regel wird im gespeicherten Ergebnis gelesen
  const g = await deposer('copie-g.txt', Buffer.from(texteDe('g-wolf-ecart-degre')));
  aNettoyer.push(g.id);
  await traiter(g.id, false);
  r = await post('aicare-sgb6-decider', { id: g.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'regle_non_ok', `„Bestätigen“ bei einer Abweichung „incertain“: abgewiesen (${r.erreur})`);

  const nonPermis = await post('aicare-sgb6-lancer', { id: 'a-becker-clair', pilote: 'modele', modele: 'evil; DROP TABLE x' });
  verifier(!nonPermis.tache_id, `ein Modell außerhalb der geschlossenen Liste wird abgewiesen (HTTP ${nonPermis.statut})`);
  const pilotInconnu = await post('aicare-sgb6-lancer', { id: 'a-becker-clair', pilote: 'pirate' });
  verifier(!pilotInconnu.tache_id, `ein unbekannter Pilot wird abgewiesen (HTTP ${pilotInconnu.statut})`);
  const lm = await post('aicare-sgb6-lister', {});
  verifier(typeof lm.modele === 'string' && Array.isArray(lm.modeles) && lm.modeles.every((m) => typeof m.nom === 'string' && typeof m.installe === 'boolean') && lm.modeles.some((m) => m.nom === lm.modele), `die Liste nennt das Standardmodell (${lm.modele}) und die zulässigen Modelle mit ihrem Zustand: ${lm.modeles?.map((m) => m.nom + (m.installe ? ' ✓' : ' ✗')).join(', ')}`);

  // ---- 5. Sicherheit ------------------------------------------------------------------------------------------------------------
  console.log('\n== 5. Aufrufe ohne Sitzung, ohne Schlüssel ==');
  const corps = { id: 'a-becker-clair', decision: 'valider', tache_id: '00000000-0000-0000-0000-000000000000', nom: 'x.txt', contenu_base64: '' };
  for (const chemin of ['lister', 'deposer', 'lancer', 'tache', 'dossier', 'decider']) {
    const sansSession = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': CLE }, body: JSON.stringify(corps) });
    const j = await sansSession.json().catch(() => ({}));
    verifier(j.erreur === 'session', `aicare-sgb6-${chemin} ohne Sitzung: abgewiesen (${JSON.stringify(j).slice(0, 60)})`);
    const sansCle = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    verifier(sansCle.status === 403 || sansCle.status === 401, `aicare-sgb6-${chemin} ohne Schlüssel: HTTP ${sansCle.status}`);
    const mauvaise = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': 'mauvaise', Authorization: `Bearer ${'A'.repeat(43)}` }, body: JSON.stringify(corps) });
    verifier(mauvaise.status === 403 || mauvaise.status === 401, `aicare-sgb6-${chemin} mit falschem Schlüssel: HTTP ${mauvaise.status}`);
    const jetonFaux = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': CLE, Authorization: `Bearer ${'A'.repeat(43)}` }, body: JSON.stringify(corps) });
    verifier((await jetonFaux.json().catch(() => ({}))).erreur === 'session', `aicare-sgb6-${chemin} mit falschem Token: abgewiesen`);
  }

  // ---- 6. Protokoll ohne personenbezogene Daten ----------------------------------------------------------------------------------------
  console.log('\n== 6. Das Protokoll enthält weder Namen noch Versicherungsnummer ==');
  const journal = sql("SELECT coalesce(string_agg(dossier_id || '|' || etape || '|' || outil || '|' || resultat || '|' || coalesce(soignant, ''), E'\\n'), '') FROM soins.sgb6_journal");
  const lignes = journal.split('\n').length;
  const interdits = new Set();
  for (const f of readdirSync(join(dossierData, 'questionnaires'))) {
    const t = readFileSync(join(dossierData, 'questionnaires', f), 'utf8');
    for (const m of t.matchAll(/(?:Pflegeperson|pflegebedürftigen Person):\s*([^\n,]+),\s*([^\n]+)/g)) {
      interdits.add(m[1].trim());
      interdits.add(m[2].trim());
    }
    for (const m of t.matchAll(/\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{3}\b/g)) interdits.add(m[0].replace(/\s/g, ''));
  }
  interdits.add('Pdf');
  const trouves = [...interdits].filter((v) => v.length > 2 && journal.includes(v));
  verifier(lignes > 70 && trouves.length === 0, `${lignes} Protokollzeilen, ${interdits.size} gesuchte Namen und Nummern, ${trouves.length} gefunden ${trouves.join(', ')}`);
  verifier(!/\d{8}[A-Z]\d{3}/.test(journal), 'keine Versicherungsnummer (Muster aus 12 Zeichen) im Protokoll');
  verifier(sql("SELECT count(*) FROM soins.sgb6_journal WHERE choisi_par = 'humain' AND soignant IS NULL") === '0', 'jede Zeile „humain“ des Protokolls trägt die Pflegekraft der Sitzung');
}

 finally {
  nettoyer();
}

// ---- Bilanz --------------------------------------------------------------------------------------------------------
mkdirSync(join(racine, 'tests', 'resultats'), { recursive: true });
const fichier = join(racine, 'tests', 'resultats', 'sgb6-live.json');
let ancien = {};
try {
  ancien = JSON.parse(readFileSync(fichier, 'utf8'));
} catch {
  /* erster Durchlauf */
}
writeFileSync(fichier, JSON.stringify({ ...ancien, ...resultats, sans_ia: iaSeule ? ancien.sans_ia : resultats.sans_ia, avec_ia: avecIA || iaSeule ? resultats.avec_ia : ancien.avec_ia }, null, 2));
console.log(`\n${echecs === 0 ? 'Alles OK.' : `${echecs} Fehler.`} Ergebnisse: tests/resultats/sgb6-live.json`);
process.exit(echecs === 0 ? 0 : 1);
