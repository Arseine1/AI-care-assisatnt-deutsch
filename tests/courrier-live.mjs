// ECHTER Test der automatischen Dokumente: echte Schreiben (PDF im Anhang) werden an Mailpit gesendet; Mailpit benachrichtigt n8n per
// Webhook; n8n extrahiert den Text (OCR beim Scan), ordnet den Bewohner über Name + Geburtsdatum zu, wendet die Kontrollregeln an,
// erstellt die Meldung; die Bestätigung des Berichts fügt das Schreiben dem RAG hinzu (oder nicht). Misst auch die ePA-Neuigkeiten (echte Abfrage).
// Start: node tests/courrier-live.mjs        (n8n, Mailpit, Qdrant, PostgreSQL, OCR und Ollama gestartet; einige Minuten)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const N8N = 'http://localhost:5679/webhook';
const MAILPIT = 'http://localhost:8025';
const QDRANT = 'http://localhost:6335';
const requireData = createRequire(join(racine, 'data', 'package.json'));
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
const post = async (base, chemin, corps) => (await appelN8n(`${base}/${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })).json();
const n8n = (chemin, corps) => post(N8N, chemin, corps);
const alertes = async () => (await n8n('aicare-alarmes', {})).alarmes.filter((a) => a.type === 'document');

const ts = Date.now();
const EXPEDITEUR = { Email: 'essai-courrier@kim.example.test', Name: 'Testpost' };
const MAISON = 'pflegeheim-sonnenhof@kim.example.test';
const fichiers = [];

async function envoyer(nom, pdfBase64, objet) {
  const fichier = `${nom}-essai-${ts}.pdf`;
  fichiers.push(`kim/${EXPEDITEUR.Email}/${fichier}`);
  const t0 = Date.now();
  const r = await fetch(`${MAILPIT}/api/v1/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: EXPEDITEUR, To: [{ Email: MAISON }], Subject: objet, Text: 'Arztbrief im Anhang (Test).', Attachments: [{ Content: pdfBase64, Filename: fichier }] }),
  });
  if (!r.ok) throw new Error(`Senden nicht möglich: HTTP ${r.status}`);
  return { ref: `kim/${EXPEDITEUR.Email}/${fichier}`, t0 };
}
async function attendreAlerte(ref, delaiMax = 240000) {
  const debut = Date.now();
  while (Date.now() - debut < delaiMax) {
    const a = (await alertes()).find((x) => x.faits?.courrier?.ref === ref);
    if (a) return a;
    await pause(1000);
  }
  return null;
}
const lettre = (nom) => readFileSync(join(racine, 'data', 'lettres', nom)).toString('base64');

const soloEpa = process.argv.includes('--epa'); // nur den Teil „ePA-Neuigkeiten“ wiederholen
// ---- Vorbereitung: KI-Analyse ausgeschaltet (die Regeln genügen für diesen Test), alte Post-Meldungen quittiert
const reglageInitial = (await n8n('aicare-reglage', {})).valeur;
await n8n('aicare-reglage', { valeur: false });
sql("update soins.alarmes set statut = 'acquittee', acquittee_le = now() where type = 'document' and statut = 'nouvelle';");

try {
  if (!soloEpa) {
  // ---- 1. Weber: Amoxicillin + Penicillin-Allergie
  const weber = await envoyer('arztbrief-weber', lettre('arztbrief-weber.pdf'), `Arztbrief Weber (Test ${ts})`);
  const aWeber = await attendreAlerte(weber.ref);
  const dWeber = Date.now() - weber.t0;
  verifier(aWeber && aWeber.faits.gravite === 'rouge', `Weber: ROTE Meldung ${Math.round(dWeber / 1000)} s nach dem Senden des Schreibens erhalten`);
  verifier(aWeber?.faits.contradictions?.some((c) => /Penicillin/i.test(c)) && aWeber.chambre === '12', 'Weber: Widerspruch „Penicillin“ (Kontrollregeln), Zimmer 12');

  // ---- 2. Fischer: kein Widerspruch
  const fischer = await envoyer('arztbrief-fischer', lettre('arztbrief-fischer.pdf'), `Arztbrief Fischer (Test ${ts})`);
  const aFischer = await attendreAlerte(fischer.ref);
  verifier(aFischer && aFischer.faits.gravite === 'info' && !aFischer.faits.contradictions?.length, 'Fischer: Information „kein Widerspruch“ (kein roter Alarm)');

  // ---- 3. Schreiben einer unbekannten Person: nie zugeordnet
  const PDFDocument = requireData('pdfkit');
  const inconnu = await new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 64 });
    const morceaux = [];
    doc.on('data', (m) => morceaux.push(m));
    doc.on('end', () => resolve(Buffer.concat(morceaux).toString('base64')));
    doc.fontSize(12).text('Arztbrief. Patient: Herr Max Unbekannt, geb. 01.01.1950. Therapie: Ibuprofen 400 mg, 1-1-1.');
    doc.end();
  });
  const sans = await envoyer('arztbrief-inconnu', inconnu, `Arztbrief unbekannt (Test ${ts})`);
  const aInconnu = await attendreAlerte(sans.ref);
  verifier(aInconnu && aInconnu.faits.gravite === 'attention' && !aInconnu.chambre, 'Schreiben einer unbekannten Person: Meldung „nicht zugeordnet“, niemandem zugeordnet');
  const rattache = sql(`select count(*) from soins.alarmes where topic = 'courrier/${sans.ref}' and patient_id is not null;`);
  verifier(rattache === '0', 'Schreiben einer unbekannten Person: kein Bewohner in der Datenbank zugeordnet');

  // ---- 4. eine Nachricht OHNE Anhang (wie eine Übergabe) erzeugt nichts
  const avant = (await alertes()).length;
  await fetch(`${MAILPIT}/api/v1/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ From: EXPEDITEUR, To: [{ Email: MAISON }], Subject: `Nachricht ohne Anhang (Test ${ts})`, Text: 'Hier ist kein Schreiben.' }) });
  await pause(8000);
  verifier((await alertes()).length === avant, 'Nachricht ohne Anhang: keine Meldung');

  // ---- 5. dasselbe Schreiben erneut gesendet: keine zweite Meldung
  const doublon = await fetch(`${MAILPIT}/api/v1/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ From: EXPEDITEUR, To: [{ Email: MAISON }], Subject: `Arztbrief Weber (Test ${ts}) - erneut gesendet`, Text: 'Erneut gesendet.', Attachments: [{ Content: lettre('arztbrief-weber.pdf'), Filename: `arztbrief-weber-essai-${ts}.pdf` }] }) });
  await pause(15000);
  verifier(doublon.ok && Number(sql(`select count(*) from soins.alarmes where topic = 'courrier/${weber.ref}';`)) === 1, 'erneut gesendetes Schreiben: nur eine Meldung');

  // ---- 6. gescanntes Schreiben (OCR)
  const wagner = await envoyer('arztbrief-wagner-scan', lettre('arztbrief-wagner-scan.pdf'), `Arztbrief Wagner Scan (Test ${ts})`);
  const aWagner = await attendreAlerte(wagner.ref, 480000);
  verifier(aWagner && aWagner.faits.gravite === 'rouge' && /NSAR|Entzündungshemmer|AINS|anti-inflammatoire/i.test((aWagner.faits.contradictions ?? []).join(' ')), `Wagner (Scan, OCR): Widerspruch „NSAR und Niereninsuffizienz“, Meldung ${Math.round((Date.now() - wagner.t0) / 1000)} s nach dem Senden erhalten`);

  // ---- 7. Bestätigung: Fischer (ohne Widerspruch) kommt ins RAG, Weber (Widerspruch) nicht
  const validerCourrier = async (ref, chambre) => {
    const rapport = await n8n('aicare-verifier', { chambre, ref });
    const r = await n8n('aicare-valider', { brouillon_id: rapport.brouillon_id, texte: rapport.texte });
    return { rapport, r };
  };
  const vF = await validerCourrier(fischer.ref, '22');
  verifier(vF.r.ok && vF.r.apres_validation?.lettre?.ajoutee === true, 'Fischer: Bestätigung des Berichts -> Schreiben zu den Wissensquellen hinzugefügt');
  const compte = async (collection, filtre) => (await post(QDRANT, `collections/${collection}/points/count`, { exact: true, filter: filtre })).result.count;
  const filtreRef = (ref) => ({ must: [{ key: 'source_ref', match: { value: ref } }] });
  verifier((await compte('patients', { must: [...filtreRef(fischer.ref).must, { key: 'type', match: { value: 'lettre_validee' } }] })) >= 1, 'Fischer: das Schreiben ist in „patients“ (Typ lettre_validee)');
  const restants = await post(QDRANT, 'collections/a_verifier/points/scroll', { limit: 5, with_payload: ['statut'], filter: filtreRef(fischer.ref) });
  verifier(restants.result.points.every((p) => p.payload.statut === 'valide'), 'Fischer: das Schreiben ist nicht mehr „zu prüfen“ (Status valide)');
  const vW = await validerCourrier(weber.ref, '12');
  verifier(vW.r.ok && vW.r.apres_validation?.lettre?.ajoutee === false && /Widerspruch/.test(vW.r.apres_validation.lettre.motif), 'Weber: Bestätigung des Berichts gespeichert, aber das Schreiben bleibt „zu prüfen“ (Widerspruch zu klären)');
  verifier((await compte('patients', filtreRef(weber.ref))) === 0, 'Weber: das Schreiben ist NICHT in „patients“');
  verifier(Number(sql("select count(*) from soins.journal_ia where evenement in ('lettre_validee', 'lettre_non_ajoutee') and details->>'lettre' like '%essai-" + ts + "%';")) === 2, 'beide Entscheidungen sind im Prüfprotokoll festgehalten');

  }
  // ---- 8. ePA-Neuigkeiten: echte Abfrage des Workflows 40, in einer am Ende ABGEBROCHENEN Transaktion (die echten Daten bleiben unberührt)
  const requeteEpa = JSON.parse(readFileSync(join(racine, 'workflows', '40-connecteur-epa.json'), 'utf8')).nodes.find((n) => n.name === 'ePA-Neuigkeiten').parameters.query;
  const sortie = sql(`
    begin;
    delete from soins.alarmes where topic like 'epa/%';
    delete from soins.journal_imports where source = 'epa';
    insert into soins.journal_imports (source, reference, patient_id, empreinte, statut, detail, importe_le) values
      ('epa', 'epa/X/diagnostics#0', 'PAT-001', 'essai-ancien-1', 'importe', 'essai', now() - interval '2 hours'),
      ('epa', 'epa/X/eml#0', 'PAT-001', 'essai-nouveau-1', 'importe', 'essai', now()),
      ('epa', 'epa/Y/eml#0', 'PAT-002', 'essai-nouveau-2', 'importe', 'essai', now());
    ${requeteEpa};
    create temp table r (k text, v text);
    insert into r select 'premier', coalesce(string_agg(patient_id, ',' order by patient_id), '') from soins.alarmes where topic like 'epa/%';
    ${requeteEpa};
    insert into r select 'second', count(*)::text from soins.alarmes where topic like 'epa/%';
    select k || '=' || v from r;
    rollback;
  `);
  verifier(/premier=PAT-001\b/.test(sortie) && !/premier=.*PAT-002/.test(sortie), 'ePA: PAT-001 (bereits importiert, neuer Inhalt) wird gemeldet; PAT-002 (erster Import) nicht');
  verifier(/second=1\b/.test(sortie), 'ePA: die Abfrage erneut auszuführen erzeugt kein Duplikat');} finally {
  // ---- Aufräumen: Meldungen, Punkte und Protokoll der Testschreiben; Einstellung wie zuvor zurückgesetzt
  await n8n('aicare-reglage', { valeur: reglageInitial });
  if (fichiers.length) {
    const filtre = { should: fichiers.map((ref) => ({ key: 'source_ref', match: { value: ref } })) };
    for (const collection of ['a_verifier', 'patients']) await post(QDRANT, `collections/${collection}/points/delete?wait=true`, { filter: filtre });
    sql(`delete from soins.alarmes where ${fichiers.map((f) => `topic = 'courrier/${f}'`).join(' or ')};`);
    sql(`delete from soins.journal_imports where source = 'kim' and (${fichiers.map((f) => `reference like '${f}#%'`).join(' or ')});`);
  }
}
console.log(echecs ? `\n${echecs} Fehler.` : '\nAlles erfolgreich.');
process.exit(echecs ? 1 : 0);
