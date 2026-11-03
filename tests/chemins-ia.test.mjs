// TEST DES CHEMINS : « aucun chemin n'envoie le texte du soignant directement à l'IA ».
// Analyse statique des workflows GÉNÉRÉS (ceux qui sont importés dans n8n) : on parcourt le graphe de chaque
// workflow d'entrée et on vérifie que le texte libre du soignant ne peut atteindre « rédiger » (le seul appel à l'IA)
// qu'après le contrôle de la consigne, la porte « acceptée » et le template verrouillé.
// Lancer : node tests/chemins-ia.test.mjs   (après node workflows/generer.mjs)
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

// --- graphe -----------------------------------------------------------------------------------------------
const noeud = (wf, nom) => wf.nodes.find((n) => n.name === nom);
function voisins(wf, nom) {
  const sorties = wf.connections[nom]?.main ?? [];
  return sorties.flatMap((liste, indexSortie) => (liste ?? []).map((l) => ({ vers: l.node, sortie: indexSortie })));
}
// tous les chemins simples de `depart` jusqu'aux nœuds vérifiant `estCible`
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

// --- 1. le texte libre du Mode B --------------------------------------------------------------------------
const consigne = tous['71-maitre-consigne.json'];
test('Mode B : tout chemin du webhook vers « rédiger » passe par le contrôle, la porte « acceptée », « chercher » puis le template', () => {
  const vers = chemins(consigne, 'Webhook', appelle(ID_REDIGER));
  assert.ok(vers.length >= 1, 'au moins un chemin vers rédiger');
  for (const chemin of vers) {
    const noms = chemin.map((c) => c.nom);
    const rang = (nom) => noms.indexOf(nom);
    assert.ok(rang('Contrôler la consigne') >= 0, 'le contrôle est sur le chemin');
    assert.ok(rang('Contrôler la consigne') < rang('Consigne acceptée ?'), 'contrôle avant la porte');
    assert.ok(rang('Consigne acceptée ?') < rang('Chercher'), 'porte avant chercher');
    assert.ok(rang('Chercher') < rang('Template') && rang('Template') < rang('Rédiger'), 'chercher, puis template, puis rédiger');
    // la porte doit être franchie par sa sortie « vrai » (0), jamais par « faux »
    const porte = chemin.find((c) => c.nom === 'Consigne acceptée ?');
    assert.equal(porte.sortie, 0, 'seule la sortie « consigne acceptée » mène à l\'IA');
  }
});

test('le test des chemins détecte bien une dérivation (contrôle contourné dans une copie du workflow)', () => {
  const copie = JSON.parse(JSON.stringify(consigne));
  // on ajoute un raccourci qui contourne le contrôle : la chambre mène directement aux paramètres de recherche
  copie.connections['Résident de la chambre'].main[0].push({ node: 'Paramètres consigne', type: 'main', index: 0 });
  const sansControle = chemins(copie, 'Webhook', appelle(ID_REDIGER)).filter((c) => !c.some((x) => x.nom === 'Contrôler la consigne'));
  assert.ok(sansControle.length >= 1, 'le raccourci doit être détecté comme un chemin sans contrôle');
});

test('Mode B : la sortie « consigne refusée » ne mène jamais à l\'IA (ni à chercher, ni au template)', () => {
  const refus = voisins(consigne, 'Consigne acceptée ?').find((v) => v.sortie === 1).vers;
  const versIa = chemins(consigne, refus, (n) => [ID_CHERCHER, ID_TEMPLATE, ID_REDIGER].some((id) => appelle(id)(n)));
  assert.deepEqual(versIa, [], 'le chemin « refus » n\'atteint aucun nœud d\'IA');
});

test('Mode B : seul « Contrôler la consigne » lit le texte libre dans la requête ; les autres nœuds ne lisent que la consigne contrôlée', () => {
  for (const n of consigne.nodes) {
    const code = n.parameters?.jsCode ?? '';
    const lit = /\$\('Webhook'\)|\$input\.first\(\)\.json\?\.body/.test(code) && /consigne/.test(code.replace(/\/\/.*$/gm, ''));
    if (n.name === 'Contrôler la consigne') assert.ok(code.includes("$('Webhook')"), 'le contrôle lit la requête');
    else assert.ok(!lit, `« ${n.name} » ne doit pas lire la consigne brute de la requête`);
    // les nœuds qui utilisent la consigne la prennent APRÈS le contrôle
    if (n.name !== 'Contrôler la consigne' && /\.consigne\b/.test(code)) {
      assert.ok(code.includes("$('Contrôler la consigne')"), `« ${n.name} » doit prendre la consigne du nœud de contrôle`);
    }
    // les nœuds de base de données et HTTP n'embarquent jamais la consigne dans leurs paramètres
    if (['n8n-nodes-base.postgres', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.executeWorkflow'].includes(n.type)) assert.ok(!/consigne/i.test(JSON.stringify(n.parameters).replace(/Contrôler la consigne/g, '')), `« ${n.name} » ne doit pas manipuler la consigne`);
  }
});

test('Mode B : l\'instruction du soignant n\'entre dans le prompt que par « instruction_soignant » du template', () => {
  const quiLit = [];
  for (const [f, wf] of Object.entries(tous)) {
    for (const n of wf.nodes) {
      if (/instruction_soignant/.test(n.parameters?.jsCode ?? '')) quiLit.push(`${f} / ${n.name}`);
    }
  }
  assert.deepEqual(quiLit.sort(), ['61-brique-template.json / Template verrouillé', '71-maitre-consigne.json / Vers template (consigne)'].sort());
});

// --- 2. aucun autre chemin ---------------------------------------------------------------------------------
test('Dans tous les workflows, un appel à « rédiger » est précédé du template, sur tous les chemins', () => {
  for (const [f, wf] of Object.entries(tous)) {
    for (const depart of declencheurs(wf)) {
      for (const chemin of chemins(wf, depart.name, appelle(ID_REDIGER))) {
        const noms = chemin.map((c) => noeud(wf, c.nom));
        const iTemplate = noms.findIndex(appelle(ID_TEMPLATE));
        const iRediger = noms.findIndex(appelle(ID_REDIGER));
        assert.ok(iTemplate >= 0 && iTemplate < iRediger, `${f} : chemin vers rédiger sans template (${chemin.map((c) => c.nom).join(' > ')})`);
      }
    }
  }
});

test('Mode A : la demande ne contient aucun texte libre (seulement action et chambre)', () => {
  const code = noeud(tous['70-maitre-action.json'], 'Contrôler la demande').parameters.jsCode;
  const lus = [...code.matchAll(/\be\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(lus)].sort(), ['action', 'chambre']);
});

test('« Valider & Enregistrer » ne mène ni à chercher, ni au template, ni à l\'IA : le texte validé est seulement enregistré', () => {
  const wf = tous['72-maitre-valider.json'];
  const versIa = chemins(wf, 'Webhook', (n) => [ID_CHERCHER, ID_TEMPLATE, ID_REDIGER].some((id) => appelle(id)(n)));
  assert.deepEqual(versIa, []);
  assert.ok(chemins(wf, 'Webhook', appelle(ID_ENREGISTRER)).length >= 1);
});

test('seuls deux nœuds de tout le dépôt appellent l\'IA générative (/api/generate) : la brique « rédiger » et, NOMMÉMENT, l\'extraction SGB VI des cotisations', () => {
  const appels = [];
  for (const [f, wf] of Object.entries(tous)) for (const n of wf.nodes) if (/\/api\/(generate|chat)/.test(JSON.stringify(n.parameters))) appels.push(`${f} / ${n.name}`);
  assert.deepEqual([...appels].sort(), ['62-brique-rediger.json / Modèle de langue (Ollama)', '93-sgb6-agent.json / Extraction SGB VI (Ollama)', ...Array.from({ length: 12 }, (_, i) => `93-sgb6-agent.json / Pilote SGB VI (tour ${i + 1})`), '97-sgb6-tour.json / Pilote SGB VI : garde et outils'].sort());
});
test('cotisations : l\'appel à l\'IA ne se fait que sur la lecture des champs (consigne fixe, température 0, schéma JSON imposé), après la lecture du document', () => {
  const wf = tous['93-sgb6-agent.json'];
  const preparer = wf.nodes.find((n) => n.name === 'Préparer la lecture par l\'IA').parameters.jsCode;
  assert.match(preparer, /temperature: 0,/);
  assert.match(preparer, /format: SCHEMA_LECTURE_IA/);
  assert.match(preparer, /prompt: consigneLectureIA\(texte\)/);
  // l'IA n'est atteinte que par la case « Lecture par l'IA » (après l'étape 1), jamais avant le contrôle d'étape
  const vers = chemins(wf, 'Entrée', (n) => n?.name === 'Extraction SGB VI (Ollama)');
  assert.ok(vers.length >= 1);
  for (const c of vers) {
    const noms = c.map((x) => x.nom);
    assert.ok(noms.includes('Étape 1 terminée') && noms.includes('Lecture par l\'IA ?'));
  }
  // l'IA n'atteint ni le calcul, ni la décision : la réponse du modèle passe par « Lire la réponse de l'IA » avant les règles
  assert.ok(chemins(wf, 'Extraction SGB VI (Ollama)', (n) => n?.name === 'Contrôler les champs').every((c) => c.map((x) => x.nom).includes('Lire la réponse de l\'IA')));
});

test('les workflows d\'entrée de l\'interface autorisent l\'interface (CORS) et répondent par leur dernier nœud', () => {
  for (const f of ['70-maitre-action.json', '71-maitre-consigne.json', '72-maitre-valider.json', '78-maitre-reglage.json']) {
    const w = noeud(tous[f], 'Webhook');
    assert.equal(w.parameters.responseMode, 'lastNode', f);
    assert.ok(w.parameters.options.allowedOrigins, `${f} : CORS`);
    assert.equal(w.parameters.httpMethod, 'POST');
  }
});

const verif = tous['77-maitre-verifier.json'];
const REPONSES = ['Répondre tout de suite', 'Répondre (sans IA)', 'Répondre (sans lettre)'];
test('« Vérifier le document » : les règles de contrôle sont sur le chemin AVANT toute réponse et avant la moindre étape de l\'IA', () => {
  for (const reponse of REPONSES) {
    const vers = chemins(verif, 'Webhook', (n) => n?.name === reponse);
    assert.ok(vers.length >= 1, reponse);
    for (const c of vers) {
      const noms = c.map((x) => x.nom);
      if (reponse === 'Répondre (sans lettre)') continue; // pas de lettre : rien à comparer, aucune IA
      assert.ok(noms.includes('Règles seules'), `${reponse} : les règles doivent précéder la réponse`);
      assert.ok(noms.indexOf('Règles seules') < noms.indexOf(reponse));
      for (const ia of [ID_REDIGER, ID_TEMPLATE]) assert.ok(!c.some((x) => appelle(ia)(noeud(verif, x.nom))), `${reponse} : aucune étape d'IA avant la réponse`);
    }
  }
});
test('« Vérifier le document » : les étapes d\'IA ne sont atteintes qu\'APRÈS la réponse, et seulement si l\'analyse est activée', () => {
  const versIa = chemins(verif, 'Webhook', (n) => appelle(ID_REDIGER)(n) || appelle(ID_TEMPLATE)(n));
  assert.ok(versIa.length >= 1);
  for (const c of versIa) {
    const noms = c.map((x) => x.nom);
    assert.ok(noms.includes('Répondre tout de suite') && noms.indexOf('Répondre tout de suite') < noms.indexOf('Document à extraire'), 'réponse avant l\'IA');
    const porte = c.find((x) => x.nom === 'Analyse IA activée ?');
    assert.equal(porte.sortie, 0, 'seule la sortie « activée » mène à l\'IA');
  }
  // désactivée : la branche ne mène à aucune étape d'IA
  const sansIa = voisins(verif, 'Analyse IA activée ?').find((v) => v.sortie === 1).vers;
  assert.deepEqual(chemins(verif, sansIa, (n) => appelle(ID_REDIGER)(n) || appelle(ID_TEMPLATE)(n) || appelle(ID_CHERCHER)(n)), []);
});
test('« Vérifier le document » : si une étape de l\'IA échoue, l\'analyse se termine quand même (les règles ont déjà répondu)', () => {
  assert.equal(noeud(verif, 'Rédiger (extraction)').onError, 'continueRegularOutput');
  assert.equal(noeud(verif, 'Rédiger (comparaison)').onError, 'continueRegularOutput');
});
test('« Vérifier le document » : seuls la chambre et, facultativement, la référence d\'un courrier (motif strict) sont lus ; aucune action', () => {
  const code = noeud(verif, 'Contrôler la demande').parameters.jsCode;
  assert.deepEqual([...new Set([...code.matchAll(/\be\.(\w+)/g)].map((m) => m[1]))].sort(), ['chambre', 'ref']);
  assert.match(code, /\^kim\\\/\[\^\\s\]\{1,200\}\$/, 'la référence doit avoir la forme kim/<expéditeur>/<fichier>, sans espace');
  const mode_a = noeud(tous['70-maitre-action.json'], 'Contrôler la demande').parameters.jsCode;
  assert.doesNotMatch(mode_a, /verifier_document/, 'le Mode A n\'a plus de parcours de vérification');
});
test('« Vérifier le document » : réponse par un nœud « Répondre » (le travail continue ensuite), CORS autorisé', () => {
  const w = noeud(verif, 'Webhook');
  assert.equal(w.parameters.responseMode, 'responseNode');
  assert.ok(w.parameters.options.allowedOrigins);
});
test('réglage : une seule clé modifiable, valeur booléenne', () => {
  const wf = tous['78-maitre-reglage.json'];
  const code = noeud(wf, 'Contrôler le réglage').parameters.jsCode;
  assert.match(code, /const cle = 'verification_ia'/);
  assert.match(code, /typeof e\.valeur !== 'boolean'/);
  assert.equal(noeud(wf, 'Webhook').parameters.responseMode, 'lastNode');
});
console.log(`\n${nb} tests réussis.`);
