// Essai RÉEL des documents en automatique : de vrais courriers (PDF en pièce jointe) sont envoyés dans Mailpit ; Mailpit prévient n8n par
// webhook ; n8n extrait le texte (OCR pour le scan), identifie le résident par nom + date de naissance, applique les règles de contrôle,
// crée l'alerte ; la validation du rapport ajoute (ou non) la lettre au RAG. Mesure aussi les nouveautés de l'ePA (requête réelle).
// Lancer : node tests/courrier-live.mjs        (n8n, Mailpit, Qdrant, PostgreSQL, OCR et Ollama démarrés ; quelques minutes)
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
  console.log(`${condition ? 'OK  ' : 'ÉCHEC'} ${message}`);
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
const EXPEDITEUR = { Email: 'essai-courrier@kim.example.test', Name: 'Courrier d\'essai' };
const MAISON = 'pflegeheim-sonnenhof@kim.example.test';
const fichiers = [];

async function envoyer(nom, pdfBase64, objet) {
  const fichier = `${nom}-essai-${ts}.pdf`;
  fichiers.push(`kim/${EXPEDITEUR.Email}/${fichier}`);
  const t0 = Date.now();
  const r = await fetch(`${MAILPIT}/api/v1/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: EXPEDITEUR, To: [{ Email: MAISON }], Subject: objet, Text: 'Arztbrief im Anhang (Essai).', Attachments: [{ Content: pdfBase64, Filename: fichier }] }),
  });
  if (!r.ok) throw new Error(`envoi impossible : HTTP ${r.status}`);
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

const soloEpa = process.argv.includes('--epa'); // rejouer seulement la partie « nouveautés de l'ePA »
// ---- préparation : analyse IA coupée (les règles suffisent à cet essai), anciennes alertes de courrier acquittées
const reglageInitial = (await n8n('aicare-reglage', {})).valeur;
await n8n('aicare-reglage', { valeur: false });
sql("update soins.alarmes set statut = 'acquittee', acquittee_le = now() where type = 'document' and statut = 'nouvelle';");

try {
  if (!soloEpa) {
  // ---- 1. Weber : amoxicilline + allergie à la pénicilline
  const weber = await envoyer('arztbrief-weber', lettre('arztbrief-weber.pdf'), `Arztbrief Weber (essai ${ts})`);
  const aWeber = await attendreAlerte(weber.ref);
  const dWeber = Date.now() - weber.t0;
  verifier(aWeber && aWeber.faits.gravite === 'rouge', `Weber : alerte ROUGE reçue ${Math.round(dWeber / 1000)} s après l'envoi du courrier`);
  verifier(aWeber?.faits.contradictions?.some((c) => /pénicilline/i.test(c)) && aWeber.chambre === '12', 'Weber : contradiction « pénicilline » (règles de contrôle), chambre 12');

  // ---- 2. Fischer : aucune contradiction
  const fischer = await envoyer('arztbrief-fischer', lettre('arztbrief-fischer.pdf'), `Arztbrief Fischer (essai ${ts})`);
  const aFischer = await attendreAlerte(fischer.ref);
  verifier(aFischer && aFischer.faits.gravite === 'info' && !aFischer.faits.contradictions?.length, 'Fischer : information « aucune contradiction » (pas d\'alarme rouge)');

  // ---- 3. courrier d'un inconnu : jamais rattaché
  const PDFDocument = requireData('pdfkit');
  const inconnu = await new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 64 });
    const morceaux = [];
    doc.on('data', (m) => morceaux.push(m));
    doc.on('end', () => resolve(Buffer.concat(morceaux).toString('base64')));
    doc.fontSize(12).text('Arztbrief. Patient: Herr Max Unbekannt, geb. 01.01.1950. Therapie: Ibuprofen 400 mg, 1-1-1.');
    doc.end();
  });
  const sans = await envoyer('arztbrief-inconnu', inconnu, `Arztbrief inconnu (essai ${ts})`);
  const aInconnu = await attendreAlerte(sans.ref);
  verifier(aInconnu && aInconnu.faits.gravite === 'attention' && !aInconnu.chambre, 'courrier d\'un inconnu : alerte « non identifié », rattaché à personne');
  const rattache = sql(`select count(*) from soins.alarmes where topic = 'courrier/${sans.ref}' and patient_id is not null;`);
  verifier(rattache === '0', 'courrier d\'un inconnu : aucun résident associé en base');

  // ---- 4. un message SANS pièce jointe (comme une transmission) ne crée rien
  const avant = (await alertes()).length;
  await fetch(`${MAILPIT}/api/v1/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ From: EXPEDITEUR, To: [{ Email: MAISON }], Subject: `Message sans pièce jointe (essai ${ts})`, Text: 'Aucune lettre ici.' }) });
  await pause(8000);
  verifier((await alertes()).length === avant, 'message sans pièce jointe : aucune alerte');

  // ---- 5. le même courrier renvoyé : pas de seconde alerte
  const doublon = await fetch(`${MAILPIT}/api/v1/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ From: EXPEDITEUR, To: [{ Email: MAISON }], Subject: `Arztbrief Weber (essai ${ts}) - renvoi`, Text: 'Renvoi.', Attachments: [{ Content: lettre('arztbrief-weber.pdf'), Filename: `arztbrief-weber-essai-${ts}.pdf` }] }) });
  await pause(15000);
  verifier(doublon.ok && Number(sql(`select count(*) from soins.alarmes where topic = 'courrier/${weber.ref}';`)) === 1, 'courrier renvoyé : une seule alerte');

  // ---- 6. courrier scanné (OCR)
  const wagner = await envoyer('arztbrief-wagner-scan', lettre('arztbrief-wagner-scan.pdf'), `Arztbrief Wagner scan (essai ${ts})`);
  const aWagner = await attendreAlerte(wagner.ref, 480000);
  verifier(aWagner && aWagner.faits.gravite === 'rouge' && /AINS|anti-inflammatoire/i.test((aWagner.faits.contradictions ?? []).join(' ')), `Wagner (scan, OCR) : contradiction « AINS et insuffisance rénale », alerte reçue ${Math.round((Date.now() - wagner.t0) / 1000)} s après l'envoi`);

  // ---- 7. validation : Fischer (sans contradiction) entre dans le RAG, Weber (contradiction) non
  const validerCourrier = async (ref, chambre) => {
    const rapport = await n8n('aicare-verifier', { chambre, ref });
    const r = await n8n('aicare-valider', { brouillon_id: rapport.brouillon_id, texte: rapport.texte });
    return { rapport, r };
  };
  const vF = await validerCourrier(fischer.ref, '22');
  verifier(vF.r.ok && vF.r.apres_validation?.lettre?.ajoutee === true, 'Fischer : validation du rapport -> lettre ajoutée aux sources d\'intelligence');
  const compte = async (collection, filtre) => (await post(QDRANT, `collections/${collection}/points/count`, { exact: true, filter: filtre })).result.count;
  const filtreRef = (ref) => ({ must: [{ key: 'source_ref', match: { value: ref } }] });
  verifier((await compte('patients', { must: [...filtreRef(fischer.ref).must, { key: 'type', match: { value: 'lettre_validee' } }] })) >= 1, 'Fischer : la lettre est dans « patients » (type lettre_validee)');
  const restants = await post(QDRANT, 'collections/a_verifier/points/scroll', { limit: 5, with_payload: ['statut'], filter: filtreRef(fischer.ref) });
  verifier(restants.result.points.every((p) => p.payload.statut === 'valide'), 'Fischer : la lettre n\'est plus « à vérifier » (statut valide)');
  const vW = await validerCourrier(weber.ref, '12');
  verifier(vW.r.ok && vW.r.apres_validation?.lettre?.ajoutee === false && /contradiction/.test(vW.r.apres_validation.lettre.motif), 'Weber : validation du rapport enregistrée, mais la lettre reste « à vérifier » (contradiction à clarifier)');
  verifier((await compte('patients', filtreRef(weber.ref))) === 0, 'Weber : la lettre n\'est PAS dans « patients »');
  verifier(Number(sql("select count(*) from soins.journal_ia where evenement in ('lettre_validee', 'lettre_non_ajoutee') and details->>'lettre' like '%essai-" + ts + "%';")) === 2, 'les deux décisions sont tracées au journal d\'audit');

  }
  // ---- 8. nouveautés de l'ePA : requête réelle du workflow 40, dans une transaction ANNULÉE à la fin (les vraies données ne sont pas touchées)
  const requeteEpa = JSON.parse(readFileSync(join(racine, 'workflows', '40-connecteur-epa.json'), 'utf8')).nodes.find((n) => n.name === 'Nouveautés ePA').parameters.query;
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
  verifier(/premier=PAT-001\b/.test(sortie) && !/premier=.*PAT-002/.test(sortie), 'ePA : PAT-001 (déjà importé, contenu nouveau) est notifié ; PAT-002 (première importation) ne l\'est pas');
  verifier(/second=1\b/.test(sortie), 'ePA : relancer la requête ne crée pas de doublon');} finally {
  // ---- nettoyage : alertes, points et journal des courriers d'essai ; réglage remis comme avant
  await n8n('aicare-reglage', { valeur: reglageInitial });
  if (fichiers.length) {
    const filtre = { should: fichiers.map((ref) => ({ key: 'source_ref', match: { value: ref } })) };
    for (const collection of ['a_verifier', 'patients']) await post(QDRANT, `collections/${collection}/points/delete?wait=true`, { filter: filtre });
    sql(`delete from soins.alarmes where ${fichiers.map((f) => `topic = 'courrier/${f}'`).join(' or ')};`);
    sql(`delete from soins.journal_imports where source = 'kim' and (${fichiers.map((f) => `reference like '${f}#%'`).join(' or ')});`);
  }
}
console.log(echecs ? `\n${echecs} échec(s).` : '\nTout est réussi.');
process.exit(echecs ? 1 : 0);
