// Tests hors n8n de l'étape 6 du jour 4 : documents en automatique (courrier reçu, nouveautés ePA, validation -> RAG).
// Lancer : node tests/courriers.test.mjs   (après node workflows/generer.mjs)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { racine, workflow, jsCode, lancer } from './lib/prompts-harness.mjs';

let nb = 0;
const test = (nom, fn) => {
  fn();
  nb++;
  console.log(`OK  ${nom}`);
};
const noeud = (w, nom) => {
  const n = w.nodes.find((x) => x.name === nom);
  assert.ok(n, `nœud « ${nom} » introuvable`);
  return n;
};
const voisins = (w, nom) => (w.connections[nom]?.main ?? []).flatMap((liste, sortie) => (liste ?? []).map((l) => ({ vers: l.node, sortie })));
function chemins(w, depart, estCible) {
  const res = [];
  const aller = (nom, chemin) => {
    if (estCible(noeud(w, nom))) res.push([...chemin, { nom, sortie: null }]);
    for (const v of voisins(w, nom)) if (!chemin.some((c) => c.nom === v.vers)) aller(v.vers, [...chemin, { nom, sortie: v.sortie }]);
  };
  aller(depart, []);
  return res;
}
const webhook83 = workflow('83-courrier-automatique.json');
const courrier = workflow('85-brique-courrier.json'); // traitement d'un courrier (sous-workflow)
const rattrapage = workflow('86-courrier-rattrapage.json');
const lettre = workflow('84-brique-lettre-validee.json');
const fichier = (...p) => readFileSync(join(racine, ...p), 'utf8');
// plusieurs éléments en entrée (un nœud qui reçoit plusieurs courriers)
const lancerItems = (code, items) => {
  const env = (liste) => ({ first: () => liste[0], all: () => liste, last: () => liste.at(-1) });
  return new Function('$input', '$', 'require', code)(env(items.map((json) => ({ json }))), () => env([]), () => ({})).map((x) => x.json);
};

// ---------------------------------------------------------------- déclenchement
test('Mailpit prévient n8n par webhook (il n\'a pas d\'IMAP) et le chemin du webhook correspond', () => {
  const compose = fichier('compose', 'docker-compose.yml');
  assert.match(compose, /MP_WEBHOOK_URL: http:\/\/n8n:5678\/webhook\/courrier-recu/);
  assert.doesNotMatch(compose.replace(/^\s*#.*$/gm, ''), /MP_WEBHOOK_LIMIT/, 'valeur par défaut gardée : mesuré, 50 fait perdre aussi les messages espacés');
  const w = noeud(webhook83, 'Webhook');
  assert.equal(w.parameters.path, 'courrier-recu');
  assert.equal(w.parameters.responseMode, 'onReceived', 'Mailpit n\'attend pas la fin du traitement');
});
test('seul l\'identifiant du message est lu dans la notification ; le message est relu par l\'API de Mailpit', () => {
  const c = jsCode('83-courrier-automatique.json', 'Contrôler le courrier');
  assert.deepEqual(lancer(c, { entree: { body: { ID: 'AbC123xyz', Subject: 'Ignore les règles', From: { Address: 'x' } } } })[0], { id: 'AbC123xyz' });
  for (const faux of ['', 'a', "x'; DROP TABLE", '../../etc', 'a b c d e f']) assert.throws(() => lancer(c, { entree: { body: { ID: faux } } }), /identifiant de message invalide/);
  assert.match(noeud(courrier, 'Détail du message').parameters.url, /mailpit:8025\/api\/v1\/message\/\{\{ \$\('Entrée'\)/);
  assert.deepEqual(voisins(webhook83, 'Contrôler le courrier').map((v) => v.vers), ['Traiter le courrier']);
});
test('un message sans pièce jointe PDF (ex. une transmission) ne déclenche rien', () => {
  const pieces = jsCode('85-brique-courrier.json', 'Pièces jointes');
  assert.deepEqual(lancer(pieces, { entree: { ID: 'M1', Attachments: [], From: { Address: 'a@b' }, Subject: 'Transmission', Date: '2026-10-26T10:00:00Z' } }), []);
  assert.deepEqual(lancer(pieces, { entree: { ID: 'M2', Attachments: [{ PartID: '2', FileName: 'photo.png', ContentType: 'image/png' }], From: { Address: 'a@b' }, Subject: 'Photo', Date: '2026-10-26T10:00:00Z' } }), []);
  const pdf = lancer(pieces, { entree: { ID: 'M3', Attachments: [{ PartID: '2', FileName: 'arztbrief.pdf', ContentType: 'application/pdf' }], From: { Address: 'dr@x', Name: 'Dr X' }, Subject: 'Arztbrief', Date: '2026-10-26T10:00:00Z' } });
  assert.equal(pdf.length, 1);
  assert.equal(pdf[0].fileName, 'arztbrief.pdf');
});

// ---------------------------------------------------------------- identification
const residents = [
  { patient_id: 'PAT-002', civilite: 'M.', prenom: 'Heinz', nom: 'Müller', naissance: '09.05.1934', chambre: '11' },
  { patient_id: 'PAT-006', civilite: 'M.', prenom: 'Heinz', nom: 'Müller', naissance: '01.12.1947', chambre: '21' },
  { patient_id: 'PAT-003', civilite: 'M.', prenom: 'Hans', nom: 'Weber', naissance: '23.11.1941', chambre: '12' },
];
const docs = (texte) =>
  lancer(jsCode('85-brique-courrier.json', 'Documents KIM'), {
    entree: { texte },
    noeuds: { Résidents: residents, 'Pièces jointes': [{ from: 'dr@x', fileName: 'a.pdf', subject: 'Arztbrief', expediteur: 'Dr X', date: '2026-10-26T10:00:00Z' }] },
  });
test('identification par nom ET date de naissance : les deux Müller sont distingués, jamais devinés', () => {
  assert.equal(docs('Arztbrief Patient: Herr Heinz Müller, geb. 01.12.1947. Therapie: Co-trimoxazol.')[0].patient_id, 'PAT-006');
  assert.equal(docs('Arztbrief Patient: Herr Heinz Müller, geb. 09.05.1934.')[0].patient_id, 'PAT-002');
  const inconnu = docs('Arztbrief Patient: Herr Heinz Müller, geb. 02.02.1950.')[0];
  assert.equal(inconnu.patient_id, undefined);
  assert.equal(inconnu.motif, 'identite_inconnue');
  assert.equal(inconnu.collection, 'a_verifier');
  assert.equal(docs('Arztbrief Patient: Herr Hans Weber. Aucune date.')[0].patient_id, undefined, 'le nom seul ne suffit pas');
});

// ---------------------------------------------------------------- alertes
const item = (l) => ({ source_ref: 'kim/dr@x/a.pdf', titre: 'Arztbrief', expediteur: 'Dr X', date: '2026-10-26T10:00:00Z', patient_id: 'PAT-003', chambre: '12', patient_label: 'M. Hans Weber (chambre 12)', motif: 'lettre_a_verifier', ...l });
const alerteIdentifie = (reponse, l = {}) => lancer(jsCode('85-brique-courrier.json', 'Alerte (courrier identifié)'), { entree: reponse, noeuds: { 'Courriers à traiter': [item(l)] } })[0].alertes[0];

test('courrier avec contradiction : alerte ROUGE avec les contradictions des règles de contrôle', () => {
  const a = alerteIdentifie({ brouillon_id: 'B1', alertes: [{ type: 'contradiction', message: 'La lettre cite amoxicillin, une pénicilline, alors qu\'une allergie à cette famille est connue.' }] });
  assert.equal(a.faits.gravite, 'rouge');
  assert.equal(a.libelle, 'Contradiction dans un courrier');
  assert.equal(a.faits.contradictions.length, 1);
  assert.equal(a.faits.resident, 'M. Hans Weber');
  assert.equal(a.faits.brouillon_id, 'B1');
  assert.equal(a.topic, 'courrier/kim/dr@x/a.pdf');
});
test('courrier sans contradiction : simple information (à valider), pas une alarme rouge', () => {
  const a = alerteIdentifie({ brouillon_id: 'B2', alertes: [] });
  assert.equal(a.faits.gravite, 'info');
  assert.match(a.libelle, /aucune contradiction/);
});
test('vérification impossible (échec du point d\'entrée) : alerte d\'attention, le courrier n\'est pas perdu', () => {
  const a = alerteIdentifie({ error: { message: 'timeout' } });
  assert.equal(a.faits.gravite, 'attention');
  assert.match(a.faits.avertissement, /n'a pas abouti/);
});
test('courrier non identifié : alerte d\'attention sans résident, motif précisé', () => {
  const code = jsCode('85-brique-courrier.json', 'Alerte (courrier non identifié)');
  const [inconnu, ambigu] = lancerItems(code, [item({ patient_id: '', chambre: '', motif: 'identite_inconnue' }), item({ source_ref: 'kim/dr@x/b.pdf', patient_id: '', chambre: '', motif: 'identite_ambigue' })])[0].alertes;
  assert.equal(inconnu.faits.gravite, 'attention');
  assert.equal(inconnu.patient_id, '');
  assert.match(inconnu.faits.avertissement, /aucun résident/);
  assert.match(ambigu.faits.avertissement, /plusieurs résidents/);
});
test('une alerte ne se crée qu\'une fois par courrier (le sujet porte la référence), et l\'événement est journalisé', () => {
  const q = noeud(courrier, 'Créer les alertes').parameters.query;
  assert.match(q, /ON CONFLICT \(topic\) WHERE type = 'document' DO NOTHING/);
  assert.match(q, /'courrier_recu'/);
  assert.match(fichier('data', 'sql', '01_schema.sql'), /CREATE UNIQUE INDEX IF NOT EXISTS alarmes_document_unique ON soins\.alarmes \(topic\) WHERE type = 'document'/);
});

// ---------------------------------------------------------------- chemins : les règles, jamais l'IA directement
test('le workflow du courrier n\'appelle aucun modèle : la vérification passe par le point d\'entrée qui applique d\'abord les règles', () => {
  assert.ok(!JSON.stringify(courrier).includes('/api/generate') && !JSON.stringify(webhook83).includes('/api/generate') && !JSON.stringify(rattrapage).includes('/api/generate'));
  const ia = chemins(courrier, 'Entrée', (n) => n?.type === 'n8n-nodes-base.executeWorkflow' && [workflow('61-brique-template.json').id, workflow('62-brique-rediger.json').id].includes(n.parameters?.workflowId?.value));
  assert.deepEqual(ia, []);
  const v = noeud(courrier, 'Vérifier le courrier');
  // chemin INTERNE, protégé par la clé interne de n8n (absente de l'interface) : le point d'entrée public exige la session d'un soignant
  assert.match(v.parameters.url, /localhost:5678\/webhook\/aicare-verifier-interne$/);
  assert.equal(v.credentials.httpHeaderAuth.name, 'AI-Care clé interne');
  assert.equal(v.onError, 'continueRegularOutput');
  // seul un courrier identifié est vérifié ; un courrier non identifié n'atteint jamais la vérification
  assert.deepEqual(voisins(courrier, 'Courrier identifié ?'), [{ vers: 'Vérifier le courrier', sortie: 0 }, { vers: 'Alerte (courrier non identifié)', sortie: 1 }]);
  assert.deepEqual(chemins(courrier, 'Alerte (courrier non identifié)', (n) => n?.name === 'Vérifier le courrier'), []);
});
test('« Vérifier le document » peut viser un courrier précis, et le motif de la référence est strict', () => {
  const ctrl = jsCode('77-maitre-verifier.json', 'Contrôler la demande');
  assert.equal(lancer(ctrl, { entree: { body: { chambre: '12', ref: 'kim/dr@x/a.pdf' } } })[0].ref, 'kim/dr@x/a.pdf');
  assert.equal(lancer(ctrl, { entree: { body: { chambre: '12' } } })[0].ref, '');
  for (const faux of ['../../x', 'kim/a b', 'http://evil', 'kim/' + 'x'.repeat(300)]) assert.throws(() => lancer(ctrl, { entree: { body: { chambre: '12', ref: faux } } }), /ref invalide/);
  const choisir = jsCode('77-maitre-verifier.json', 'Choisir la lettre');
  const lettres = [{ ref: 'kim/dr@x/recente.pdf', date: '2026-10-25T00:00:00Z' }, { ref: 'kim/dr@x/ancienne.pdf', date: '2026-10-01T00:00:00Z' }];
  const r = (ref) => lancer(choisir, { entree: { lettres, patient: {} }, noeuds: { 'Contrôler la demande': [{ ref }] } })[0].lettre.ref;
  assert.equal(r(''), 'kim/dr@x/recente.pdf', 'sans référence : la plus récente');
  assert.equal(r('kim/dr@x/ancienne.pdf'), 'kim/dr@x/ancienne.pdf', 'avec référence : ce courrier-là');
});

// ---------------------------------------------------------------- validation -> RAG
const decider = jsCode('84-brique-lettre-validee.json', 'Décider');
test('lettre validée : ajoutée au RAG seulement si les règles n\'ont trouvé AUCUNE contradiction', () => {
  const ok = lancer(decider, { entree: { validation_id: '9', patient_id: 'PAT-003', lettre_ref: 'kim/dr@x/a.pdf', sans_contradiction: true } })[0];
  assert.equal(ok.ajouter, true);
  const contradiction = lancer(decider, { entree: { validation_id: '9', patient_id: 'PAT-003', lettre_ref: 'kim/dr@x/a.pdf', sans_contradiction: false } })[0];
  assert.equal(contradiction.ajouter, false);
  assert.match(contradiction.motif, /contradiction à clarifier/);
  assert.equal(lancer(decider, { entree: {} })[0].ajouter, false, 'aucune validation de vérification : rien n\'est ajouté');
  assert.equal(lancer(decider, { entree: { validation_id: '9', patient_id: 'PAT-003', lettre_ref: '', sans_contradiction: true } })[0].ajouter, false, 'aucun courrier lié');
  assert.equal(lancer(decider, { entree: { validation_id: '9', patient_id: 'PAT-003', lettre_ref: '../../x', sans_contradiction: true } })[0].ajouter, false, 'référence invalide');
});
test('lettre validée : le texte vient de la base (a_verifier), le résident doit être celui de la validation, le type est « lettre_validee »', () => {
  const reconstituer = jsCode('84-brique-lettre-validee.json', 'Reconstituer la lettre');
  const points = [{ payload: { chunk_index: 1, texte: 'suite', source_ref: 'kim/dr@x/a.pdf', titre: 'Arztbrief', expediteur: 'Dr X', patient_id: 'PAT-003', chambre: '12', date: '2026-10-26T10:00:00Z' } }, { payload: { chunk_index: 0, texte: 'début', source_ref: 'kim/dr@x/a.pdf', titre: 'Arztbrief', expediteur: 'Dr X', patient_id: 'PAT-003', chambre: '12', date: '2026-10-26T10:00:00Z' } }];
  const d = lancer(reconstituer, { entree: { result: { points } }, noeuds: { Décider: [{ patient_id: 'PAT-003' }] } })[0];
  assert.equal(d.texte, 'début\nsuite');
  assert.equal(d.type, 'lettre_validee');
  assert.equal(d.collection, 'patients');
  assert.equal(d.statut, 'valide');
  assert.throws(() => lancer(reconstituer, { entree: { result: { points } }, noeuds: { Décider: [{ patient_id: 'PAT-001' }] } }), /ne correspond pas/);
  assert.throws(() => lancer(reconstituer, { entree: { result: { points: [] } }, noeuds: { Décider: [{ patient_id: 'PAT-003' }] } }), /introuvable/);
});
test('lettre validée : l\'ajout n\'est atteint que si la décision est « ajouter », et la lettre est marquée validée ensuite', () => {
  assert.deepEqual(voisins(lettre, 'Ajouter la lettre ?'), [{ vers: 'Lire la lettre (a_verifier)', sortie: 0 }, { vers: 'Résultat', sortie: 1 }]);
  const idIndexeur = workflow('00-indexeur.json').id;
  const versIndexeur = chemins(lettre, 'Entrée', (n) => n?.parameters?.workflowId?.value === idIndexeur);
  for (const c of versIndexeur) assert.equal(c.find((x) => x.nom === 'Ajouter la lettre ?').sortie, 0);
  assert.match(noeud(lettre, 'Lettre de la validation').parameters.query, /v\.action = 'verifier_document'/);
  assert.match(noeud(lettre, 'Marquer la lettre validée').parameters.jsonBody, /statut: 'valide'/);
});
test('la validation d\'un rapport de vérification (et d\'aucune autre réponse) lance « lettre validée »', () => {
  const v = workflow('72-maitre-valider.json');
  assert.match(noeud(v, 'Vérification validée ?').parameters.conditions.conditions[0].leftValue, /ok === true && \$json\.action === 'verifier_document'/);
  const lettreId = lettre.id;
  const versLettre = chemins(v, 'Webhook', (n) => n?.parameters?.workflowId?.value === lettreId);
  assert.ok(versLettre.length >= 1);
  for (const c of versLettre) assert.equal(c.find((x) => x.nom === 'Vérification validée ?').sortie, 0);
  assert.equal(noeud(v, 'Lettre validée').onError, 'continueRegularOutput', 'un échec ne défait pas la validation');
});
test('une lettre validée devient une information de fond du résident (recherche « chercher »)', () => {
  assert.match(JSON.stringify(workflow('60-brique-chercher.json')), /'lettre_validee'/);
});

// ---------------------------------------------------------------- nouveautés de l'ePA
test('nouveautés ePA : notification seulement si l\'ePA du résident avait DÉJÀ été importée (la première importation ne notifie rien)', () => {
  const n = noeud(workflow('40-connecteur-epa.json'), 'Nouveautés ePA');
  assert.match(n.parameters.query, /WHERE EXISTS \(SELECT 1 FROM soins\.journal_imports j WHERE j\.source = 'epa' AND j\.patient_id = n\.patient_id AND j\.importe_le <= now\(\) - interval '15 minutes'\)/);
  assert.match(n.parameters.query, /ON CONFLICT \(topic\) WHERE type = 'document' DO NOTHING/);
  assert.deepEqual(voisins(workflow('40-connecteur-epa.json'), 'Indexer'), [{ vers: 'Nouveautés ePA', sortie: 0 }]);
});

// ---------------------------------------------------------------- rattrapage
test('rattrapage : seuls les messages avec pièce jointe, vieux de plus d\'une minute et ni traités ni déjà pris sont repris', () => {
  const code = jsCode('86-courrier-rattrapage.json', 'Courriers à rattraper');
  const il_y_a = (s) => new Date(Date.now() - s * 1000).toISOString();
  const messages = [
    { ID: 'A', Attachments: 1, Created: il_y_a(600) }, // à reprendre
    { ID: 'B', Attachments: 1, Created: il_y_a(600) }, // déjà traité
    { ID: 'C', Attachments: 0, Created: il_y_a(600) }, // aucune pièce jointe
    { ID: 'D', Attachments: 1, Created: il_y_a(30) }, // trop récent : la notification s'en occupe peut-être
  ];
  const r = lancer(code, { entree: { messages }, noeuds: { 'Courriers déjà traités': [{ message_id: 'B' }] } });
  assert.deepEqual(r, [{ id: 'A' }]);
  assert.deepEqual(lancer(code, { entree: { messages: [] }, noeuds: { 'Courriers déjà traités': [{}] } }), []);
});
test('rattrapage : toutes les 2 minutes, un courrier après l\'autre, par le même sous-workflow que la notification', () => {
  assert.equal(noeud(rattrapage, 'Toutes les 2 minutes').parameters.rule.interval[0].expression, '0 */2 * * * *');
  assert.match(noeud(rattrapage, 'Courriers déjà traités').parameters.query, /etat = 'traite' OR debut > now\(\) - interval '15 minutes'/);
  assert.equal(noeud(rattrapage, 'Traiter le courrier').parameters.mode, 'each');
  assert.equal(noeud(rattrapage, 'Traiter le courrier').parameters.workflowId.value, noeud(webhook83, 'Traiter le courrier').parameters.workflowId.value);
  assert.match(noeud(courrier, 'Marquer le courrier traité').parameters.query, /UPDATE soins\.courriers_traites SET etat = 'traite'/);
  // verrou : un courrier pris depuis moins de 15 minutes n'est pas repris, ni par la notification ni par le rattrapage
  assert.match(noeud(courrier, 'Prendre le courrier').parameters.query, /ON CONFLICT \(message_id\) DO UPDATE SET debut = now\(\) WHERE soins\.courriers_traites\.etat = 'en_cours' AND soins\.courriers_traites\.debut < now\(\) - interval '15 minutes'/);
  assert.deepEqual(voisins(courrier, 'Prendre le courrier'), [{ vers: 'Courrier libre ?', sortie: 0 }]);
  assert.deepEqual(voisins(courrier, 'Courrier libre ?'), [{ vers: 'Résidents', sortie: 0 }], 'un courrier déjà pris ne mène à rien');
  assert.match(fichier('data', 'sql', '01_schema.sql'), /CREATE TABLE IF NOT EXISTS soins\.courriers_traites/);
});
console.log(`\n${nb} tests réussis.`);
