// Essai RÉEL de la page « Cotisations retraite » par n8n (n8n, PostgreSQL, OCR et, pour --ia, Ollama démarrés). Données fictives.
//   1. les 9 questionnaires passent par n8n SANS lecture par l'IA et sont comparés à data/sgb6/attendus.json (strict)
//   2. les 9 passent AVEC lecture par l'IA (llama3.2, plusieurs minutes chacun) : comparés à attendus.json, écarts rapportés ;
//      règle de sécurité vérifiée : l'IA ne rend jamais « prêt à valider » un dossier qui doit être en exception, ni un autre montant
//   3. dépôt d'un nouveau questionnaire valide, puis traitement ; dépôt refusé : trop gros, autre format, PDF scanné, faux PDF, texte sans rapport
//   4. décisions : « Refuser » sans motif et « Valider » avec une règle non remplie sont refusés ; le soignant vient de la session
//   5. appel sans session, sans clé : refusé
//   6. le journal ne contient aucun nom ni numéro d'assurance
// Lancer : node tests/sgb6-live.mjs                 (rapide : parties 1, 3, 4, 5, 6, environ 2 minutes)
//          node tests/sgb6-live.mjs --ia            (ajoute la partie 2 : 9 lectures par l'IA, 20 à 40 minutes)
//          node tests/sgb6-live.mjs --pilote --modele=qwen2.5:7b   (ajoute l'agent PILOTÉ par un modèle : cas a, d, i ; --pilote=tous pour les 9)
// Les durées par dossier sont écrites dans tests/resultats/sgb6-live.json. Les dossiers de test (dep-…) sont supprimés à la fin.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appelN8n, CLE, N8N, COMPTE_TEST } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const avecIA = process.argv.includes('--ia');
const argPilote = process.argv.find((a) => a.startsWith('--pilote'));
const avecPilote = Boolean(argPilote); // --pilote (a, d, i) ou --pilote=tous : agent piloté par un modèle local, plusieurs minutes par dossier
const modelePilote = process.argv.find((a) => a.startsWith('--modele='))?.slice(9) ?? 'qwen2.5:7b';
const iaSeule = process.argv.includes('--ia-seulement');
const dossierData = join(racine, 'data', 'sgb6');
const attendus = JSON.parse(readFileSync(join(dossierData, 'attendus.json'), 'utf8'));
const ids = Object.keys(attendus).filter((k) => !k.startsWith('_'));
const texteDe = (id) => readFileSync(join(dossierData, 'questionnaires', `${id}.txt`), 'utf8');
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

// lance l'agent et attend la fin ; renvoie { resultat, secondes, tache }
async function traiter(id, lecture_ia, options = {}) {
  const debut = Date.now();
  const t = await post('aicare-sgb6-lancer', { id, lecture_ia, ...options });
  if (!t.tache_id) return { erreur: t };
  const vus = new Set(); // les valeurs de « fait » vues pendant l'attente : l'agent avance-t-il étape par étape ?
  for (;;) {
    await pause(lecture_ia || options.pilote === 'modele' ? 3000 : 300);
    const e = await post('aicare-sgb6-tache', { tache_id: t.tache_id });
    vus.add(e.fait);
    if (e.statut && e.statut !== 'en_cours') return { resultat: e.resultat, etapes: e.etapes, statutTache: e.statut, secondes: (Date.now() - debut) / 1000, tache: t.tache_id, vus: [...vus] };
    if (Date.now() - debut > 25 * 60 * 1000) return { erreur: 'délai de 25 minutes dépassé' };
  }
}
function comparer(id, r, attendu, strict) {
  const ecarts = [];
  const res = r.resultat;
  if (!res) return ['aucun résultat'];
  if (res.statut !== attendu.statut) ecarts.push(`statut ${res.statut} (attendu ${attendu.statut})`);
  if ((res.calcul?.cotisation ?? null) !== attendu.cotisation) ecarts.push(`cotisation ${res.calcul?.cotisation ?? null} (attendu ${attendu.cotisation})`);
  if ((res.calcul?.base ?? null) !== attendu.base) ecarts.push(`base ${res.calcul?.base ?? null} (attendu ${attendu.base})`);
  for (const [nom, st] of Object.entries(attendu.regles)) if (res.regles.find((x) => x.regle === nom)?.statut !== st) ecarts.push(`${nom} ${res.regles.find((x) => x.regle === nom)?.statut} (attendu ${st})`);
  const ecartsChamps = res.regles.filter((x) => x.regle === 'ECART').map((x) => x.champ);
  if (JSON.stringify(ecartsChamps) !== JSON.stringify(attendu.ecarts)) ecarts.push(`écarts [${ecartsChamps}] (attendu [${attendu.ecarts}])`);
  if ((res.suspects?.length > 0) !== attendu.suspect) ecarts.push(`document suspect ${res.suspects?.length > 0} (attendu ${attendu.suspect})`);
  if (Object.values(attendu.regles).includes('non') && res.declaration !== null) ecarts.push('un brouillon de déclaration existe malgré une règle « non »');
  if (strict && res.lecture_ia?.demande === true) ecarts.push('lecture IA demandée à tort');
  return ecarts;
}

const resultats = { date: new Date().toISOString(), sans_ia: {}, avec_ia: {} };
const aNettoyer = [];

// ---- 1. sans lecture par l'IA : strict -------------------------------------------------------------------------------------
if (!iaSeule) {
  console.log('\n== 1. les 9 questionnaires par n8n, SANS lecture par l\'IA ==');
  for (const id of ids) {
    const r = await traiter(id, false);
    const ecarts = r.erreur ? [`erreur : ${JSON.stringify(r.erreur)}`] : comparer(id, r, attendus[id], true);
    resultats.sans_ia[id] = { secondes: r.secondes, ecarts, statut: r.resultat?.statut, cotisation: r.resultat?.calcul?.cotisation ?? null };
    verifier(ecarts.length === 0, `${id} : ${r.resultat?.statut}, ${r.resultat?.calcul?.cotisation ?? 'aucun calcul'} € en ${r.secondes?.toFixed(1)} s${ecarts.length ? ' — ' + ecarts.join(' ; ') : ''}`);
    if (id === 'a-becker-clair') {
      verifier([3, 4, 5, 6, 7].every((n) => r.vus.includes(n)), `l'avancement est écrit après chaque étape 3 à 7 : valeurs de « fait » vues pendant l'attente : ${r.vus.join(', ')}`);
      verifier(Number(sql(`SELECT count(DISTINCT date_trunc('second', horodatage)) FROM soins.sgb6_journal WHERE tache_id = '${r.tache}'`)) >= 6, 'le journal est écrit étape par étape (lignes réparties sur plusieurs secondes, pas d\'un bloc)');
    }
    if (r.etapes) verifier(r.etapes.length === 8 && ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration', 'enregistrer'].every((e, i) => r.etapes[i]?.etape === e), `${id} : les 8 étapes sont journalisées dans l'ordre`);
  }
  // le dernier résultat se relit sans relancer l'agent
  const rel = await post('aicare-sgb6-dossier', { id: 'a-becker-clair' });
  verifier(rel.ok && rel.resultat?.calcul?.cotisation === 316.32 && rel.statut === 'pret_a_valider', 'aicare-sgb6-dossier : le dernier résultat du cas a (316,32 €) se relit sans relancer l\'agent');
  const liste = await post('aicare-sgb6-lister', {});
  verifier(liste.dossiers?.filter((d) => ids.includes(d.id)).length === 9 && liste.dossiers.find((d) => d.id === 'a-becker-clair').statut === 'pret_a_valider', 'aicare-sgb6-lister : les dossiers et leur statut');
}

// ---- 2. avec lecture par l'IA ------------------------------------------------------------------------------------------------
if (avecPilote && !iaSeule) {
  console.log(`\n== 1 bis. agent PILOTÉ par le modèle ${modelePilote} (le statut et les montants viennent du code) ==`);
  const cas = argPilote === '--pilote=tous' ? ids : ids.filter((i) => ['a', 'd', 'i'].includes(i.split('-')[0]));
  resultats.pilote = {};
  for (const id of cas) {
    const r = await traiter(id, false, { pilote: 'modele', modele: modelePilote });
    const res = r.resultat;
    const tours = (r.etapes ?? []).filter((e) => e.etape === 'tour');
    const ecarts = r.erreur ? [`erreur : ${JSON.stringify(r.erreur)}`] : comparer(id, r, attendus[id], false);
    resultats.pilote[id] = { secondes: r.secondes, tours: tours.length, refus: tours.filter((x) => !x.accepte).length, mode: res?.pilote?.mode, abandon: res?.pilote?.abandon ?? null, ecarts, statut: res?.statut, cotisation: res?.calcul?.cotisation ?? null };
    verifier(ecarts.length === 0, `${id} piloté par ${modelePilote} : ${res?.statut}, ${res?.calcul?.cotisation ?? 'aucun calcul'} € en ${r.secondes?.toFixed(0)} s, ${tours.length} tours, ${tours.filter((x) => !x.accepte).length} refus, mode ${res?.pilote?.mode}${res?.pilote?.abandon ? ' (abandon : ' + res.pilote.abandon + ')' : ''}${ecarts.length ? ' — ' + ecarts.join(' ; ') : ''}`);
    if (res?.pilote?.mode === 'modele') {
      verifier(tours.length >= 7 && tours.every((x) => typeof x.accepte === 'boolean' && x.choisi_par === 'modele'), `${id} : une ligne de journal par tour (outil, raison, accepté ou refusé), choisie par le modèle`);
      verifier(tours.filter((x) => x.accepte).every((x) => (x.raison ?? '').length >= 10), `${id} : une raison pour chaque appel accepté`);
      verifier(res.pilote.compte_rendu?.length > 20, `${id} : compte rendu de l'agent présent`);
    }
    verifier(r.vus?.length >= 4, `${id} : l'avancement est écrit après chaque tour (valeurs vues : ${r.vus?.join(', ')})`);
    console.log(`     compte rendu : ${(res?.pilote?.compte_rendu ?? '(aucun)').slice(0, 220)}${res?.pilote?.contradictions?.length ? ' ; CONTRADICTIONS : ' + res.pilote.contradictions.join(' | ') : ''}`);
  }
}

if (avecPilote && !iaSeule) {
  // libère la mémoire du modèle (5 Go) avant les contrôles de base de données : docker compose exec n'aime pas un poste à court de RAM
  await fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: modelePilote, keep_alive: 0 }) }).catch(() => {});
}

if (avecIA || iaSeule) {
  console.log('\n== 2. les 9 questionnaires par n8n, AVEC lecture par l\'IA (llama3.2) ==');
  for (const id of ids) {
    const r = await traiter(id, true);
    const res = r.resultat;
    const attendu = attendus[id];
    const ecarts = r.erreur ? [`erreur : ${JSON.stringify(r.erreur)}`] : comparer(id, r, attendu, false);
    resultats.avec_ia[id] = { secondes: r.secondes, ecarts, statut: res?.statut, cotisation: res?.calcul?.cotisation ?? null, lecture: res?.lecture_ia };
    console.log(`     ${id} : ${res?.statut}, ${res?.calcul?.cotisation ?? 'aucun calcul'} € en ${r.secondes?.toFixed(0)} s ; lecture IA : ${res?.lecture_ia?.utilise ? `${res.lecture_ia.lus} champs, ${res.lecture_ia.ecartes.length} écartés, ${res.lecture_ia.differences.length} différences` : `repli (${res?.lecture_ia?.motif})`}${ecarts.length ? ' ; ÉCARTS : ' + ecarts.join(' ; ') : ''}`);
    // règle de sécurité : l'IA ne fait jamais passer un dossier en exception à « prêt », ni changer le montant d'un dossier prêt
    verifier(!(res?.statut === 'pret_a_valider' && attendu.statut !== 'pret_a_valider'), `${id} : l'IA ne rend pas « prêt à valider » un dossier qui doit être en exception`);
    if (res?.statut === 'pret_a_valider') verifier(res.calcul?.cotisation === attendu.cotisation, `${id} : prêt avec la bonne cotisation`);
    if (res?.lecture_ia?.utilise && res.statut === 'exception') {
      const base = res.declaration?.find((x) => x.cle === 'base_cotisation')?.valeur ?? 'pas de brouillon';
      verifier(res.calcul === null && res.provisoire === false, `${id} : lecture par l'IA et exception : aucun montant, même provisoire (base : ${base})`);
      if (res.declaration) verifier(base === 'Montant non calculé : données à vérifier', `${id} : le brouillon dit « Montant non calculé : données à vérifier »`);
    }
    verifier(!res?.suspects || (res.suspects.length > 0) === attendu.suspect, `${id} : document suspect repéré par le code, quelle que soit la lecture`);
  }
}

const nettoyer = () => {
  for (const id of aNettoyer.filter(Boolean)) sql(`DELETE FROM soins.sgb6_journal WHERE dossier_id = '${id}'; DELETE FROM soins.sgb6_decisions WHERE dossier_id = '${id}'; DELETE FROM soins.sgb6_dossiers WHERE id = '${id}'; DELETE FROM soins.taches WHERE type = 'sgb6_agent' AND parametres->>'dossier' = '${id}'`);
};
if (!iaSeule) try {
  // ---- 3. dépôt ---------------------------------------------------------------------------------------------------------------
  console.log('\n== 3. dépôt d\'un questionnaire ==');
  const copie = (id, nouveauNom) => texteDe(id).replace('Becker, Anna', 'Becker, Anna');
  const d1 = await deposer('nouveau-questionnaire.txt', Buffer.from(copie('a-becker-clair')));
  verifier(d1.ok === true && /^dep-[0-9a-f]{10}$/.test(d1.id), `dépôt d'un .txt valide : ${d1.id ?? JSON.stringify(d1)}`);
  if (d1.id) aNettoyer.push(d1.id);
  const l1 = await post('aicare-sgb6-lister', {});
  verifier(l1.dossiers?.find((d) => d.id === d1.id)?.statut === 'a_traiter', 'le dossier déposé est « à traiter »');
  const t1 = await traiter(d1.id, false);
  verifier(t1.resultat?.statut === 'pret_a_valider' && t1.resultat.calcul.cotisation === 316.32, `le dossier déposé est traité : ${t1.resultat?.statut}, ${t1.resultat?.calcul?.cotisation} €`);

  // PDF contenant du texte (créé avec pdfkit, déjà utilisé par data/scripts)
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
  verifier(dPdf.ok === true, `dépôt d'un PDF contenant du texte : ${dPdf.id ?? JSON.stringify(dPdf)}`);
  if (dPdf.id) {
    aNettoyer.push(dPdf.id);
    const tPdf = await traiter(dPdf.id, false);
    verifier(tPdf.resultat?.regles?.length >= 6 && tPdf.resultat.donnees.aidant_nom === 'Pdf', `le PDF est lu et traité : ${tPdf.resultat?.statut}`);
  }

  const refuse = async (nom, octets, erreur, libelle) => {
    const r = await deposer(nom, octets);
    verifier(r.ok === false && r.erreur === erreur, `${libelle} : refusé (${r.erreur ?? JSON.stringify(r)})`);
    if (r.ok) aNettoyer.push(r.id);
  };
  await refuse('gros.txt', Buffer.alloc(1048577, 'a'), 'taille', 'fichier de 1 Mo + 1 octet');
  await refuse('gros.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1100000, 'a')]), 'taille', 'PDF de plus de 1 Mo');
  await refuse('questionnaire.docx', Buffer.from(texteDe('a-becker-clair')), 'format', 'autre format (.docx)');
  await refuse('questionnaire.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'format', 'autre format (.png)');
  await refuse('script.exe', Buffer.from('MZ'), 'format', 'autre format (.exe)');
  await refuse('faux.pdf', Buffer.from(texteDe('a-becker-clair')), 'format', 'faux PDF (texte renommé)');
  await refuse('binaire.txt', Buffer.from([0x41, 0x00, 0x42, 0x00]), 'format', '.txt binaire');
  await refuse('rien.txt', Buffer.from('Liste de courses : pain, lait, œufs, café, sucre, farine.'), 'pas_un_questionnaire', 'texte sans rapport avec un questionnaire');
  await refuse('vide.txt', Buffer.alloc(0), 'vide', 'fichier vide');
  const scan = readFileSync(join(racine, 'data', 'lettres', 'arztbrief-wagner-scan.pdf'));
  await refuse('scan.pdf', scan, 'scan', 'PDF scanné (image sans texte)');

  // ---- 4. décisions -------------------------------------------------------------------------------------------------------------
  console.log('\n== 4. décisions humaines ==');
  const exc = await deposer('copie-d.txt', Buffer.from(texteDe('d-lehmann-8-heures')));
  const ok = await deposer('copie-a.txt', Buffer.from(texteDe('a-becker-clair')));
  aNettoyer.push(exc.id, ok.id);
  let r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'pas_en_attente', `décision avant que l'agent ait traité le dossier : refusée (${r.erreur})`);
  await traiter(exc.id, false);
  await traiter(ok.id, false);
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'regle_non_ok', `« Valider » avec une règle non remplie : refusé (${r.erreur})`);
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'refuser', motif: '' });
  verifier(r.ok === false && r.erreur === 'motif_obligatoire', `« Refuser » sans motif : refusé (${r.erreur})`);
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'refuser', motif: '   ' });
  verifier(r.ok === false && r.erreur === 'motif_obligatoire', '« Refuser » avec un motif de blancs : refusé');
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'refuser', motif: 'motif quelconque' });
  verifier(r.ok === false && r.erreur === 'refus_hors_exception', `« Refuser » un dossier prêt (hors exception) : refusé (${r.erreur})`);
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'inconnue' });
  verifier(r.statut !== 200 || r.ok !== true, '« décision » inconnue : refusée');
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'revue' });
  verifier(r.ok === true && r.revue === true && r.statut === 'exception', 'tâche de revue sur un dossier en exception : le statut reste « exception »');
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'revue' });
  verifier(r.ok === false && r.erreur === 'revue_deja_creee', 'une seule tâche de revue par dossier');
  r = await post('aicare-sgb6-decider', { id: exc.id, decision: 'refuser', motif: '8 h de soins seulement dans l\'expertise', soignant: 'usurpe', valide_par: 'usurpe' });
  verifier(r.ok === true && r.statut === 'refuse', 'refus avec motif après une exception : accepté');
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'valider', soignant: 'usurpe' });
  verifier(r.ok === true && r.statut === 'valide', 'validation d\'un dossier prêt (toutes les règles ok) : acceptée');
  r = await post('aicare-sgb6-decider', { id: ok.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'pas_en_attente', 'un dossier validé ne peut plus être décidé');
  r = await post('aicare-sgb6-lancer', { id: ok.id, lecture_ia: false });
  verifier(r.ok === false && r.erreur === 'decide', 'un dossier décidé ne peut plus être retraité');
  const signataires = sql(`SELECT string_agg(DISTINCT soignant, ',') FROM soins.sgb6_decisions WHERE dossier_id IN ('${exc.id}', '${ok.id}')`);
  verifier(signataires === COMPTE_TEST, `le signataire vient de la session (« ${COMPTE_TEST} »), jamais du corps de la requête : ${signataires}`);
  const apres = await post('aicare-sgb6-dossier', { id: exc.id });
  verifier(apres.statut === 'refuse' && apres.derniere_decision?.motif?.includes('8 h') && apres.revue === true, 'la décision reste visible après coup (statut, motif, revue)');
  const statutBase = sql(`SELECT statut FROM soins.sgb6_dossiers WHERE id = '${ok.id}'`);
  verifier(statutBase === 'valide', 'la validation est écrite en base');
  // un résultat falsifié en base n'ouvre pas la validation : la règle se lit dans le résultat enregistré
  const g = await deposer('copie-g.txt', Buffer.from(texteDe('g-wolf-ecart-degre')));
  aNettoyer.push(g.id);
  await traiter(g.id, false);
  r = await post('aicare-sgb6-decider', { id: g.id, decision: 'valider' });
  verifier(r.ok === false && r.erreur === 'regle_non_ok', `« Valider » avec un écart « incertain » : refusé (${r.erreur})`);

  const nonPermis = await post('aicare-sgb6-lancer', { id: 'a-becker-clair', pilote: 'modele', modele: 'evil; DROP TABLE x' });
  verifier(!nonPermis.tache_id, `un modèle hors de la liste fermée est refusé (HTTP ${nonPermis.statut})`);
  const pilotInconnu = await post('aicare-sgb6-lancer', { id: 'a-becker-clair', pilote: 'pirate' });
  verifier(!pilotInconnu.tache_id, `un pilote inconnu est refusé (HTTP ${pilotInconnu.statut})`);
  const lm = await post('aicare-sgb6-lister', {});
  verifier(typeof lm.modele === 'string' && Array.isArray(lm.modeles) && lm.modeles.every((m) => typeof m.nom === 'string' && typeof m.installe === 'boolean') && lm.modeles.some((m) => m.nom === lm.modele), `la liste donne le modèle par défaut (${lm.modele}) et les modèles permis avec leur état : ${lm.modeles?.map((m) => m.nom + (m.installe ? ' ✓' : ' ✗')).join(', ')}`);

  // ---- 5. sécurité ------------------------------------------------------------------------------------------------------------
  console.log('\n== 5. appels sans session, sans clé ==');
  const corps = { id: 'a-becker-clair', decision: 'valider', tache_id: '00000000-0000-0000-0000-000000000000', nom: 'x.txt', contenu_base64: '' };
  for (const chemin of ['lister', 'deposer', 'lancer', 'tache', 'dossier', 'decider']) {
    const sansSession = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': CLE }, body: JSON.stringify(corps) });
    const j = await sansSession.json().catch(() => ({}));
    verifier(j.erreur === 'session', `aicare-sgb6-${chemin} sans session : refusé (${JSON.stringify(j).slice(0, 60)})`);
    const sansCle = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    verifier(sansCle.status === 403 || sansCle.status === 401, `aicare-sgb6-${chemin} sans clé : HTTP ${sansCle.status}`);
    const mauvaise = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': 'mauvaise', Authorization: `Bearer ${'A'.repeat(43)}` }, body: JSON.stringify(corps) });
    verifier(mauvaise.status === 403 || mauvaise.status === 401, `aicare-sgb6-${chemin} avec une mauvaise clé : HTTP ${mauvaise.status}`);
    const jetonFaux = await fetch(`${N8N}/aicare-sgb6-${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': CLE, Authorization: `Bearer ${'A'.repeat(43)}` }, body: JSON.stringify(corps) });
    verifier((await jetonFaux.json().catch(() => ({}))).erreur === 'session', `aicare-sgb6-${chemin} avec un faux jeton : refusé`);
  }

  // ---- 6. journal sans donnée personnelle ----------------------------------------------------------------------------------------
  console.log('\n== 6. le journal ne contient ni nom ni numéro d\'assurance ==');
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
  verifier(lignes > 70 && trouves.length === 0, `${lignes} lignes de journal, ${interdits.size} noms et numéros cherchés, ${trouves.length} trouvé(s) ${trouves.join(', ')}`);
  verifier(!/\d{8}[A-Z]\d{3}/.test(journal), 'aucun numéro d\'assurance (motif de 12 caractères) dans le journal');
  verifier(sql("SELECT count(*) FROM soins.sgb6_journal WHERE choisi_par = 'humain' AND soignant IS NULL") === '0', 'chaque ligne « humain » du journal porte le soignant de la session');
}

 finally {
  nettoyer();
}

// ---- bilan --------------------------------------------------------------------------------------------------------
mkdirSync(join(racine, 'tests', 'resultats'), { recursive: true });
const fichier = join(racine, 'tests', 'resultats', 'sgb6-live.json');
let ancien = {};
try {
  ancien = JSON.parse(readFileSync(fichier, 'utf8'));
} catch {
  /* premier passage */
}
writeFileSync(fichier, JSON.stringify({ ...ancien, ...resultats, sans_ia: iaSeule ? ancien.sans_ia : resultats.sans_ia, avec_ia: avecIA || iaSeule ? resultats.avec_ia : ancien.avec_ia }, null, 2));
console.log(`\n${echecs === 0 ? 'Tout est OK.' : `${echecs} échec(s).`} Résultats : tests/resultats/sgb6-live.json`);
process.exit(echecs === 0 ? 0 : 1);
