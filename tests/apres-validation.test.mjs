// Tests hors n8n du jour 3, étape 4 : rapport de garde d'un étage, et ce qui suit une validation
// (ajout au RAG, transmission à l'équipe suivante), sur les workflows GÉNÉRÉS.
// Lancer : node tests/apres-validation.test.mjs   (après node workflows/generer.mjs)
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
  assert.ok(n, `nœud « ${nom} » introuvable dans ${fichier}`);
  return n;
};
const jsCode = (fichier, nom) => noeud(fichier, nom).parameters.jsCode;
function lancer(code, { entree = {}, noeuds = {} } = {}) {
  const enveloppe = (items) => ({ first: () => items[0], all: () => items, last: () => items.at(-1) });
  const $input = enveloppe(Array.isArray(entree) ? entree.map((json) => ({ json })) : [{ json: entree }]);
  const $ = (nom) => {
    if (!(nom in noeuds)) throw new Error(`nœud inconnu : ${nom}`);
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
  validation_id: 7, patient_id: 'PAT-003', texte: 'S : chute à 04h41. [Logiciel de soins]', sources: ['Logiciel de soins', 'ePA'],
  valide_par: 'IDE Keller', valide_le: '2026-10-25T07:30:00Z', civilite: 'M.', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, ...extra,
});

// ---------------------------------------------------------------- ajout au RAG
test('RAG : le document ajouté est le texte VALIDÉ lu dans la table, de type rapport_valide, rattaché au résident', () => {
  const docs = lancer(jsCode('66-brique-apres-validation.json', 'Documents RAG'), { entree: [ligne(), { json: 'vide' }, {}] });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].type, 'rapport_valide');
  assert.equal(docs[0].collection, 'patients');
  assert.equal(docs[0].patient_id, 'PAT-003');
  assert.equal(docs[0].texte, ligne().texte);
  assert.equal(docs[0].source_ref, 'validation-7');
  assert.equal(docs[0].source_label, 'Rapport validé');
});
test('RAG : la requête SQL lit les validations de RAPPORT DE GARDE, par identifiants numériques seulement', () => {
  const n = noeud('66-brique-apres-validation.json', 'Rapports validés');
  assert.match(n.parameters.query, /FROM soins\.validations/);
  assert.match(n.parameters.query, /action = 'generer_sbar'/);
  assert.match(n.parameters.options.queryReplacement, /map\(Number\)\.filter\(Number\.isInteger\)/);
});
test('RAG : les rapports validés ne servent pas de faits à un nouveau rapport, sauf pour les prompts qui le demandent', () => {
  const resultat = { result: [
    { payload: { source: 'validation', source_label: 'Rapport validé', source_ref: 'validation-7', chunk_index: 0, type: 'rapport_valide', texte: 'ancien SBAR', date: '2026-10-25T07:30:00Z' } },
    { payload: { source: 'epa', source_label: 'ePA', source_ref: 'e1', chunk_index: 0, type: 'diagnostic', texte: 'Diagnostic ePA', date: null } },
  ] };
  const base = (rapports_valides) => ({
    'Paramètres': [{ patient_id: 'PAT-003', depuis: '2026-10-24T20:00:00Z', jusqua: '2026-10-25T08:00:00Z', protocoles: false, rapports_valides }],
    'Résident': [{ patient_id: 'PAT-003', civilite: 'M.', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: [], allergies: [], regime: null, risques: [] }],
    'Autres résidents': [], 'Notes de la période': [], 'Constantes de la période': [], 'Plan de médication': [],
    'Qdrant période': [resultat], 'Qdrant fond': [{ result: [] }], 'Qdrant protocoles': [{ result: [] }], 'Qdrant lettres': [{ result: { points: [] } }],
  });
  const code = jsCode('60-brique-chercher.json', 'Assembler les faits');
  const sans = lancer(code, { noeuds: base(false) })[0];
  assert.ok(!sans.faits.some((f) => f.label === 'Rapport validé'), 'un rapport validé ne doit pas être un fait');
  assert.ok(sans.faits.some((f) => f.label === 'ePA'));
  const avec = lancer(code, { noeuds: base(true) })[0];
  assert.ok(avec.faits.some((f) => f.label === 'Rapport validé'));
});
test('RAG : seul le Mode B (consigne guidée) relit les rapports validés', () => {
  const prompts = JSON.parse(jsCode('70-maitre-action.json', 'Paramètres du prompt').match(/const PROMPTS = (.*);\n/)[1]);
  assert.equal(prompts.consigne_guidee.rapports_valides, true);
  for (const [id, p] of Object.entries(prompts)) if (id !== 'consigne_guidee') assert.equal(p.rapports_valides, false, id);
});

// ---------------------------------------------------------------- transmission
const message = (rapports, entree = { portee: 'resident' }) =>
  lancer(jsCode('66-brique-apres-validation.json', 'Message de transmission'), { noeuds: { 'Entrée': [entree], 'Rapports validés': rapports } })[0];

test('transmission : le message reprend le texte validé, ses sources et le nom du validateur', () => {
  const m = message([ligne()]);
  assert.match(m.texte, /chute à 04h41/);
  assert.match(m.texte, /Sources : \[Logiciel de soins\] \[ePA\]/);
  assert.match(m.texte, /Validé par IDE Keller/);
  assert.match(m.sujet, /chambre 12 \(M\. Weber\)/);
  assert.equal(m.mailpit.To[0].Email, m.destinataire);
  assert.deepEqual(m.validation_ids, [7]);
});
test('transmission : un étage entier donne un seul message avec un bloc par résident', () => {
  const m = message([ligne(), ligne({ validation_id: 8, patient_id: 'PAT-004', nom: 'Schulz', chambre: '14', texte: 'S : nuit calme. [Logiciel de soins]' })], { portee: 'etage', etage: 1 });
  assert.match(m.sujet, /étage 1/);
  assert.equal(m.texte.split('=== Chambre').length - 1, 2);
  assert.deepEqual(m.patient_ids, ['PAT-003', 'PAT-004']);
});
test('transmission : sans rapport validé, rien n\'est envoyé', () => {
  assert.throws(() => message([{}]), /Aucun rapport validé/);
});
test('transmission : un envoi en échec est noté (statut echec), il n\'annule pas la validation', () => {
  const resume = lancer(jsCode('66-brique-apres-validation.json', 'Résumé'), { noeuds: {
    'Message de transmission': [message([ligne()])], 'Envoyer (Mailpit)': [{ error: { message: 'connexion refusée' } }],
    'Noter la transmission': [{ id: 3 }], 'Indexer (RAG)': [{ morceaux_indexes: 1, ignores_deja_importes: 0 }],
  } })[0];
  assert.equal(resume.transmission.statut, 'echec');
  assert.equal(resume.rag.ajoutes, 1);
  assert.deepEqual(resume.evenements_journal.map((e) => e.evenement), ['ajout_rag', 'transmission']);
  assert.ok(noeud('66-brique-apres-validation.json', 'Envoyer (Mailpit)').onError === 'continueRegularOutput');
});

// ---------------------------------------------------------------- chemins
const trouveLiens = (fichier) => {
  const wf = workflow(fichier);
  const liens = [];
  for (const [de, sorties] of Object.entries(wf.connections)) sorties.main.forEach((cibles, i) => cibles.forEach((c) => liens.push({ de, vers: c.node, sortie: i })));
  return liens;
};
test('validation : après validation n\'est atteint que depuis une validation réussie d\'un rapport de garde', () => {
  const liens = trouveLiens('72-maitre-valider.json');
  const versApres = liens.filter((l) => l.vers === 'Vers après validation');
  assert.deepEqual(versApres, [{ de: 'Rapport de garde ?', vers: 'Vers après validation', sortie: 0 }]);
  assert.match(noeud('72-maitre-valider.json', 'Rapport de garde ?').parameters.conditions.conditions[0].leftValue, /ok === true && \$json\.action === 'generer_sbar'/);
  assert.ok(liens.some((l) => l.de === 'Enregistrer' && l.vers === 'Rapport de garde ?'));
});
test('validation : le lot d\'un étage passe par « enregistrer » pour chaque rapport (brouillon exigé) avant tout ajout au RAG', () => {
  const wf = workflow('73-maitre-valider-lot.json');
  const ordre = trouveLiens('73-maitre-valider-lot.json');
  assert.ok(ordre.some((l) => l.de === 'Enregistrer' && l.vers === 'Rassembler le lot'));
  assert.equal(noeud('73-maitre-valider-lot.json', 'Enregistrer').parameters.mode, 'each');
  assert.equal(wf.nodes.filter((n) => n.name === 'Après validation').length, 1);
  const lot = lancer(jsCode('73-maitre-valider-lot.json', 'Rassembler le lot'), {
    entree: [{ ok: true, validation_id: 5, action: 'generer_sbar' }, { ok: false, erreur: 'Brouillon introuvable ou déjà validé.', brouillon_id: 'x' }, { ok: true, validation_id: 6, action: 'resume_epa' }],
    noeuds: { 'Corps du lot': [{ etage: 2 }] },
  })[0];
  assert.deepEqual(lot.validation_ids, [5]);
  assert.equal(lot.refuses.length, 2);
  assert.equal(lot.portee, 'etage');
});
test('étage : le prompt est fixé à generer_sbar, l\'étage est un nombre, un résident après l\'autre', () => {
  const el = lancer(jsCode('68-brique-etage-complet.json', 'Résidents à traiter'), { noeuds: { 'Entrée': [{ task_id: 'T' }], "Résidents de l'étage": [{ patient_id: 'PAT-001' }, { patient_id: 'PAT-002' }] } });
  assert.deepEqual(el.map((x) => x.prompt_id), ['generer_sbar', 'generer_sbar']);
  assert.equal(noeud('68-brique-etage-complet.json', 'Rapport de garde').parameters.mode, 'each');
  const ctrl = jsCode('74-maitre-etage.json', "Contrôler l'étage");
  assert.equal(lancer(ctrl, { entree: { body: { etage: '2' } } })[0].etage, 2);
  assert.throws(() => lancer(ctrl, { entree: { body: { etage: "2; DROP TABLE soins.residents" } } }), /Étage invalide/);
  assert.throws(() => lancer(ctrl, { entree: { body: {} } }), /Étage invalide/);
});
test('étage : la réponse part tout de suite (identifiant de tâche), la génération continue ensuite', () => {
  const liens = trouveLiens('74-maitre-etage.json');
  assert.equal(noeud('74-maitre-etage.json', 'Webhook').parameters.responseMode, 'responseNode');
  assert.ok(liens.some((l) => l.de === 'Répondre tout de suite' && l.vers === 'Vers étage complet'));
  assert.ok(liens.some((l) => l.de === 'Créer la tâche' && l.vers === 'Répondre tout de suite'));
});
test('étage : la tâche garde des brouillons, jamais une validation ; une erreur sur un résident n\'arrête pas les autres', () => {
  const r = lancer(jsCode('67-brique-rapport-garde.json', 'Résultat du rapport'), {
    entree: { error: { message: 'Ollama injoignable' } },
    noeuds: { 'Entrée': [{ task_id: 'T' }], 'Chercher': [{ patient: { patient_id: 'PAT-001', chambre: '2', label: 'Mme Schulz' } }] },
  })[0];
  assert.equal(r.entree.erreur, 'Ollama injoignable');
  assert.equal(noeud('67-brique-rapport-garde.json', 'Rédiger').onError, 'continueRegularOutput');
  const ok = lancer(jsCode('67-brique-rapport-garde.json', 'Résultat du rapport'), {
    entree: { brouillon_id: 'b1', texte: 'S : ...', sources: ['ePA'], avertissements: [{ type: 'repetitions', detail: 'd' }] },
    noeuds: { 'Entrée': [{ task_id: 'T' }], 'Chercher': [{ patient: { patient_id: 'PAT-001', chambre: '2', label: 'Mme Schulz' } }] },
  })[0];
  assert.equal(ok.entree.brouillon_id, 'b1');
  assert.ok(!('validation_id' in ok.entree));
});
test('étage : l\'IA n\'est appelée que par « rédiger » (aucun nouvel appel à /api/generate)', () => {
  for (const f of ['66-brique-apres-validation.json', '67-brique-rapport-garde.json', '68-brique-etage-complet.json', '73-maitre-valider-lot.json', '74-maitre-etage.json', '75-maitre-tache.json', '76-etage-automatique.json']) {
    assert.ok(!JSON.stringify(workflow(f)).includes('/api/generate'), `${f} ne doit pas appeler l'IA directement`);
  }
});
test('tâche : seul un identifiant UUID est accepté', () => {
  const ctrl = jsCode('75-maitre-tache.json', 'Contrôler la tâche');
  assert.equal(lancer(ctrl, { entree: { body: { tache_id: 'a1c3e000-0001-4000-8000-000000000001' } } })[0].tache_id, 'a1c3e000-0001-4000-8000-000000000001');
  assert.throws(() => lancer(ctrl, { entree: { body: { tache_id: "x'; DROP TABLE soins.taches;--" } } }), /tache_id invalide/);
});
test('transmission : le connecteur KIM ne prend jamais le mail de transmission pour une lettre (seules les pièces jointes sont lues)', () => {
  const kim = lancer(jsCode('50-connecteur-kim.json', 'Messages à lire'), { entree: { messages: [{ ID: 'a', Attachments: 0 }, { ID: 'b', Attachments: 1 }] } });
  assert.deepEqual(kim.map((x) => x.id), ['b']);
});

test('tâche : le dernier rapport d\'un étage se demande par {etage, recent}, l\'étage est un nombre', () => {
  const ctrl = jsCode('75-maitre-tache.json', 'Contrôler la tâche');
  assert.deepEqual(lancer(ctrl, { entree: { body: { etage: 2, recent: true } } })[0], { tache_id: '', etage: '2' });
  assert.throws(() => lancer(ctrl, { entree: { body: { etage: "2' OR 1=1", recent: true } } }), /étage invalide/);
  const rep = jsCode('75-maitre-tache.json', 'Réponse');
  assert.equal(lancer(rep, { entree: {}, noeuds: { 'Contrôler la tâche': [{ tache_id: '', etage: '2' }] } })[0].tache_id, null, 'pas de rapport récent : réponse vide, pas une erreur');
  assert.throws(() => lancer(rep, { entree: {}, noeuds: { 'Contrôler la tâche': [{ tache_id: 'x', etage: '' }] } }), /introuvable/);
});
test('automatique : chaque étage à 5h30 (heure de Berlin), jamais deux fois en 3 heures, un étage après l\'autre', () => {
  const wf = workflow('76-etage-automatique.json');
  assert.equal(wf.settings.timezone, 'Europe/Berlin');
  assert.equal(noeud('76-etage-automatique.json', 'Planification 5h30').parameters.rule.interval[0].expression, '0 30 5 * * *');
  assert.match(noeud('76-etage-automatique.json', 'Créer les tâches').parameters.query, /NOT EXISTS[\s\S]*automatique[\s\S]*interval '3 hours'/);
  assert.equal(noeud('76-etage-automatique.json', 'Étage complet').parameters.mode, 'each');
  const el = lancer(jsCode('76-etage-automatique.json', 'Étages à traiter'), { entree: [{ id: 'T1', etage: 1 }, { id: 'T2', etage: '2' }, {}] });
  assert.deepEqual(el, [{ etage: 1, task_id: 'T1' }, { etage: 2, task_id: 'T2' }]);
});
test('automatique : le rapport de 5h30 est le même que celui du clic (même sous-workflow, même prompt fixé)', () => {
  assert.equal(noeud('76-etage-automatique.json', 'Étage complet').parameters.workflowId.value, noeud('74-maitre-etage.json', 'Étage complet').parameters.workflowId.value);
});
test('vitesse : 8 faits au plus par résident, les plus importants pour la sécurité (allergies, incidents, risques) sont gardés', () => {
  const notes = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, horodatage: `2026-10-25T0${i % 8}:${10 + i}:00Z`, auteur: 'IDE', categorie: i === 7 ? 'incident' : 'observation', texte: i === 7 ? 'Chute constatée à 04h41' : `Observation numéro ${i}` }));
  const noeuds = {
    'Paramètres': [{ patient_id: 'PAT-003', depuis: '2026-10-24T20:00:00Z', jusqua: '2026-10-25T08:00:00Z', protocoles: false, max_faits: 8, sources_prioritaires: [] }],
    'Résident': [{ patient_id: 'PAT-003', civilite: 'M.', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: ['HTA'], allergies: ['Pénicilline'], regime: 'normal', risques: ['Chute'] }],
    'Autres résidents': [], 'Notes de la période': notes, 'Constantes de la période': [], 'Plan de médication': [{ medicament: 'Ramipril', dosage: '5 mg', schema_prise: '1-0-0', indication: 'HTA' }],
    'Qdrant période': [{ result: [] }], 'Qdrant fond': [{ result: [] }], 'Qdrant protocoles': [{ result: [] }], 'Qdrant lettres': [{ result: { points: [] } }],
  };
  const r = lancer(jsCode('60-brique-chercher.json', 'Assembler les faits'), { noeuds })[0];
  assert.equal(r.faits.length, 8);
  assert.deepEqual(r.faits.map((f) => f.id), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
  assert.ok(r.faits.some((f) => /^Allergies/.test(f.texte)), 'allergie gardée');
  assert.ok(r.faits.some((f) => /Chute constatée à 04h41/.test(f.texte)), 'incident gardé');
  assert.ok(r.faits.some((f) => /^Risques/.test(f.texte)), 'risques gardés');
  assert.equal(r.stats.tronque, true);
  // chronologie conservée dans la période
  const dates = r.faits.filter((f) => f.groupe === 'periode').map((f) => f.date);
  assert.deepEqual(dates, [...dates].sort());
});
test('vitesse : une alarme de capteur est toujours retenue, même parmi beaucoup de faits', () => {
  const qd = { result: [{ payload: { source: 'capteur', source_label: 'Capteurs', source_ref: 'alarme-1', chunk_index: 0, type: 'alarme', texte: 'Alarme sortie_lit chambre 12', date: '2026-10-25T07:50:00Z' } }] };
  const notes = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, horodatage: `2026-10-25T0${i % 8}:${10 + i}:00Z`, auteur: 'IDE', categorie: 'incident', texte: `Incident numéro ${i}` }));
  const noeuds = {
    'Paramètres': [{ patient_id: 'PAT-003', depuis: '2026-10-24T20:00:00Z', jusqua: '2026-10-25T08:00:00Z', max_faits: 8, sources_prioritaires: ['Capteurs'] }],
    'Résident': [{ patient_id: 'PAT-003', civilite: 'M.', prenom: 'Hans', nom: 'Weber', chambre: '12', etage: 1, naissance: '23.11.1941', diagnostics: [], allergies: [], regime: null, risques: [] }],
    'Autres résidents': [], 'Notes de la période': notes, 'Constantes de la période': [], 'Plan de médication': [],
    'Qdrant période': [qd], 'Qdrant fond': [{ result: [] }], 'Qdrant protocoles': [{ result: [] }], 'Qdrant lettres': [{ result: { points: [] } }],
  };
  const r = lancer(jsCode('60-brique-chercher.json', 'Assembler les faits'), { noeuds })[0];
  assert.ok(r.faits.some((f) => f.label === 'Capteurs'));
  assert.equal(r.faits.length, 8);
});
console.log(`\n${nb} tests réussis.`);
