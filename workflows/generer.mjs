// Génère les workflows n8n (JSON) à partir des fichiers de workflows/code/*.js.
// On écrit le code des nœuds dans de vrais fichiers .js (lisibles, relisibles, testables) plutôt que dans
// du JSON : ce script les assemble. Lancer : node workflows/generer.mjs
//
//   00-indexeur.json                       sous-workflow commun : découpage, embedding, Qdrant
//   10-connecteur-logiciel-soins.json      PostgreSQL (notes, fiches résidents)
//   20-connecteur-fhir-hopital.json        HAPI FHIR (base de l'hôpital)
//   30-connecteur-fichiers.json            dossier data/fichiers (+ OCR des PDF)
//   40-connecteur-epa.json                 ePA (mocks gematik)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTILS, requeteChat, nouvelleSession } from './code/sgb6/agent.js';

const racine = dirname(fileURLToPath(import.meta.url));
// `remplacements` : { __MARQUE__: texte } remplacés dans le code (ex. les prompts, intégrés à la génération).
const code = (fichier, remplacements = {}) => {
  let texte = readFileSync(join(racine, 'code', `${fichier}.js`), 'utf8').replace(/\r/g, '').trimEnd() + '\n';
  for (const [marque, valeur] of Object.entries(remplacements)) texte = texte.split(marque).join(valeur);
  return texte;
};

export const ID = {
  indexeur: 'aicareindexeur01',
  soins: 'aicareimpsoins001',
  fhir: 'aicareimpfhir0001',
  fichiers: 'aicareimpfich0001',
  epa: 'aicareimpepa00001',
  kim: 'aicareimpkim0001',
  chercher: 'aicarebrqcherch1',
  template: 'aicarebrqtmpl001',
  rediger: 'aicarebrqredig01',
  enregistrer: 'aicarebrqenreg01',
  journal: 'aicarebrqjourn01',
  banc: 'aicarebanc000001',
  maitreAction: 'aicaremaitreact01',
  maitreConsigne: 'aicaremaitrecon01',
  maitreValider: 'aicaremaitreval01',
  apresValidation: 'aicarebrqapres01',
  rapportGarde: 'aicarebrqrapgar1',
  maitreValiderLot: 'aicaremaitrelot01',
  maitreEtage: 'aicaremaitreeta01',
  maitreTache: 'aicaremaitretac01',
  etageComplet: 'aicarebrqetagecp1',
  etageAuto: 'aicaremaitreaut01',
  maitreVerifier: 'aicaremaitreverif1',
  maitreReglage: 'aicaremaitreregl01',
  maitreAnnuler: 'aicaremaitreann01',
  lettreValidee: 'aicarebrqlettre01',
  courrierAuto: 'aicarecourrier001',
  courrierTraiter: 'aicarebrqcourrier1',
  courrierRattrapage: 'aicarecourrierrat1',
  repriseTaches: 'aicarerepriseta01',
  alarmeCapteur: 'aicarealarmecap01',
  connexion: 'aicareconnexion01',
  moi: 'aicaremoi0000001',
  maitreAlarmes: 'aicaremaitrealar1',
  credPostgres: 'aicarepg00000001',
};
const CRED_PG = { postgres: { id: ID.credPostgres, name: 'AI-Care Postgres' } };

// ---- fabrique de nœuds -----------------------------------------------------------------------------------
let compteur = 0;
const uuid = () => `a1c3e000-${String(++compteur).padStart(4, '0')}-4000-8000-${String(compteur).padStart(12, '0')}`;

function noeud(name, type, typeVersion, parameters, position, extra = {}) {
  return { parameters, id: uuid(), name, type, typeVersion, position, ...extra };
}
const nCode = (name, fichier, position, remplacements) => noeud(name, 'n8n-nodes-base.code', 2, { jsCode: code(fichier, remplacements) }, position);
// unique : n8n exécute un nœud une fois PAR élément reçu ; executeOnce l'oblige à ne s'exécuter qu'une fois.
const nPostgres = (name, query, position, unique = false) =>
  noeud(name, 'n8n-nodes-base.postgres', 2.6, { operation: 'executeQuery', query, options: {} }, position, {
    credentials: CRED_PG,
    ...(unique ? { executeOnce: true } : {}),
  });
const nHttpGet = (name, position) =>
  // HAPI renvoie du HTML sans en-tête Accept explicite : on demande du JSON FHIR.
  noeud(name, 'n8n-nodes-base.httpRequest', 4.2, { url: '={{ $json.url }}', sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/fhir+json' }] }, options: { timeout: 120000, response: { response: { responseFormat: 'json' } } } }, position); // application/fhir+json n'est pas reconnu comme JSON par défaut
const nIndexer = (position) =>
  noeud(
    'Indexer',
    'n8n-nodes-base.executeWorkflow',
    1.2,
    {
      source: 'database',
      workflowId: { __rl: true, value: ID.indexeur, mode: 'id' },
      mode: 'once', // un seul appel avec tous les documents
      options: { waitForSubWorkflow: true },
    },
    position,
  );

// Planification : 4 fois par jour (toutes les 6 heures, heure de Berlin). Les connecteurs sont décalés de
// 10 minutes les uns des autres pour ne pas solliciter Ollama et la mémoire du poste en même temps.
const HEURES = '0,6,12,18';
const cron = (minute) => `0 ${minute} ${HEURES} * * *`; // secondes minutes heures jour mois jour-semaine

// OCR (OCRmyPDF) : envoie le PDF joint à l'élément (binaire "data") au service compose/ocr.
const nOcr = (name, position) =>
  noeud(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    {
      method: 'POST',
      url: 'http://ocr:8000/texte',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/pdf' }] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 300000 },
    },
    position,
  );

// Déclencheurs communs aux connecteurs : planification + manuel + webhook (lancement à la demande).
function declencheurs(chemin, minute) {
  return [
    noeud(
      'Planification',
      'n8n-nodes-base.scheduleTrigger',
      1.2,
      { rule: { interval: [{ field: 'cronExpression', expression: cron(minute) }] } },
      [0, -200],
    ),
    noeud('Démarrage manuel', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 0]),
    noeud(
      'Webhook',
      'n8n-nodes-base.webhook',
      2,
      { httpMethod: 'POST', path: chemin, responseMode: 'lastNode', options: {} },
      [0, 200],
      { webhookId: `aicare-${chemin}` },
    ),
  ];
}
const DECL = ['Planification', 'Démarrage manuel', 'Webhook'];

// connexions : suite linéaire entre noms de nœuds ; `depuis` = liste de sources du premier lien
function enchaine(depuis, ...noms) {
  const c = {};
  let sources = depuis;
  for (const nom of noms) {
    for (const s of sources) (c[s] ??= { main: [[]] }).main[0].push({ node: nom, type: 'main', index: 0 });
    sources = [nom];
  }
  return c;
}
const fusion = (...cs) => {
  const res = {};
  for (const c of cs) for (const [k, v] of Object.entries(c)) {
    if (!res[k]) res[k] = v;
    else v.main.forEach((sortie, i) => { (res[k].main[i] ??= []).push(...sortie); });
  }
  return res;
};

const workflow = (id, name, nodes, connections) => ({
  id, name, active: false, nodes, connections, settings: { executionOrder: 'v1', timezone: 'Europe/Berlin' }, pinData: {},
});
// Les workflows sont écrits à la FIN : la protection des points d'entrée (proteger) a besoin de tous les helpers définis plus bas.
const enAttente = [];
const ecrire = (fichier, wf) => enAttente.push([fichier, wf]);

// ---- 00 : Indexeur (sous-workflow) -----------------------------------------------------------------------
{
  const noeuds = [
    noeud('Entrée', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, [0, 0]),
    // alwaysOutputData : même sans document, un élément traverse le flux et le workflow renvoie un résumé.
    { ...nCode('Découper et hacher', 'indexeur-decouper', [240, 0]), alwaysOutputData: true },
    // Anti-doublon : le journal dit quelles empreintes SHA-256 ont déjà été importées (une seule requête).
    noeud(
      'Déjà importés',
      'n8n-nodes-base.postgres',
      2.6,
      {
        operation: 'executeQuery',
        query: "SELECT source, empreinte FROM soins.journal_imports WHERE empreinte = ANY(string_to_array($1, '|'))",
        options: {
          queryReplacement: "={{ [ $('Découper et hacher').all().map(i => i.json.payload?.empreinte ?? '').join('|') ] }}",
        },
      },
      [480, 0],
      { credentials: CRED_PG, executeOnce: true, alwaysOutputData: true },
    ),
    nCode('Garder les nouveautés', 'indexeur-nouveautes', [720, 0]),
    noeud(
      'Nouveautés ?',
      'n8n-nodes-base.if',
      2.2,
      {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [
            {
              id: 'nouveautes',
              leftValue: '={{ $json.rien === true }}',
              rightValue: '',
              operator: { type: 'boolean', operation: 'false', singleValue: true },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      [960, 0],
    ),
    // Branche « rien de nouveau » : aucun embedding, aucun appel à Qdrant.
    nCode('Rien de nouveau', 'indexeur-rien', [1200, 220]),
    noeud(
      'Embedding (nomic-embed-text)',
      'n8n-nodes-base.httpRequest',
      4.2,
      {
        method: 'POST',
        url: 'http://host.docker.internal:11434/api/embed',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ model: "nomic-embed-text", input: $json.embedText }) }}',
        options: { timeout: 300000 },
      },
      [1200, 0],
    ),
    nCode('Construire les points', 'indexeur-points', [1440, 0]),
    noeud(
      'Upsert Qdrant',
      'n8n-nodes-base.httpRequest',
      4.2,
      {
        method: 'PUT',
        url: '=http://qdrant:6333/collections/{{ $json.collection }}/points?wait=true',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.body) }}',
        options: { timeout: 300000 },
      },
      [1680, 0],
    ),
    // Journal : une ligne par morceau importé (écrite seulement après le succès de Qdrant).
    noeud(
      'Journaliser',
      'n8n-nodes-base.postgres',
      2.6,
      {
        operation: 'executeQuery',
        query:
          "INSERT INTO soins.journal_imports (source, reference, patient_id, empreinte, statut, detail) SELECT x.source, x.reference, x.patient_id, x.empreinte, 'importe', x.detail FROM jsonb_to_recordset($1::jsonb) AS x(source text, reference text, patient_id text, empreinte text, detail text) ON CONFLICT (source, empreinte) DO NOTHING",
        options: {
          queryReplacement:
            "={{ [ JSON.stringify($('Garder les nouveautés').all().map(i => ({ source: i.json.payload.source, reference: i.json.payload.source_ref + '#' + i.json.payload.chunk_index, patient_id: i.json.payload.patient_id ?? null, empreinte: i.json.payload.empreinte, detail: i.json.collection + ' / ' + i.json.payload.type }))) ] }}",
        },
      },
      [1920, 0],
      { credentials: CRED_PG, executeOnce: true },
    ),
    nCode('Résumé', 'indexeur-resume', [2160, 0]),
  ];
  const c = fusion(
    enchaine(['Entrée'], 'Découper et hacher', 'Déjà importés', 'Garder les nouveautés', 'Nouveautés ?'),
    {
      'Nouveautés ?': {
        main: [[{ node: 'Embedding (nomic-embed-text)', type: 'main', index: 0 }], [{ node: 'Rien de nouveau', type: 'main', index: 0 }]],
      },
    },
    enchaine(['Embedding (nomic-embed-text)'], 'Construire les points', 'Upsert Qdrant', 'Journaliser', 'Résumé'),
  );
  ecrire('00-indexeur.json', workflow(ID.indexeur, 'AI-Care – Indexeur (sous-workflow)', noeuds, c));
}

// ---- 10 : logiciel de soins ------------------------------------------------------------------------------
{
  const notes = `SELECT n.id, n.patient_id, n.horodatage, n.auteur, n.categorie, n.texte, r.civilite, r.prenom, r.nom, r.chambre FROM soins.notes_soins n JOIN soins.residents r USING (patient_id) WHERE n.horodatage > now() - interval '30 days' ORDER BY n.horodatage`;
  const fiches = `SELECT r.patient_id, r.civilite, r.prenom, r.nom, to_char(r.date_naissance, 'DD.MM.YYYY') AS naissance, r.chambre, r.etage, r.diagnostics, r.allergies, r.regime, r.risques, (SELECT string_agg(m.medicament || ' ' || m.dosage || ' (' || m.schema_prise || ')', ' ; ' ORDER BY m.id) FROM soins.plan_medication m WHERE m.patient_id = r.patient_id AND m.actif) AS medication, (SELECT string_agg(to_char(v.horodatage AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI') || ' ' || v.type || ' ' || v.valeur || ' ' || v.unite, ' ; ' ORDER BY v.horodatage DESC) FROM (SELECT * FROM soins.signes_vitaux WHERE patient_id = r.patient_id ORDER BY horodatage DESC LIMIT 6) v) AS vitaux, (SELECT max(horodatage) FROM soins.signes_vitaux WHERE patient_id = r.patient_id) AS maj, r.date_admission AS admission FROM soins.residents r ORDER BY r.chambre::int`;
  const noeuds = [
    ...declencheurs('import-soins', 0),
    nPostgres('Notes récentes', notes, [260, 100]),
    nPostgres('Fiches résidents', fiches, [500, 100], true),
    nCode('Documents soins', 'soins-docs', [740, 100]),
    nIndexer([980, 100]),
  ];
  const c = enchaine(DECL, 'Notes récentes', 'Fiches résidents', 'Documents soins', 'Indexer');
  ecrire('10-connecteur-logiciel-soins.json', workflow(ID.soins, 'AI-Care – Connecteur logiciel de soins', noeuds, c));
}

// ---- 20 : base de l'hôpital (FHIR) ----------------------------------------------------------------------
{
  const corr = `SELECT patient_id, civilite, prenom, nom, chambre, fhir_id, kvnr FROM soins.v_correspondance`;
  const noeuds = [
    ...declencheurs('import-fhir', 10),
    nPostgres('Correspondance', corr, [260, 100]),
    nCode('Requêtes FHIR', 'fhir-requetes', [500, 100]),
    nHttpGet('Lire FHIR', [740, 100]),
    nCode('Documents FHIR', 'fhir-docs', [980, 100]),
    nIndexer([1220, 100]),
  ];
  const c = enchaine(DECL, 'Correspondance', 'Requêtes FHIR', 'Lire FHIR', 'Documents FHIR', 'Indexer');
  ecrire('20-connecteur-fhir-hopital.json', workflow(ID.fhir, 'AI-Care – Connecteur base de l\'hôpital (FHIR)', noeuds, c));
}

// ---- 30 : fichiers (+ OCR) --------------------------------------------------------------------------------
{
  const residents = `SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre FROM soins.residents`;
  const noeuds = [
    ...declencheurs('import-fichiers', 20),
    nPostgres('Résidents', residents, [260, 100]),
    noeud(
      'Lire les fichiers',
      'n8n-nodes-base.readWriteFile',
      1,
      { fileSelector: '/home/node/.n8n-files/fichiers/*', options: {} },
      [500, 100],
      { executeOnce: true },
    ),
    noeud(
      'Est un PDF',
      'n8n-nodes-base.if',
      2.2,
      {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [
            {
              id: 'est-pdf',
              leftValue: "={{ $binary.data.fileName.toLowerCase().endsWith('.pdf') }}",
              rightValue: '',
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      [740, 100],
    ),
    noeud(
      'OCR (OCRmyPDF)',
      'n8n-nodes-base.httpRequest',
      4.2,
      {
        method: 'POST',
        url: 'http://ocr:8000/texte',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/pdf' }] },
        sendBody: true,
        contentType: 'binaryData',
        inputDataFieldName: 'data',
        options: { timeout: 300000 },
      },
      [980, 0],
    ),
    nCode('Nom du fichier PDF', 'fichiers-nom-ocr', [1220, 0]),
    nCode('Décoder le texte', 'fichiers-decoder', [980, 220]),
    noeud('Réunir', 'n8n-nodes-base.merge', 3, { mode: 'append' }, [1460, 100]),
    nCode('Documents fichiers', 'fichiers-docs', [1700, 100]),
    nIndexer([1940, 100]),
  ];
  const c = fusion(
    enchaine(DECL, 'Résidents', 'Lire les fichiers', 'Est un PDF'),
    { 'Est un PDF': { main: [[{ node: 'OCR (OCRmyPDF)', type: 'main', index: 0 }], [{ node: 'Décoder le texte', type: 'main', index: 0 }]] } },
    enchaine(['OCR (OCRmyPDF)'], 'Nom du fichier PDF'),
    { 'Nom du fichier PDF': { main: [[{ node: 'Réunir', type: 'main', index: 0 }]] } },
    { 'Décoder le texte': { main: [[{ node: 'Réunir', type: 'main', index: 1 }]] } },
    enchaine(['Réunir'], 'Documents fichiers', 'Indexer'),
  );
  ecrire('30-connecteur-fichiers.json', workflow(ID.fichiers, 'AI-Care – Connecteur fichiers (OCR)', noeuds, c));
}

// ---- 40 : ePA --------------------------------------------------------------------------------------------
{
  const corr = `SELECT patient_id, civilite, prenom, nom, chambre, fhir_id, kvnr FROM soins.v_correspondance`;
  const noeuds = [
    ...declencheurs('import-epa', 30),
    nPostgres('Correspondance', corr, [260, 100]),
    nCode('Requêtes ePA', 'epa-requetes', [500, 100]),
    nHttpGet('Lire l\'ePA', [740, 100]),
    nCode('Documents ePA', 'epa-docs', [980, 100]),
    nIndexer([1220, 100]),
    // Nouveautés : un résident dont l'ePA avait déjà été importée et dont du contenu nouveau ou modifié vient d'être indexé reçoit une
    // notification (page Alertes). La première importation d'un résident ne notifie rien.
    nPostgres(
      'Nouveautés ePA',
      "INSERT INTO soins.alarmes (topic, chambre, type, libelle, patient_id, faits, contexte) SELECT 'epa/' || n.patient_id || '/' || to_char(now(), 'YYYYMMDDHH24MI'), r.chambre, 'document', 'Nouveauté dans l''ePA', n.patient_id, jsonb_build_object('gravite', 'info', 'resident', r.civilite || ' ' || r.prenom || ' ' || r.nom, 'chambre', r.chambre, 'etage', r.etage, 'source', 'ePA', 'courrier', jsonb_build_object('titre', 'Contenu nouveau ou modifié dans l''ePA', 'expediteur', 'ePA', 'date', now())), '{\"statut\":\"aucun\"}'::jsonb FROM (SELECT DISTINCT patient_id FROM soins.journal_imports WHERE source = 'epa' AND importe_le > now() - interval '15 minutes') n JOIN soins.residents r ON r.patient_id = n.patient_id WHERE EXISTS (SELECT 1 FROM soins.journal_imports j WHERE j.source = 'epa' AND j.patient_id = n.patient_id AND j.importe_le <= now() - interval '15 minutes') ON CONFLICT (topic) WHERE type = 'document' DO NOTHING RETURNING id",
      [1460, 100],
      true,
    ),
  ];
  const c = enchaine(DECL, 'Correspondance', 'Requêtes ePA', "Lire l'ePA", 'Documents ePA', 'Indexer', 'Nouveautés ePA');
  ecrire('40-connecteur-epa.json', workflow(ID.epa, 'AI-Care – Connecteur ePA', noeuds, c));
}

// ---- 50 : KIM (lettres de médecin dans Mailpit) ---------------------------------------------------------
{
  const residents = `SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre FROM soins.residents`;
  const get = (name, url, position, extra = {}) =>
    noeud(name, 'n8n-nodes-base.httpRequest', 4.2, { url, options: { timeout: 120000, ...extra } }, position);
  const noeuds = [
    ...declencheurs('import-kim', 40),
    nPostgres('Résidents', residents, [260, 100], true),
    get('Lister les messages', 'http://mailpit:8025/api/v1/messages?limit=100', [500, 100]),
    nCode('Messages à lire', 'kim-messages', [740, 100]),
    get('Détail du message', '=http://mailpit:8025/api/v1/message/{{ $json.id }}', [980, 100]),
    nCode('Pièces jointes', 'kim-pieces', [1220, 100]),
    get('Télécharger la pièce jointe', '=http://mailpit:8025/api/v1/message/{{ $json.id }}/part/{{ $json.partId }}', [1460, 100], {
      response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
    }),
    nOcr('Texte du PDF (OCRmyPDF)', [1700, 100]),
    { ...nCode('Documents KIM', 'kim-docs', [1940, 100]), alwaysOutputData: true },
    nIndexer([2180, 100]),
  ];
  const c = enchaine(DECL, 'Résidents', 'Lister les messages', 'Messages à lire', 'Détail du message', 'Pièces jointes', 'Télécharger la pièce jointe', 'Texte du PDF (OCRmyPDF)', 'Documents KIM', 'Indexer');
  ecrire('50-connecteur-kim.json', workflow(ID.kim, 'AI-Care – Connecteur KIM (lettres de médecin)', noeuds, c));
}

// =====================================================================================================
// JOUR 3 – briques réutilisables (sous-workflows) : chercher, template, rédiger, enregistrer, journal
// =====================================================================================================

// ---- lecture des prompts versionnés (prompts/*.md) ----------------------------------------------------
function lirePrompts() {
  const dossier = join(racine, '..', 'prompts');
  const lire = (nom) => readFileSync(join(dossier, nom), 'utf8').replace(/\r/g, '');
  const separe = (brut, nom) => {
    const m = brut.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`${nom} : en-tête « --- » manquant`);
    const meta = {};
    for (const ligne of m[1].split('\n')) {
      const kv = ligne.match(/^(\w+):\s*(.*?)\s*$/);
      if (!kv) continue;
      const v = kv[2];
      meta[kv[1]] = v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
    return { meta, corps: m[2] };
  };

  const r = separe(lire('_regles.md'), '_regles.md');
  const REGLES = { version: String(r.meta.version), texte: r.corps.trim() };

  const PROMPTS = {};
  for (const fichier of readdirSync(join(racine, '..', 'prompts')).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md').sort()) {
    const { meta, corps } = separe(lire(fichier), fichier);
    for (const cle of ['id', 'version', 'sortie', 'temperature', 'heures', 'requete', 'protocoles']) {
      if (meta[cle] === undefined) throw new Error(`${fichier} : champ « ${cle} » manquant`);
    }
    if (meta.id !== fichier.replace(/\.md$/, '')) throw new Error(`${fichier} : id « ${meta.id} » différent du nom du fichier`);
    if (!['texte', 'json', 'phrases'].includes(meta.sortie)) throw new Error(`${fichier} : sortie doit valoir texte, json ou phrases`);
    const instruction = corps.match(/## INSTRUCTION\n([\s\S]*?)\n## FORMAT DE SORTIE\n/);
    const format = corps.match(/## FORMAT DE SORTIE\n([\s\S]*)$/);
    if (!instruction || !format) throw new Error(`${fichier} : sections « ## INSTRUCTION » et « ## FORMAT DE SORTIE » requises`);
    PROMPTS[meta.id] = {
      id: meta.id,
      version: String(meta.version),
      sortie: meta.sortie,
      temperature: meta.temperature,
      heures: meta.heures,
      requete: meta.requete,
      protocoles: meta.protocoles,
      // rubriques d'un texte « phrases » : « S=S – Situation :|B=… » -> [{ cle, titre }]
      sections: String(meta.sections ?? '').split('|').map((s) => s.trim()).filter(Boolean).map((s) => ({ cle: s.slice(0, s.indexOf('=')), titre: s.slice(s.indexOf('=') + 1) })),
      // les rapports de garde déjà validés ne sont relus que par les prompts qui le demandent (Mode B), jamais comme faits d'un nouveau rapport
      rapports_valides: meta.rapports_valides === true,
      // au plus 8 faits par résident par défaut (prompt plus court = génération plus rapide)
      max_faits: Number(meta.max_faits ?? 8),
      // longueur de la réponse : nombre de phrases et caractères par phrase (une réponse plus courte se génère plus vite)
      max_phrases: Number(meta.max_phrases ?? 8),
      longueur_phrase: Number(meta.longueur_phrase ?? 220),
      sources_prioritaires: String(meta.sources_prioritaires ?? '').split('|').map((s) => s.trim()).filter(Boolean),
      instruction_libre: meta.instruction_libre === true,
      listes_json: Object.fromEntries(String(meta.listes_json ?? '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [liste, cles] = s.split(':'); return [liste.trim(), cles.split('|').map((c) => c.trim())]; })),
      cles_json: meta.sortie === 'json' ? String(meta.cles_json ?? '').split(',').map((c) => c.trim()).filter(Boolean) : [],
      instruction: instruction[1].trim(),
      format: format[1].trim(),
    };
  }
  return { REGLES, PROMPTS };
}
const { REGLES, PROMPTS } = lirePrompts();
// Modèle de langue : llama3.2 (3 milliards de paramètres, ~2,5 fois plus rapide) sur ce poste de 8 Go ;
// llama3 (8 milliards) sur un poste plus puissant : $env:AICARE_MODELE = 'llama3' ; node workflows/generer.mjs
const MODELE = process.env.AICARE_MODELE || 'llama3.2';
// Threads de calcul d'Ollama : 3 par défaut (poste de 4 coeurs) ; $env:AICARE_THREADS = 6 ; node workflows/generer.mjs sur un poste plus puissant.
const THREADS = Math.max(1, Number(process.env.AICARE_THREADS || 3));
const remplPrompts = { __PROMPTS__: JSON.stringify(PROMPTS), __REGLES__: JSON.stringify(REGLES) };

// ---- fabriques propres aux briques --------------------------------------------------------------------
// mode : 'once' = un seul appel avec tous les éléments ; 'each' = un appel (une exécution) par élément, l'un après l'autre.
const nExec = (name, workflowId, position, mode = 'once') =>
  noeud(
    name,
    'n8n-nodes-base.executeWorkflow',
    1.2,
    { source: 'database', workflowId: { __rl: true, value: workflowId, mode: 'id' }, mode, options: { waitForSubWorkflow: true } },
    position,
  );
const entree = (position = [0, 0]) => noeud('Entrée', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, position);
// Requête SQL paramétrée ($1, $2…) : les valeurs passent par queryReplacement, jamais par concaténation.
const nPg = (name, query, valeurs, position, extra = {}) =>
  noeud(
    name,
    'n8n-nodes-base.postgres',
    2.6,
    { operation: 'executeQuery', query, options: { queryReplacement: `={{ [ ${valeurs} ] }}` } },
    position,
    { credentials: CRED_PG, executeOnce: true, alwaysOutputData: true, ...extra },
  );
const nHttp = (name, parametres, position) =>
  noeud(name, 'n8n-nodes-base.httpRequest', 4.2, { sendBody: true, specifyBody: 'json', ...parametres }, position);

const nSi = (name, expression, vrai, position) =>
  noeud(
    name,
    'n8n-nodes-base.if',
    2.2,
    {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: name, leftValue: expression, rightValue: '', operator: { type: 'boolean', operation: vrai ? 'true' : 'false', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
    position,
  );
const sortieSi = (si, versVrai, versFaux) => ({ [si]: { main: [[{ node: versVrai, type: 'main', index: 0 }], [{ node: versFaux, type: 'main', index: 0 }]] } });
const sortieSiFin = (si, versVrai) => ({ [si]: { main: [[{ node: versVrai, type: 'main', index: 0 }], []] } });
const poursuivre = (noeudsConcernes) => noeudsConcernes.map((n) => ({ ...n, onError: 'continueRegularOutput' }));

// ---- SÉCURITÉ DES POINTS D'ENTRÉE (jour 4, étape 7) --------------------------------------------------------------
// 1. clé secrète : en-tête X-AICare-Cle (credential « AI-Care clé des webhooks », valeur dans .env). L'interface l'envoie aussi : elle est donc
//    visible dans son code et ne remplace PAS la connexion du soignant (voir DECISIONS.md).
// 2. origines autorisées : CORS limité à l'adresse de l'interface (AICARE_ORIGINES pour en changer).
// 3. session : le jeton Bearer du soignant est contrôlé AVANT tout traitement ; sans session valide, rien n'est exécuté.
// Appliqué à tous les webhooks par `ecrire`, sauf la connexion (clé seule) et le courrier reçu (appelé par Mailpit, qui ne sait pas envoyer d'en-tête).
const CRED_CLE = { httpHeaderAuth: { id: 'aicarecle000000001', name: 'AI-Care clé des webhooks' } };
const ORIGINES = process.env.AICARE_ORIGINES || ['localhost', '127.0.0.1'].flatMap((h) => [5173, 5174, 5175].map((p) => `http://${h}:${p}`)).join(',');
// chemin INTERNE (appelé par n8n lui-même, jamais par l'interface) : clé distincte, absente du code de l'interface, et aucune session de soignant
const CRED_INTERNE = { httpHeaderAuth: { id: 'aicarecleint0000001', name: 'AI-Care clé interne' } };
const INTERNES = ['aicare-verifier-interne'];
const SANS_SESSION = ['aicare-connexion'];
const SANS_CLE = ['courrier-recu'];
function proteger(wf) {
  const webhooks = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
  const nouveaux = [];
  const c = wf.connections;
  const gardes = webhooks.filter((w) => ![...INTERNES, ...SANS_CLE, ...SANS_SESSION].includes(w.parameters.path));
  webhooks.forEach((w, i) => {
    const chemin = w.parameters.path;
    if (INTERNES.includes(chemin)) {
      w.credentials = CRED_INTERNE;
      w.parameters = { ...w.parameters, authentication: 'headerAuth' };
      return;
    }
    if (!SANS_CLE.includes(chemin)) {
      w.credentials = CRED_CLE;
      w.parameters = { ...w.parameters, authentication: 'headerAuth', options: { ...w.parameters.options, allowedOrigins: ORIGINES } };
    }
    if (SANS_CLE.includes(chemin) || SANS_SESSION.includes(chemin)) return;
    const sfx = gardes.length > 1 ? ` (${w.name})` : '';
    const [x, y] = w.position;
    const n = (nom) => nom + sfx;
    const apres = (c[w.name]?.main?.[0] ?? []).map((l) => l.node);
    const repondre = w.parameters.responseMode === 'responseNode';
    nouveaux.push(
      nCode(n('Session (jeton)'), 'session-jeton', [x + 120, y - 380]),
      nPg(n('Session (base)'), 'SELECT s.identifiant, g.nom, s.jeton_hash FROM soins.sessions s JOIN soins.soignants g ON g.identifiant = s.identifiant WHERE s.jeton_hash = $1 AND s.expire_le > now() AND g.actif', '$json.hash', [x + 240, y - 380]),
      nCode(n('Session'), 'session-resultat', [x + 360, y - 380]),
      nSi(n('Session valide ?'), '={{ $json.ok === true }}', true, [x + 480, y - 380]),
      nCode(n('Requête'), 'session-requete', [x + 600, y - 460], { __WEBHOOK__: w.name }),
      nCode(n('Refus (session)'), 'session-refus', [x + 600, y - 300]),
    );
    if (repondre) nouveaux.push(noeud(n('Répondre (session)'), 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} }, [x + 720, y - 300]));
    // le nœud « Session » garde son nom exact (sans suffixe) quand il n'y a qu'un webhook : le code des nœuds suivants le lit
    Object.assign(
      c,
      { [w.name]: { main: [[{ node: n('Session (jeton)'), type: 'main', index: 0 }]] } },
      enchaine([n('Session (jeton)')], n('Session (base)'), n('Session'), n('Session valide ?')),
      sortieSi(n('Session valide ?'), n('Requête'), n('Refus (session)')),
      { [n('Requête')]: { main: [apres.map((node) => ({ node, type: 'main', index: 0 }))] } },
      repondre ? enchaine([n('Refus (session)')], n('Répondre (session)')) : {},
    );
  });
  wf.nodes.push(...nouveaux);
  return wf;
}

// ---- 64 : journal ---------------------------------------------------------------------------------------
{
  const noeuds = [
    entree(),
    nPg(
      'Écrire au journal',
      "INSERT INTO soins.journal_ia (evenement, patient_id, mode, action, prompt_id, prompt_version, modele, duree_ms, details) VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, '')::int, $9::jsonb) RETURNING id",
      "$json.evenement, $json.patient_id ?? '', $json.mode ?? '', $json.action ?? '', $json.prompt_id ?? '', $json.prompt_version ?? '', $json.modele ?? '', String($json.duree_ms ?? ''), JSON.stringify($json.details ?? {})",
      [240, 0],
    ),
  ];
  ecrire('64-brique-journal.json', workflow(ID.journal, 'AI-Care – Brique journal', noeuds, enchaine(['Entrée'], 'Écrire au journal')));
}

// ---- 60 : chercher ----------------------------------------------------------------------------------------
{
  const P = "$('Paramètres').first().json";
  const pid = `${P}.patient_id`;
  const periode = `${pid}, ${P}.depuis, ${P}.jusqua`;
  const filtrePatient = `{ key: 'patient_id', match: { value: ${P}.patient_id } }`;
  const vecteur = "$('Embedding de la requête').first().json.embeddings[0]";
  const recherche = (nom, collection, filtre, limite, x) =>
    nHttp(
      nom,
      {
        method: 'POST',
        url: `http://qdrant:6333/collections/${collection}/points/search`,
        jsonBody: `={{ JSON.stringify({ vector: ${vecteur}, limit: ${limite}, with_payload: true${filtre ? `, filter: { must: [ ${filtre} ] }` : ''} }) }}`,
        options: { timeout: 120000 },
      },
      x,
    );
  const noeuds = [
    entree(),
    nCode('Paramètres', 'brique-chercher-params', [240, 0]),
    nPg(
      'Résident',
      "SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre, etage, diagnostics, allergies, regime, risques FROM soins.residents WHERE patient_id = $1",
      pid, [480, 0],
    ),
    nPg('Autres résidents', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE patient_id <> $1', pid, [720, 0]),
    nPg(
      'Notes de la période',
      'SELECT id, horodatage, auteur, categorie, texte FROM soins.notes_soins WHERE patient_id = $1 AND horodatage >= $2::timestamptz AND horodatage <= $3::timestamptz ORDER BY horodatage',
      periode, [960, 0],
    ),
    nPg(
      'Constantes de la période',
      'SELECT horodatage, type, valeur, unite FROM soins.signes_vitaux WHERE patient_id = $1 AND horodatage >= $2::timestamptz AND horodatage <= $3::timestamptz ORDER BY horodatage',
      periode, [1200, 0],
    ),
    nPg('Plan de médication', 'SELECT medicament, dosage, schema_prise, indication FROM soins.plan_medication WHERE patient_id = $1 AND actif ORDER BY id', pid, [1440, 0]),
    nHttp(
      'Embedding de la requête',
      {
        method: 'POST',
        url: 'http://host.docker.internal:11434/api/embed',
        jsonBody: `={{ JSON.stringify({ model: 'nomic-embed-text', input: 'search_query: ' + ${P}.requete, keep_alive: '30m' }) }}`,
        options: { timeout: 120000 },
      },
      [1680, 0],
    ),
    recherche(
      'Qdrant période', 'patients',
      `${filtrePatient}, { key: 'date', range: { gte: ${P}.depuis, lte: ${P}.jusqua } }`,
      `${P}.limite`, [1920, 0],
    ),
    recherche(
      'Qdrant fond', 'patients',
      `${filtrePatient}, { key: 'type', match: { any: ['diagnostic', 'allergie', 'medication', 'analyse', 'document', 'lettre_validee'] } }`,
      6, [2160, 0],
    ),
    recherche('Qdrant protocoles', 'connaissances', null, 2, [2400, 0]),
    nHttp(
      'Qdrant lettres',
      {
        method: 'POST',
        url: 'http://qdrant:6333/collections/a_verifier/points/scroll',
        jsonBody: `={{ JSON.stringify({ limit: 5, with_payload: true, with_vector: false, filter: { must: [ ${filtrePatient}, { key: 'statut', match: { value: 'a_verifier' } } ] } }) }}`,
        options: { timeout: 120000 },
      },
      [2640, 0],
    ),
    nCode('Assembler les faits', 'brique-chercher-faits', [2880, 0]),
  ];
  const c = enchaine(
    ['Entrée'], 'Paramètres', 'Résident', 'Autres résidents', 'Notes de la période', 'Constantes de la période', 'Plan de médication',
    'Embedding de la requête', 'Qdrant période', 'Qdrant fond', 'Qdrant protocoles', 'Qdrant lettres', 'Assembler les faits',
  );
  ecrire('60-brique-chercher.json', workflow(ID.chercher, 'AI-Care – Brique chercher', noeuds, c));
}

// ---- 61 : template verrouillé ---------------------------------------------------------------------------
{
  const noeuds = [entree(), nCode('Template verrouillé', 'brique-template', [240, 0], remplPrompts)];
  ecrire('61-brique-template.json', workflow(ID.template, 'AI-Care – Brique template verrouillé', noeuds, enchaine(['Entrée'], 'Template verrouillé')));
}

// ---- 62 : rédiger (Llama 3, température 0,1) ---------------------------------------------------------
{
  const noeuds = [
    entree(),
    nCode('Préparer appel', 'brique-rediger-appel', [240, 0], { __MODELE__: JSON.stringify(MODELE), __THREADS__: String(THREADS) }),
    nHttp(
      'Modèle de langue (Ollama)',
      {
        method: 'POST',
        url: 'http://host.docker.internal:11434/api/generate',
        jsonBody: '={{ JSON.stringify($json.body) }}',
        options: { timeout: 1800000 }, // 30 min : Llama 3 sur ce poste dépasse parfois 15 min
      },
      [480, 0],
    ),
    nCode('Contrôler la réponse', 'brique-rediger-controle', [720, 0]),
    nPg(
      'Créer le brouillon',
      "INSERT INTO soins.brouillons (patient_id, mode, action, consigne, prompt_id, prompt_version, modele, texte_ia, faits, avertissements, retirees) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb) RETURNING id",
      "$('Préparer appel').first().json.patient.patient_id, $('Préparer appel').first().json.mode ?? 'a', $('Préparer appel').first().json.action ?? $('Préparer appel').first().json.prompt_id, $('Préparer appel').first().json.consigne ?? '', $('Préparer appel').first().json.prompt_id, $('Préparer appel').first().json.prompt_version, $json.modele, $json.texte, JSON.stringify($('Préparer appel').first().json.faits.map(f => ({ id: f.id, label: f.label, texte: f.texte, date: f.date, ref: f.ref }))), JSON.stringify($json.avertissements), JSON.stringify($json.retirees ?? [])",
      [960, 0],
      { alwaysOutputData: false },
    ),
    nCode('Résultat du brouillon', 'brique-rediger-resultat', [1200, 0]),
    nCode('Événement', 'brique-rediger-evenement', [1440, 0]),
    nExec('Journal', ID.journal, [1680, 0]),
    noeud('Réponse', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: $('Résultat du brouillon').first().json }];\n" }, [1920, 0]),
  ];
  const c = enchaine(['Entrée'], 'Préparer appel', 'Modèle de langue (Ollama)', 'Contrôler la réponse', 'Créer le brouillon', 'Résultat du brouillon', 'Événement', 'Journal', 'Réponse');
  ecrire('62-brique-rediger.json', workflow(ID.rediger, 'AI-Care – Brique rédiger', noeuds, c));
}

// ---- 63 : enregistrer (uniquement après validation) -------------------------------------------------
{
  const noeuds = [
    entree(),
    nCode('Contrôler la validation', 'brique-enregistrer-controle', [240, 0]),
    nPg(
      'Valider le brouillon',
      "WITH b AS (UPDATE soins.brouillons SET statut = 'valide' WHERE id = $1::uuid AND statut = 'brouillon' RETURNING *) INSERT INTO soins.validations (patient_id, mode, action, consigne, texte, sources, modifiee, valide_par, soignant_id, brouillon_id) SELECT b.patient_id, b.mode, b.action, b.consigne, $2::text, (SELECT coalesce(jsonb_agg(DISTINCT f->>'label'), '[]'::jsonb) FROM jsonb_array_elements(b.faits) AS f), btrim($2::text) <> btrim(b.texte_ia), $3::text, NULLIF($4::text, ''), b.id FROM b RETURNING id AS validation_id, patient_id, mode, action, modifiee",
      '$json.brouillon_id, $json.texte, $json.valide_par, $json.soignant_id',
      [480, 0],
    ),
    nCode('Résultat de la validation', 'brique-enregistrer-resultat', [720, 0]),
    nCode('Événement', 'brique-enregistrer-evenement', [960, 0]),
    nExec('Journal', ID.journal, [1200, 0]),
    nCode('Sortie', 'brique-enregistrer-sortie', [1440, 0]),
  ];
  const c = enchaine(['Entrée'], 'Contrôler la validation', 'Valider le brouillon', 'Résultat de la validation', 'Événement', 'Journal', 'Sortie');
  ecrire('63-brique-enregistrer.json', workflow(ID.enregistrer, 'AI-Care – Brique enregistrer (après validation)', noeuds, c));
}

// ---- 65 : banc d'essai des briques (Mode A seulement : aucun texte libre) -----------------------------
{
  const noeuds = [
    noeud('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'test-briques', responseMode: 'lastNode', options: {} }, [0, 0], { webhookId: 'aicare-test-briques' }),
    // seuls patient_id et prompt_id sont lus dans le corps de la requête ; tout le reste vient des fichiers prompts/
    nCode('Paramètres du prompt', 'brique-prompt-parametres', [240, 0], remplPrompts),
    nExec('Chercher', ID.chercher, [480, 0]),
    nCode('Vers template', 'brique-vers-template', [720, 0]),
    nExec('Template', ID.template, [960, 0]),
    nCode('Vers rédiger', 'brique-vers-rediger', [1200, 0]),
    nExec('Rédiger', ID.rediger, [1440, 0]),
    // Deuxième entrée : valider un brouillon. Ce texte est enregistré, il n'est JAMAIS envoyé à l'IA.
    noeud('Webhook validation', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'test-enregistrer', responseMode: 'lastNode', options: {} }, [0, 300], { webhookId: 'aicare-test-enregistrer' }),
    nCode('Corps de la validation', 'valider-corps', [240, 300], { "$('Session')": "$('Session (Webhook validation)')" }),
    nExec('Enregistrer', ID.enregistrer, [480, 300]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Paramètres du prompt', 'Chercher', 'Vers template', 'Template', 'Vers rédiger', 'Rédiger'),
    enchaine(['Webhook validation'], 'Corps de la validation', 'Enregistrer'),
  );
  ecrire('65-banc-essai-briques.json', workflow(ID.banc, "AI-Care – Banc d'essai des briques", noeuds, c));
}

// =====================================================================================================
// JOUR 3, ÉTAPE 3 – workflows D'ENTRÉE de l'interface : action (Mode A), consigne (Mode B), valider
// =====================================================================================================
const webhookInterface = (chemin, position) =>
  noeud(
    'Webhook',
    'n8n-nodes-base.webhook',
    2,
    // CORS ouvert pour le développement local (interface sur un autre port, tablette sur le réseau) ; à restreindre en production.
    { httpMethod: 'POST', path: chemin, responseMode: 'lastNode', options: { allowedOrigins: '*' } },
    position,
    { webhookId: `aicare-${chemin}` },
  );
// ---- 70 : Mode A – {action, chambre} : rapport de garde, résumé ePA, points de vigilance ---------------------------
// (« Vérifier le document » a son propre point d'entrée, 77, car sa réponse part avant la fin du travail.)
{
  const noeuds = [
    webhookInterface('aicare-action', [0, 0]),
    nCode('Contrôler la demande', 'maitre-controle-demande', [240, 0]),
    nPg('Résident de la chambre', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre = $1', '$json.chambre', [480, 0]),
    nCode('Choisir le parcours', 'maitre-choisir-parcours', [720, 0]),
    nCode('Paramètres du prompt', 'brique-prompt-parametres', [960, 0], remplPrompts),
    nExec('Chercher', ID.chercher, [1200, 0]),
    nCode('Vers template', 'brique-vers-template', [1440, 0]),
    nExec('Template', ID.template, [1680, 0]),
    nCode('Vers rédiger', 'brique-vers-rediger', [1920, 0]),
    nExec('Rédiger', ID.rediger, [2160, 0]),
    nCode('Réponse texte', 'maitre-reponse-texte', [2400, 0]),
  ];
  const c = enchaine(
    ['Webhook'], 'Contrôler la demande', 'Résident de la chambre', 'Choisir le parcours', 'Paramètres du prompt', 'Chercher', 'Vers template', 'Template',
    'Vers rédiger', 'Rédiger', 'Réponse texte',
  );
  ecrire('70-maitre-action.json', workflow(ID.maitreAction, "AI-Care – Entrée Mode A (action et chambre)", noeuds, c));
}

// ---- 71 : Mode B – {chambre, consigne} : le contrôle de la consigne est la SEULE porte du texte libre -----
{
  const noeuds = [
    webhookInterface('aicare-consigne', [0, 0]),
    nCode('Contrôler la chambre', 'maitre-chambre-consigne', [240, 0]),
    nPg('Résident de la chambre', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre = $1', '$json.chambre', [480, 0]),
    nPg('Autres résidents (contrôle)', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre <> $1', "$('Contrôler la chambre').first().json.chambre", [720, 0]),
    nCode('Contrôler la consigne', 'maitre-controle-consigne', [960, 0]),
    nSi('Consigne acceptée ?', '={{ $json.accepte === true }}', true, [1200, 0]),

    // consigne refusée : journal + réponse, RIEN n'est envoyé à l'IA
    nCode('Événement refus', 'maitre-evenement-refus', [1440, 260]),
    nExec('Journal', ID.journal, [1680, 260]),
    nCode('Réponse refus', 'maitre-reponse-refus', [1920, 260]),

    // consigne acceptée : chercher, template verrouillé, rédiger
    nCode('Paramètres consigne', 'maitre-params-consigne', [1440, -200], remplPrompts),
    nExec('Chercher', ID.chercher, [1680, -200]),
    nCode('Vers template (consigne)', 'maitre-vers-template-consigne', [1920, -200]),
    nExec('Template', ID.template, [2160, -200]),
    nCode('Vers rédiger (consigne)', 'maitre-vers-rediger-consigne', [2400, -200]),
    nExec('Rédiger', ID.rediger, [2640, -200]),
    nCode('Réponse texte', 'maitre-reponse-texte', [2880, -200]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Contrôler la chambre', 'Résident de la chambre', 'Autres résidents (contrôle)', 'Contrôler la consigne', 'Consigne acceptée ?'),
    sortieSi('Consigne acceptée ?', 'Paramètres consigne', 'Événement refus'),
    enchaine(['Événement refus'], 'Journal', 'Réponse refus'),
    enchaine(['Paramètres consigne'], 'Chercher', 'Vers template (consigne)', 'Template', 'Vers rédiger (consigne)', 'Rédiger', 'Réponse texte'),
  );
  ecrire('71-maitre-consigne.json', workflow(ID.maitreConsigne, 'AI-Care – Entrée Mode B (consigne guidée)', noeuds, c));
}

// ---- 72 : Valider & Enregistrer ---------------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-valider', [0, 0]),
    nCode('Corps de la validation', 'valider-corps', [240, 0]),
    nExec('Enregistrer', ID.enregistrer, [480, 0]),
    // Un rapport de garde validé est ajouté au RAG et transmis à l'équipe suivante (autres actions : enregistrées seulement).
    nSi('Rapport de garde ?', "={{ $json.ok === true && $json.action === 'generer_sbar' }}", true, [720, 0]),
    nCode('Vers après validation', 'valider-vers-apres', [960, -120]),
    { ...nExec('Après validation', ID.apresValidation, [1200, -120]), onError: 'continueRegularOutput' },
    nCode('Réponse validation', 'valider-reponse', [1440, -120]),
    nSi('Vérification validée ?', "={{ $json.ok === true && $json.action === 'verifier_document' }}", true, [960, 140]),
    nCode('Vers lettre validée', 'valider-vers-lettre', [1200, 300]),
    { ...nExec('Lettre validée', ID.lettreValidee, [1440, 300]), onError: 'continueRegularOutput' },
    nCode('Réponse validation (lettre)', 'valider-reponse-lettre', [1680, 300]),
    noeud('Réponse simple', 'n8n-nodes-base.code', 2, { jsCode: 'return [{ json: $input.first().json }];\n' }, [1200, 500]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Corps de la validation', 'Enregistrer', 'Rapport de garde ?'),
    sortieSi('Rapport de garde ?', 'Vers après validation', 'Vérification validée ?'),
    sortieSi('Vérification validée ?', 'Vers lettre validée', 'Réponse simple'),
    enchaine(['Vers lettre validée'], 'Lettre validée', 'Réponse validation (lettre)'),
    enchaine(['Vers après validation'], 'Après validation', 'Réponse validation'),
  );
  ecrire('72-maitre-valider.json', workflow(ID.maitreValider, 'AI-Care – Entrée Valider & Enregistrer', noeuds, c));
}

// =====================================================================================================
// JOUR 3, ÉTAPE 4 – rapport de garde (SBAR des 12 dernières heures) par résident et par étage ;
// après validation : ajout au RAG + transmission à l'équipe suivante
// =====================================================================================================

// ---- 66 : après validation (RAG + transmission) ----------------------------------------------------------
{
  const idsValides = "'{' + ($('Entrée').first().json.validation_ids ?? []).map(Number).filter(Number.isInteger).join(',') + '}'";
  const noeuds = [
    entree(),
    // Le texte ajouté au RAG et transmis est lu dans la table des validations, pas dans la requête reçue.
    nPg(
      'Rapports validés',
      "SELECT v.id AS validation_id, v.patient_id, v.texte, v.sources, v.valide_par, v.valide_le, r.civilite, r.prenom, r.nom, r.chambre, r.etage FROM soins.validations v JOIN soins.residents r ON r.patient_id = v.patient_id WHERE v.id = ANY($1::bigint[]) AND v.action = 'generer_sbar' ORDER BY r.chambre",
      idsValides, [240, 0],
    ),
    nCode('Documents RAG', 'apres-validation-docs', [480, 0]),
    nExec('Indexer (RAG)', ID.indexeur, [720, 0]),
    nCode('Message de transmission', 'apres-validation-message', [960, 0]),
    // Boîte de transmission simulée (Mailpit). Un échec d'envoi est noté, il n'annule pas la validation.
    {
      ...nHttp(
        'Envoyer (Mailpit)',
        { method: 'POST', url: 'http://mailpit:8025/api/v1/send', jsonBody: "={{ JSON.stringify($('Message de transmission').first().json.mailpit) }}", options: { timeout: 60000 } },
        [1200, 0],
      ),
      onError: 'continueRegularOutput',
    },
    nPg(
      'Noter la transmission',
      "INSERT INTO soins.transmissions (portee, etage, patient_ids, validation_ids, destinataire, canal, sujet, statut, detail) VALUES ($1, NULLIF($2, '')::int, $3::text[], $4::bigint[], $5, 'mailpit', $6, $7, $8::jsonb) RETURNING id",
      "$('Message de transmission').first().json.portee, String($('Message de transmission').first().json.etage ?? ''), '{' + $('Message de transmission').first().json.patient_ids.join(',') + '}', '{' + $('Message de transmission').first().json.validation_ids.join(',') + '}', $('Message de transmission').first().json.destinataire, $('Message de transmission').first().json.sujet, $('Envoyer (Mailpit)').first().json.error ? 'echec' : 'envoye', JSON.stringify($('Envoyer (Mailpit)').first().json.error ? { erreur: String($('Envoyer (Mailpit)').first().json.error.message ?? $('Envoyer (Mailpit)').first().json.error).slice(0, 200) } : { mailpit_id: $('Envoyer (Mailpit)').first().json.ID ?? null })",
      [1440, 0],
    ),
    nCode('Résumé', 'apres-validation-resume', [1680, 0]),
    nCode('Événements', 'apres-validation-evenements', [1920, 0]),
    nExec('Journal', ID.journal, [2160, 0], 'each'),
    nCode('Sortie', 'apres-validation-sortie', [2400, 0]),
  ];
  const c = enchaine(['Entrée'], 'Rapports validés', 'Documents RAG', 'Indexer (RAG)', 'Message de transmission', 'Envoyer (Mailpit)', 'Noter la transmission', 'Résumé', 'Événements', 'Journal', 'Sortie');
  ecrire('66-brique-apres-validation.json', workflow(ID.apresValidation, 'AI-Care – Brique après validation (RAG + transmission)', noeuds, c));
}

// ---- 67 : rapport de garde d'UN résident (appelé une fois par résident pour un étage) ----------------------
{
  const noeuds = [
    entree(),
    // Battement de coeur + contrôle d'annulation : avant chaque résident, on note « je suis vivant » ; si la tâche n'est plus
    // « en cours » (annulée, interrompue), ce résident est ignoré et aucune génération n'est lancée.
    nPg(
      'Tâche toujours voulue',
      "UPDATE soins.taches SET heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING true AS active",
      '$json.task_id',
      [240, 0],
    ),
    nSi('Tâche en cours ?', '={{ $json.active === true }}', true, [480, 0]),
    nCode('Résident ignoré', 'rapport-garde-ignore', [720, 200]),
    nCode("Reprendre l'entrée", 'rapport-garde-reprise', [720, 0]),
    nCode('Paramètres du prompt', 'brique-prompt-parametres', [960, 0], remplPrompts),
    nExec('Chercher', ID.chercher, [1200, 0]),
    nCode('Vers template', 'brique-vers-template', [1440, 0]),
    nExec('Template', ID.template, [1680, 0]),
    nCode('Vers rédiger', 'brique-vers-rediger', [1920, 0]),
    { ...nExec('Rédiger', ID.rediger, [2160, 0]), onError: 'continueRegularOutput' },
    nCode('Résultat du rapport', 'rapport-garde-resultat', [2400, 0]),
    // Avancement : l'interface consulte la tâche pendant que les résidents suivants sont générés. Une tâche annulée entre-temps
    // n'est plus modifiée (le résultat arrivé trop tard est abandonné).
    nPg(
      'Avancer la tâche',
      "UPDATE soins.taches SET fait = fait + 1, heartbeat = now(), resultat = resultat || $2::jsonb WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id",
      '$json.task_id, JSON.stringify([$json.entree])',
      [2640, 0],
    ),
    nCode('Sortie', 'rapport-garde-sortie', [2880, 0]),
  ];
  const c = fusion(
    enchaine(['Entrée'], 'Tâche toujours voulue', 'Tâche en cours ?'),
    sortieSi('Tâche en cours ?', "Reprendre l'entrée", 'Résident ignoré'),
    enchaine(["Reprendre l'entrée"], 'Paramètres du prompt', 'Chercher', 'Vers template', 'Template', 'Vers rédiger', 'Rédiger', 'Résultat du rapport', 'Avancer la tâche', 'Sortie'),
  );
  ecrire('67-brique-rapport-garde.json', workflow(ID.rapportGarde, 'AI-Care – Brique rapport de garde (un résident)', noeuds, c));
}

// ---- 73 : valider le lot d'un étage ---------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-valider-lot', [0, 0]),
    nCode('Corps du lot', 'lot-corps', [240, 0]),
    { ...nExec('Enregistrer', ID.enregistrer, [480, 0], 'each'), onError: 'continueRegularOutput' },
    nCode('Rassembler le lot', 'lot-rassembler', [720, 0]),
    nSi('Des rapports validés ?', '={{ $json.nb_valides > 0 }}', true, [960, 0]),
    { ...nExec('Après validation', ID.apresValidation, [1200, -120]), onError: 'continueRegularOutput' },
    nCode('Réponse du lot', 'lot-reponse', [1440, -120]),
    nCode('Réponse du lot (aucun)', 'lot-reponse', [1200, 140]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Corps du lot', 'Enregistrer', 'Rassembler le lot', 'Des rapports validés ?'),
    sortieSi('Des rapports validés ?', 'Après validation', 'Réponse du lot (aucun)'),
    enchaine(['Après validation'], 'Réponse du lot'),
  );
  ecrire('73-maitre-valider-lot.json', workflow(ID.maitreValiderLot, "AI-Care – Entrée Valider le lot d'un étage", noeuds, c));
}

// ---- 68 : rapport de garde d'un étage COMPLET (sous-workflow) : un SBAR par résident, l'un après l'autre ------------
// Appelé par 74 (clic du soignant) et par 76 (déclenchement automatique de 5h30). La tâche existe déjà (task_id).
{
  const noeuds = [
    entree(),
    nPg("Résidents de l'étage", 'SELECT patient_id FROM soins.residents WHERE etage = $1 ORDER BY chambre', '$json.etage', [240, 0]),
    nCode('Résidents à traiter', 'etage-elements', [480, 0]),
    // un résident après l'autre : le poste ne fait pas tourner deux générations en même temps
    { ...nExec('Rapport de garde', ID.rapportGarde, [720, 0], 'each'), onError: 'continueRegularOutput', alwaysOutputData: true },
    nPg(
      'Terminer la tâche',
      "UPDATE soins.taches SET statut = CASE WHEN jsonb_path_exists(resultat, '$[*].erreur') OR fait < total THEN 'termine_avec_erreurs' ELSE 'termine' END, termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id",
      "$('Entrée').first().json.task_id",
      [960, 0],
    ),
  ];
  const c = enchaine(['Entrée'], "Résidents de l'étage", 'Résidents à traiter', 'Rapport de garde', 'Terminer la tâche');
  ecrire('68-brique-etage-complet.json', workflow(ID.etageComplet, "AI-Care – Brique rapport de garde d'un étage (complet)", noeuds, c));
}

// ---- 74 : rapport de garde d'un étage à la demande (tâche asynchrone) -----------------------------------------
{
  const noeuds = [
    { ...webhookInterface('aicare-etage', [0, 0]), parameters: { httpMethod: 'POST', path: 'aicare-etage', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
    nCode('Contrôler l\'étage', 'etage-controle', [240, 0]),
    nPg("Résidents de l'étage", 'SELECT patient_id FROM soins.residents WHERE etage = $1 ORDER BY chambre', '$json.etage', [480, 0]),
    nPg(
      'Créer la tâche',
      "INSERT INTO soins.taches (type, parametres, total, statut, termine_le) VALUES ('rapport_garde_etage', jsonb_build_object('etage', $1::int), $2::int, CASE WHEN $2::int = 0 THEN 'termine' ELSE 'en_cours' END, CASE WHEN $2::int = 0 THEN now() END) RETURNING id",
      "$('Contrôler l\\'étage').first().json.etage, $('Résidents de l\\'étage').all().filter(i => i.json.patient_id).length",
      [720, 0],
      { alwaysOutputData: false },
    ),
    noeud(
      'Répondre tout de suite',
      'n8n-nodes-base.respondToWebhook',
      1.1,
      { respondWith: 'json', responseBody: "={{ JSON.stringify({ tache_id: $json.id, total: $('Résidents de l\\'étage').all().filter(i => i.json.patient_id).length }) }}", options: {} },
      [960, 0],
    ),
    nCode('Vers étage complet', 'etage-vers-complet', [1200, 0]),
    { ...nExec('Étage complet', ID.etageComplet, [1440, 0]), onError: 'continueRegularOutput' },
  ];
  const c = enchaine(['Webhook'], 'Contrôler l\'étage', "Résidents de l'étage", 'Créer la tâche', 'Répondre tout de suite', 'Vers étage complet', 'Étage complet');
  ecrire('74-maitre-etage.json', workflow(ID.maitreEtage, "AI-Care – Entrée rapport de garde d'un étage (tâche)", noeuds, c));
}

// ---- 75 : avancement d'une tâche, ou dernier rapport d'un étage ------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-tache', [0, 0]),
    nCode('Contrôler la tâche', 'tache-controle', [240, 0]),
    nPg(
      'Lire la tâche',
      "SELECT id, type, statut, total, fait, parametres, cree_le, resultat FROM soins.taches WHERE ($1 <> '' AND id = NULLIF($1, '')::uuid) OR ($1 = '' AND type = 'rapport_garde_etage' AND parametres->>'etage' = $2 AND cree_le > now() - interval '16 hours') ORDER BY cree_le DESC LIMIT 1",
      '$json.tache_id, $json.etage',
      [480, 0],
    ),
    nCode('Réponse', 'tache-reponse', [720, 0]),
  ];
  ecrire('75-maitre-tache.json', workflow(ID.maitreTache, "AI-Care – Avancement d'une tâche", noeuds, enchaine(['Webhook'], 'Contrôler la tâche', 'Lire la tâche', 'Réponse')));
}

// ---- 76 : rapports d'étage AUTOMATIQUES chaque matin à 5h30 (prêts à valider avant la relève) ---------------------
{
  const noeuds = [
    noeud('Planification 5h30', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 30 5 * * *' }] } }, [0, -200]),
    noeud('Démarrage manuel', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 0]),
    // Lancement à la demande (essais) : répond tout de suite, le travail continue ensuite.
    noeud('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'etage-auto', responseMode: 'onReceived', options: {} }, [0, 200], { webhookId: 'aicare-etage-auto' }),
    nPg(
      'Créer les tâches',
      "INSERT INTO soins.taches (type, parametres, total) SELECT 'rapport_garde_etage', jsonb_build_object('etage', r.etage, 'automatique', true), count(*) FROM soins.residents r GROUP BY r.etage HAVING NOT EXISTS (SELECT 1 FROM soins.taches t WHERE t.type = 'rapport_garde_etage' AND t.parametres->>'automatique' = 'true' AND t.parametres->>'etage' = r.etage::text AND t.cree_le > now() - interval '3 hours') RETURNING id, (parametres->>'etage')::int AS etage",
      '',
      [260, 0],
      { alwaysOutputData: true },
    ),
    nCode('Étages à traiter', 'etage-auto-elements', [500, 0]),
    // un étage après l'autre (et dans chaque étage, un résident après l'autre)
    { ...nExec('Étage complet', ID.etageComplet, [740, 0], 'each'), onError: 'continueRegularOutput' },
  ];
  const c = enchaine(['Planification 5h30', 'Démarrage manuel', 'Webhook'], 'Créer les tâches', 'Étages à traiter', 'Étage complet');
  ecrire('76-etage-automatique.json', workflow(ID.etageAuto, "AI-Care – Rapports d'étage automatiques (5h30)", noeuds, c));
}

// =====================================================================================================
// JOUR 4, ÉTAPE 3 – « Vérifier le document » : règles de contrôle TOUT DE SUITE, analyse de l'IA en tâche de fond
// =====================================================================================================
const respondre = (nom, corps, position) =>
  noeud(nom, 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: corps, options: {} }, position);

// ---- 77 : Vérifier le document ---------------------------------------------------------------------------------
{
  const noeuds = [
    { ...webhookInterface('aicare-verifier', [0, 0]), parameters: { httpMethod: 'POST', path: 'aicare-verifier', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
    // appelé par le workflow « courrier » (85) avec la clé INTERNE : mêmes règles, sans session de soignant
    noeud('Webhook (interne)', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'aicare-verifier-interne', responseMode: 'responseNode', options: {} }, [0, 200], { webhookId: 'aicare-verifier-interne' }),
    nCode('Contrôler la demande', 'verif-controle', [240, 0]),
    nPg('Résident de la chambre', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre = $1', '$json.chambre', [480, 0]),
    nCode('Choisir le parcours', 'maitre-choisir-parcours', [720, 0]),
    nCode('Paramètres du prompt (vérification)', 'brique-prompt-parametres', [960, 0], remplPrompts),
    nExec('Chercher (vérification)', ID.chercher, [1200, 0]),
    nCode('Choisir la lettre', 'maitre-choisir-lettre', [1440, 0]),
    nSi('Lettre à vérifier ?', '={{ $json.aucune !== true }}', true, [1680, 0]),

    // pas de lettre : réponse sans brouillon, aucune IA
    nCode('Réponse sans lettre', 'maitre-reponse-sans-lettre', [1920, 300]),
    respondre('Répondre (sans lettre)', '={{ JSON.stringify($json) }}', [2160, 300]),

    // 1. RÈGLES SEULES (code) : le résultat principal, rattaché à un brouillon validable
    nCode('Règles seules', 'maitre-regles-fusion', [1920, 0]),
    nPg(
      'Créer le brouillon de vérification',
      "INSERT INTO soins.brouillons (patient_id, mode, action, consigne, prompt_id, prompt_version, modele, texte_ia, faits, avertissements) VALUES ($1, 'a', 'verifier_document', NULL, 'verifier_document', $2, NULL, $3, $4::jsonb, '[]'::jsonb) RETURNING id",
      "$('Choisir la lettre').first().json.patient.patient_id, $json.prompt_versions, $json.texte, JSON.stringify($('Choisir la lettre').first().json.faits.map(f => ({ id: f.id, label: f.label, texte: f.texte, date: f.date, ref: f.ref })).concat([{ id: 'L1', label: 'KIM (lettre de médecin)', texte: $('Choisir la lettre').first().json.lettre.titre, date: $('Choisir la lettre').first().json.lettre.date, ref: $('Choisir la lettre').first().json.lettre.ref }]))",
      [2160, 0],
      { alwaysOutputData: false },
    ),
    // réglage : l'analyse de l'IA peut être coupée (table soins.reglages, clé verification_ia)
    nPg(
      'Réglage analyse IA',
      "SELECT coalesce((SELECT valeur FROM soins.reglages WHERE cle = 'verification_ia'), 'true'::jsonb) = 'true'::jsonb AS actif",
      '',
      [2400, 0],
    ),
    nSi('Analyse IA activée ?', '={{ $json.actif === true }}', true, [2640, 0]),

    // IA activée : tâche d'analyse, réponse immédiate, puis le travail continue
    nPg(
      "Créer la tâche d'analyse",
      "INSERT INTO soins.taches (type, parametres, total) VALUES ('verification_document', jsonb_build_object('brouillon_id', $1::text, 'patient_id', $2::text), 1) RETURNING id",
      "$('Créer le brouillon de vérification').first().json.id, $('Choisir la lettre').first().json.patient.patient_id",
      [2880, -200],
      { alwaysOutputData: false },
    ),
    nCode('Réponse immédiate', 'verif-reponse-immediate', [3120, -200]),
    respondre('Répondre tout de suite', '={{ JSON.stringify($json.reponse) }}', [3360, -200]),
    nCode('Événement (vérification)', 'maitre-evenement-verification', [3600, -360]),
    nExec('Journal', ID.journal, [3840, -360]),

    // 2. ANALYSE COMPLÉMENTAIRE (IA) en tâche de fond : extraction, comparaison, puis fusion avec les règles
    // Avant chaque étape lourde de l'IA : battement de coeur, et arrêt si la tâche a été annulée ou interrompue.
    nPg(
      'Analyse toujours voulue (extraction)',
      "UPDATE soins.taches SET heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING true AS active",
      "$('Créer la tâche d\\'analyse').first().json.id",
      [3480, -80],
    ),
    nSi('Analyse en cours ? (extraction)', '={{ $json.active === true }}', true, [3600, -240]),
    nPg(
      'Analyse toujours voulue (comparaison)',
      "UPDATE soins.taches SET heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING true AS active",
      "$('Créer la tâche d\\'analyse').first().json.id",
      [4440, -80],
    ),
    nSi('Analyse en cours ? (comparaison)', '={{ $json.active === true }}', true, [4560, -240]),
    nCode('Document à extraire', 'maitre-doc-extraction', [3600, -80]),
    nExec('Template (extraction)', ID.template, [3840, -80]),
    nCode('Vers rédiger (extraction)', 'maitre-vers-rediger-extraction', [4080, -80]),
    ...poursuivre([nExec('Rédiger (extraction)', ID.rediger, [4320, -80])]),
    nCode('Faits pour comparer', 'maitre-faits-comparer', [4560, -80]),
    nExec('Template (comparaison)', ID.template, [4800, -80]),
    nCode('Vers rédiger (comparaison)', 'maitre-vers-rediger-comparaison', [5040, -80]),
    ...poursuivre([nExec('Rédiger (comparaison)', ID.rediger, [5280, -80])]),
    nCode('Règles et fusion', 'maitre-regles-fusion', [5520, -80]),
    nCode('Analyse complémentaire', 'verif-analyse', [5760, -80]),
    nPg(
      "Enregistrer l'analyse",
      "UPDATE soins.taches SET fait = 1, statut = $2, resultat = $3::jsonb, heartbeat = now(), termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id",
      '$json.task_id, $json.statut, JSON.stringify($json.resultat)',
      [6000, -80],
    ),
    nCode('Événement (analyse)', 'verif-evenement-analyse', [6240, -80]),
    nExec('Journal (analyse)', ID.journal, [6480, -80]),

    // IA désactivée : réponse immédiate sans tâche
    nCode('Réponse immédiate (sans IA)', 'verif-reponse-immediate', [2880, 260]),
    respondre('Répondre (sans IA)', '={{ JSON.stringify($json.reponse) }}', [3120, 260]),
    nCode('Événement (sans IA)', 'maitre-evenement-verification', [3360, 260]),
    nExec('Journal (sans IA)', ID.journal, [3600, 260]),
  ];
  const c = fusion(
    enchaine(['Webhook (interne)'], 'Contrôler la demande'),
    enchaine(['Webhook'], 'Contrôler la demande', 'Résident de la chambre', 'Choisir le parcours', 'Paramètres du prompt (vérification)', 'Chercher (vérification)', 'Choisir la lettre', 'Lettre à vérifier ?'),
    sortieSi('Lettre à vérifier ?', 'Règles seules', 'Réponse sans lettre'),
    enchaine(['Réponse sans lettre'], 'Répondre (sans lettre)'),
    enchaine(['Règles seules'], 'Créer le brouillon de vérification', 'Réglage analyse IA', 'Analyse IA activée ?'),
    sortieSi('Analyse IA activée ?', "Créer la tâche d'analyse", 'Réponse immédiate (sans IA)'),
    enchaine(["Créer la tâche d'analyse"], 'Réponse immédiate', 'Répondre tout de suite'),
    enchaine(['Répondre tout de suite'], 'Événement (vérification)', 'Journal'),
    enchaine(
      ['Répondre tout de suite'], 'Analyse toujours voulue (extraction)', 'Analyse en cours ? (extraction)',
    ),
    sortieSiFin('Analyse en cours ? (extraction)', 'Document à extraire'),
    enchaine(
      ['Document à extraire'], 'Template (extraction)', 'Vers rédiger (extraction)', 'Rédiger (extraction)', 'Analyse toujours voulue (comparaison)', 'Analyse en cours ? (comparaison)',
    ),
    sortieSiFin('Analyse en cours ? (comparaison)', 'Faits pour comparer'),
    enchaine(
      ['Faits pour comparer'], 'Template (comparaison)',
      'Vers rédiger (comparaison)', 'Rédiger (comparaison)', 'Règles et fusion', 'Analyse complémentaire', "Enregistrer l'analyse", 'Événement (analyse)', 'Journal (analyse)',
    ),
    enchaine(['Réponse immédiate (sans IA)'], 'Répondre (sans IA)', 'Événement (sans IA)', 'Journal (sans IA)'),
  );
  ecrire('77-maitre-verifier.json', workflow(ID.maitreVerifier, "AI-Care – Entrée Vérifier le document (règles tout de suite, IA en tâche de fond)", noeuds, c));
}

// ---- 78 : réglage de l'analyse complémentaire par l'IA ----------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-reglage', [0, 0]),
    nCode('Contrôler le réglage', 'reglage-controle', [240, 0]),
    nPg(
      'Lire ou écrire',
      "WITH w AS (INSERT INTO soins.reglages (cle, valeur) SELECT $1, to_jsonb(NULLIF($2, '')::boolean) WHERE $2 <> '' ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = now() RETURNING valeur) SELECT coalesce((SELECT valeur FROM w), (SELECT valeur FROM soins.reglages WHERE cle = $1), 'true'::jsonb) AS valeur",
      '$json.cle, $json.valeur',
      [480, 0],
    ),
    nCode('Réponse', 'reglage-reponse', [720, 0]),
  ];
  ecrire('78-maitre-reglage.json', workflow(ID.maitreReglage, "AI-Care – Réglage de l'analyse complémentaire par l'IA", noeuds, enchaine(['Webhook'], 'Contrôler le réglage', 'Lire ou écrire', 'Réponse')));
}

// =====================================================================================================
// JOUR 4, ÉTAPE 4 – tâches de fond fiables : annuler, reprise au démarrage de n8n, veilleur
// =====================================================================================================

// ---- 79 : annuler une tâche -------------------------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-annuler', [0, 0]),
    nCode('Contrôler la tâche', 'tache-annuler-controle', [240, 0]),
    nPg(
      'Annuler',
      "WITH a AS (UPDATE soins.taches SET statut = 'annulee', termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id, type), j AS (INSERT INTO soins.journal_ia (evenement, action, details) SELECT 'tache_annulee', type, jsonb_build_object('tache_id', id) FROM a) SELECT (SELECT count(*) FROM a) > 0 AS annulee, coalesce((SELECT 'annulee' FROM a), (SELECT statut FROM soins.taches WHERE id = $1::uuid), 'inconnue') AS statut",
      '$json.tache_id',
      [480, 0],
    ),
    nCode('Réponse', 'tache-annuler-reponse', [720, 0]),
  ];
  ecrire('79-maitre-annuler.json', workflow(ID.maitreAnnuler, "AI-Care – Annuler une tâche", noeuds, enchaine(['Webhook'], 'Contrôler la tâche', 'Annuler', 'Réponse')));
}

// ---- 80 : reprise au démarrage de n8n + veilleur (tâches sans signe de vie) -------------------------------------
{
  const requete = (cause, condition) =>
    `WITH u AS (UPDATE soins.taches SET statut = 'interrompue', termine_le = now() WHERE statut = 'en_cours'${condition} RETURNING id, type, fait, total), j AS (INSERT INTO soins.journal_ia (evenement, action, details) SELECT 'tache_interrompue', type, jsonb_build_object('tache_id', id, 'cause', '${cause}', 'fait', fait, 'total', total) FROM u) SELECT count(*) AS interrompues FROM u`;
  const noeuds = [
    // au démarrage de n8n, plus aucun travail en cours ne peut exister : toute tâche « en cours » est interrompue
    noeud('Démarrage de n8n', 'n8n-nodes-base.n8nTrigger', 1, { events: ['init'] }, [0, -200]),
    nPg('Reprise au démarrage', requete('redemarrage', ''), '', [260, -200], { alwaysOutputData: true }),
    // veilleur : toutes les 5 minutes, une tâche sans battement de coeur depuis 30 minutes (le délai maximal d'une génération) est interrompue
    noeud('Toutes les 5 minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 */5 * * * *' }] } }, [0, 100]),
    noeud('Démarrage manuel', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 300]),
    nPg('Contextes d\'alarme (démarrage)', "UPDATE soins.alarmes SET contexte = '{\"statut\":\"indisponible\"}'::jsonb WHERE contexte->>'statut' = 'en_cours'", '', [520, -200], { alwaysOutputData: true }),
    nPg('Contextes d\'alarme (veilleur)', "UPDATE soins.alarmes SET contexte = '{\"statut\":\"indisponible\"}'::jsonb WHERE contexte->>'statut' = 'en_cours' AND recue_le < now() - interval '15 minutes'", '', [520, 200], { alwaysOutputData: true }),
    nPg('Tâches sans signe de vie', requete('sans_signe_de_vie', " AND heartbeat < now() - interval '30 minutes'"), '', [260, 200], { alwaysOutputData: true }),
  ];
  const c = fusion(enchaine(['Démarrage de n8n'], 'Reprise au démarrage', 'Contextes d\'alarme (démarrage)'), enchaine(['Toutes les 5 minutes', 'Démarrage manuel'], 'Tâches sans signe de vie', 'Contextes d\'alarme (veilleur)'));
  ecrire('80-reprise-taches.json', workflow(ID.repriseTaches, 'AI-Care – Reprise des tâches (démarrage de n8n et veilleur)', noeuds, c));
}

// =====================================================================================================
// JOUR 4, ÉTAPE 5 – Exemple 2 : alarmes de capteurs (MQTT). Bandeau rouge IMMÉDIAT avec des faits codés,
// le contexte de l'assistant IA s'ajoute ensuite.
// =====================================================================================================
const CRED_MQTT = { mqtt: { id: 'aicaremqtt0000001', name: 'AI-Care MQTT' } };
const CRED_TTN = { mqtt: { id: 'aicarettn00000001', name: 'AI-Care TTN' } };

// ---- 81 : alarme de capteur ---------------------------------------------------------------------------------
{
  const noeuds = [
    // sujets capteurs/chambre{n}/{type} ; le contenu du message n'est jamais lu (voir alarme-controle.js)
    noeud('Alarme MQTT', 'n8n-nodes-base.mqttTrigger', 1, { topics: 'capteurs/+/+', options: {} }, [0, 0], { credentials: CRED_MQTT }),
    // TTN (The Things Stack) : second point d'entrée, désactivé tant que TTN_APPLICATION et TTN_CLE_API ne sont pas dans .env
    // (l'importeur le configure, crée le credential et l'active) ; les messages sont traduits en sujet capteurs/chambre{n}/{type}
    noeud('Alarme TTN', 'n8n-nodes-base.mqttTrigger', 1, { topics: 'v3/TTN_APPLICATION/devices/+/up', options: { jsonParseBody: true } }, [0, 200], { credentials: CRED_TTN, disabled: true }),
    nCode('Traduire (TTN)', 'alarme-ttn', [120, 200]),
    nCode("Contrôler l'alarme", 'alarme-controle', [240, 0]),
    nSi('Sujet valide ?', '={{ $json.rejete === false }}', true, [480, 0]),

    // sujet inconnu : aucune alarme, trace au journal (sujet nettoyé, jamais le contenu)
    nCode('Événement (sujet rejeté)', 'alarme-evenement-rejet', [720, 260]),
    nExec('Journal (rejet)', ID.journal, [960, 260]),

    // 1. FAITS CODÉS : résident, risques, allergies, médication à risque (aucune IA) -> alarme enregistrée = affichable
    nPg(
      'Résident de la chambre',
      "SELECT r.patient_id, r.civilite, r.prenom, r.nom, r.chambre, r.etage, r.risques, r.allergies, r.diagnostics, coalesce((SELECT jsonb_agg(jsonb_build_object('medicament', m.medicament, 'dosage', m.dosage)) FROM soins.plan_medication m WHERE m.patient_id = r.patient_id AND m.actif), '[]'::jsonb) AS medication FROM soins.residents r WHERE r.chambre = $1",
      "$json.chambre",
      [720, 0],
    ),
    nCode('Faits codés', 'alarme-faits-codes', [960, 0]),
    nPg(
      "Créer l'alarme",
      "INSERT INTO soins.alarmes (topic, chambre, type, libelle, patient_id, faits, contexte) SELECT $1, $2, $3, $4, NULLIF($5, ''), $6::jsonb, CASE WHEN NULLIF($5, '') IS NULL THEN '{\"statut\":\"aucun\"}'::jsonb WHEN EXISTS (SELECT 1 FROM soins.alarmes a WHERE a.contexte->>'statut' = 'en_cours' AND a.recue_le > now() - interval '10 minutes') THEN '{\"statut\":\"differe\"}'::jsonb ELSE '{\"statut\":\"en_cours\"}'::jsonb END WHERE NOT EXISTS (SELECT 1 FROM soins.alarmes a WHERE a.chambre = $2 AND a.type = $3 AND a.recue_le > now() - interval '60 seconds') RETURNING id, recue_le, chambre, type, libelle, patient_id, contexte->>'statut' AS contexte_statut",
      "$json.topic, $json.chambre, $json.type, $json.libelle, $json.patient_id ?? '', JSON.stringify($json.faits)",
      [1200, 0],
      { alwaysOutputData: false },
    ),

    // 1 bis. MISE À JOUR DE L'INDEX DU RAG : l'alarme enregistrée est ajoutée à Qdrant (collection patients, source « Capteurs »).
    // Un embedding seulement (pas de génération) ; une erreur d'indexation n'arrête pas l'alarme ni son contexte.
    nCode('Document RAG (alarme)', 'alarme-document-rag', [1320, 0]),
    { ...nExec('Indexer (alarme)', ID.indexeur, [1380, 0]), onError: 'continueRegularOutput' },
    nCode('Alarme enregistrée', 'alarme-enregistree', [1440, 120]),

    // 2. CONTEXTE de l'assistant IA, ensuite (une seule génération à la fois ; pas de génération si le résident est inconnu)
    nSi('Contexte à générer ?', "={{ $json.contexte_statut === 'en_cours' }}", true, [1440, 0]),
    nCode('Entrée de chercher (alarme)', 'alarme-entree-chercher', [1680, 0]),
    nCode('Paramètres du prompt', 'brique-prompt-parametres', [1920, 0], remplPrompts),
    nExec('Chercher', ID.chercher, [2160, 0]),
    nCode("Ajouter l'alarme aux faits", 'alarme-ajouter-fait', [2400, 0]),
    nExec('Template', ID.template, [2640, 0]),
    nCode('Vers rédiger (alarme)', 'alarme-vers-rediger', [2880, 0]),
    { ...nExec('Rédiger', ID.rediger, [3120, 0]), onError: 'continueRegularOutput' },
    nCode('Contexte prêt', 'alarme-contexte', [3360, 0]),
    nPg('Enregistrer le contexte', 'UPDATE soins.alarmes SET contexte = $2::jsonb WHERE id = $1::uuid RETURNING id', '$json.id, JSON.stringify($json.contexte)', [3600, 0]),
  ];
  const c = fusion(
    enchaine(['Alarme MQTT'], "Contrôler l'alarme", 'Sujet valide ?'),
    enchaine(['Alarme TTN'], 'Traduire (TTN)', "Contrôler l'alarme"),
    sortieSi('Sujet valide ?', 'Résident de la chambre', 'Événement (sujet rejeté)'),
    enchaine(['Événement (sujet rejeté)'], 'Journal (rejet)'),
    enchaine(['Résident de la chambre'], 'Faits codés', "Créer l'alarme", 'Document RAG (alarme)', 'Indexer (alarme)', 'Alarme enregistrée', 'Contexte à générer ?'),
    sortieSiFin('Contexte à générer ?', 'Entrée de chercher (alarme)'),
    enchaine(
      ['Entrée de chercher (alarme)'], 'Paramètres du prompt', 'Chercher', "Ajouter l'alarme aux faits", 'Template', 'Vers rédiger (alarme)', 'Rédiger', 'Contexte prêt', 'Enregistrer le contexte',
    ),
  );
  ecrire('81-alarme-capteur.json', workflow(ID.alarmeCapteur, "AI-Care – Alarme de capteur (MQTT)", noeuds, c));
}

// ---- 82 : alarmes affichées par l'interface ----------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-alarmes', [0, 0]),
    nCode('Contrôler la demande', 'alarmes-controle', [240, 0]),
    nPg(
      'Lire les alarmes',
      "WITH a AS (UPDATE soins.alarmes SET statut = 'acquittee', acquittee_le = now() WHERE $1 <> '' AND id = NULLIF($1, '')::uuid AND statut = 'nouvelle' RETURNING id) SELECT id, recue_le, chambre, type, libelle, faits, contexte, statut, acquittee_le FROM soins.alarmes WHERE ((statut = 'nouvelle' AND recue_le > now() - interval '12 hours') OR ($2 = 'true' AND recue_le > now() - interval '24 hours')) AND id NOT IN (SELECT id FROM a) UNION ALL SELECT id, recue_le, chambre, type, libelle, faits, contexte, 'acquittee', acquittee_le FROM soins.alarmes WHERE id IN (SELECT id FROM a) AND $2 = 'true' ORDER BY recue_le DESC LIMIT 40",
      '$json.acquitter, $json.historique',
      [480, 0],
    ),
    nCode('Réponse', 'alarmes-reponse', [720, 0]),
  ];
  ecrire('82-maitre-alarmes.json', workflow(ID.maitreAlarmes, "AI-Care – Alarmes affichées (liste et acquittement)", noeuds, enchaine(['Webhook'], 'Contrôler la demande', 'Lire les alarmes', 'Réponse')));
}

// =====================================================================================================
// JOUR 4, ÉTAPE 6 – Exemple 3 : documents en automatique (courrier reçu, nouveautés ePA, validation -> RAG)
// =====================================================================================================

// ---- 85 : traitement d'UN courrier (sous-workflow) : lecture, OCR, identification, règles de contrôle, alerte ------------
{
  const residents = `SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre FROM soins.residents`;
  const get = (name, url, position, extra = {}) => noeud(name, 'n8n-nodes-base.httpRequest', 4.2, { url, options: { timeout: 120000, ...extra } }, position);
  const noeuds = [
    entree(),
    // verrou : le courrier n'est pris que s'il est libre (jamais vu, ou « en cours » depuis plus de 15 minutes après un échec) ; sinon, rien
    nPg(
      'Prendre le courrier',
      "INSERT INTO soins.courriers_traites (message_id, etat) VALUES ($1, 'en_cours') ON CONFLICT (message_id) DO UPDATE SET debut = now() WHERE soins.courriers_traites.etat = 'en_cours' AND soins.courriers_traites.debut < now() - interval '15 minutes' RETURNING message_id",
      "$json.id",
      [0, 160],
    ),
    nSi('Courrier libre ?', '={{ !!$json.message_id }}', true, [120, 160]),
    nPostgres('Résidents', residents, [240, 0], true),
    get('Détail du message', "=http://mailpit:8025/api/v1/message/{{ $('Entrée').first().json.id }}", [480, 0]),
    // sans pièce jointe PDF (ex. un message de transmission) : « Pièces jointes » ne renvoie rien et le workflow s'arrête là
    nCode('Pièces jointes', 'kim-pieces', [720, 0]),
    get('Télécharger la pièce jointe', '=http://mailpit:8025/api/v1/message/{{ $json.id }}/part/{{ $json.partId }}', [960, 0], {
      response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
    }),
    nOcr('Texte du PDF (OCRmyPDF)', [1200, 0]),
    { ...nCode('Documents KIM', 'kim-docs', [1440, 0]), alwaysOutputData: true },
    nIndexer([1680, 0]),
    nCode('Courriers à traiter', 'courrier-a-traiter', [1920, 0]),
    nSi('Courrier identifié ?', '={{ !!$json.patient_id }}', true, [2160, 0]),

    // identifié : les règles de contrôle (sans IA) répondent tout de suite, l'analyse de l'IA suit en tâche de fond (workflow 77)
    {
      ...nHttp(
        'Vérifier le courrier',
        {
          method: 'POST',
          url: 'http://localhost:5678/webhook/aicare-verifier-interne',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          jsonBody: '={{ JSON.stringify({ chambre: $json.chambre, ref: $json.source_ref }) }}',
          options: { timeout: 180000 },
        },
        [2400, -160],
      ),
      credentials: CRED_INTERNE,
      onError: 'continueRegularOutput',
    },
    nCode('Alerte (courrier identifié)', 'courrier-alerte-identifie', [2640, -160]),

    // non identifié : jamais deviné, alerte « courrier non identifié »
    nCode('Alerte (courrier non identifié)', 'courrier-alerte-inconnu', [2400, 200]),

    nPg(
      'Créer les alertes',
      "WITH ins AS (INSERT INTO soins.alarmes (topic, chambre, type, libelle, patient_id, faits, contexte) SELECT x.topic, x.chambre, 'document', x.libelle, NULLIF(x.patient_id, ''), x.faits, '{\"statut\":\"aucun\"}'::jsonb FROM jsonb_to_recordset($1::jsonb) AS x(topic text, chambre text, libelle text, patient_id text, faits jsonb) ON CONFLICT (topic) WHERE type = 'document' DO NOTHING RETURNING id, topic, patient_id, libelle), j AS (INSERT INTO soins.journal_ia (evenement, patient_id, action, details) SELECT 'courrier_recu', patient_id, 'verifier_document', jsonb_build_object('alarme_id', id, 'courrier', topic, 'alerte', libelle) FROM ins) SELECT count(*) AS alertes_creees FROM ins",
      'JSON.stringify($json.alertes)',
      [2880, 0],
    ),
    // le message est noté comme traité : le rattrapage planifié ne le reprendra pas
    nPg(
      'Marquer le courrier traité',
      "UPDATE soins.courriers_traites SET etat = 'traite', traite_le = now() WHERE message_id = $1",
      "$('Entrée').first().json.id",
      [3120, 0],
    ),
  ];
  const c = fusion(
    enchaine(['Entrée'], 'Prendre le courrier', 'Courrier libre ?'),
    { 'Courrier libre ?': { main: [[{ node: 'Résidents', type: 'main', index: 0 }], []] } },
    enchaine(['Résidents'], 'Détail du message', 'Pièces jointes', 'Télécharger la pièce jointe', 'Texte du PDF (OCRmyPDF)', 'Documents KIM', 'Indexer', 'Courriers à traiter', 'Courrier identifié ?'),
    sortieSi('Courrier identifié ?', 'Vérifier le courrier', 'Alerte (courrier non identifié)'),
    enchaine(['Vérifier le courrier'], 'Alerte (courrier identifié)', 'Créer les alertes', 'Marquer le courrier traité'),
    enchaine(['Alerte (courrier non identifié)'], 'Créer les alertes'),
  );
  ecrire('85-brique-courrier.json', workflow(ID.courrierTraiter, "AI-Care – Brique courrier (un message : OCR, identification, règles, alerte)", noeuds, c));
}

// ---- 83 : courrier reçu (Mailpit prévient n8n par webhook ; Mailpit n'a pas d'IMAP) ------------------------------
{
  const noeuds = [
    noeud('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'courrier-recu', responseMode: 'onReceived', options: {} }, [0, 0], { webhookId: 'aicare-courrier-recu' }),
    nCode('Contrôler le courrier', 'courrier-controle', [240, 0]),
    { ...nExec('Traiter le courrier', ID.courrierTraiter, [480, 0]), onError: 'continueRegularOutput' },
  ];
  ecrire('83-courrier-automatique.json', workflow(ID.courrierAuto, 'AI-Care – Courrier reçu (notification de Mailpit)', noeuds, enchaine(['Webhook'], 'Contrôler le courrier', 'Traiter le courrier')));
}

// ---- 86 : rattrapage des courriers (notification perdue, n8n arrêté à l'arrivée du courrier) ----------------------
{
  const noeuds = [
    noeud('Toutes les 2 minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 */2 * * * *' }] } }, [0, -100]),
    noeud('Démarrage manuel', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 100]),
    nPostgres('Courriers déjà traités', "SELECT message_id FROM soins.courriers_traites WHERE etat = 'traite' OR debut > now() - interval '15 minutes'", [260, 0], true),
    noeud('Messages récents', 'n8n-nodes-base.httpRequest', 4.2, { url: 'http://mailpit:8025/api/v1/messages?limit=50', options: { timeout: 60000 } }, [500, 0]),
    nCode('Courriers à rattraper', 'courrier-a-rattraper', [740, 0]),
    // un courrier après l'autre
    { ...nExec('Traiter le courrier', ID.courrierTraiter, [980, 0], 'each'), onError: 'continueRegularOutput' },
  ];
  const c = enchaine(['Toutes les 2 minutes', 'Démarrage manuel'], 'Courriers déjà traités', 'Messages récents', 'Courriers à rattraper', 'Traiter le courrier');
  ecrire('86-courrier-rattrapage.json', workflow(ID.courrierRattrapage, 'AI-Care – Rattrapage des courriers (toutes les 2 minutes)', noeuds, c));
}

// ---- 84 : lettre validée -> RAG (appelé après la validation d'un rapport « Vérifier le document ») ------------------
{
  const noeuds = [
    entree(),
    nPg(
      'Lettre de la validation',
      "SELECT v.id AS validation_id, v.patient_id, b.id AS brouillon_id, (SELECT f->>'ref' FROM jsonb_array_elements(b.faits) f WHERE f->>'id' = 'L1') AS lettre_ref, (b.texte_ia LIKE '%Aucune contradiction détectée%') AS sans_contradiction FROM soins.validations v JOIN soins.brouillons b ON b.id = v.brouillon_id WHERE v.id = $1::bigint AND v.action = 'verifier_document'",
      '$json.validation_id',
      [240, 0],
    ),
    nCode('Décider', 'lettre-decider', [480, 0]),
    nSi('Ajouter la lettre ?', '={{ $json.ajouter === true }}', true, [720, 0]),
    nHttp(
      'Lire la lettre (a_verifier)',
      {
        method: 'POST',
        url: 'http://qdrant:6333/collections/a_verifier/points/scroll',
        jsonBody: "={{ JSON.stringify({ limit: 50, with_payload: true, with_vector: false, filter: { must: [{ key: 'source_ref', match: { value: $json.lettre_ref } }] } }) }}",
        options: { timeout: 60000 },
      },
      [960, -120],
    ),
    nCode('Reconstituer la lettre', 'lettre-reconstituer', [1200, -120]),
    nExec('Indexer (lettre validée)', ID.indexeur, [1440, -120]),
    nHttp(
      'Marquer la lettre validée',
      {
        method: 'POST',
        url: 'http://qdrant:6333/collections/a_verifier/points/payload?wait=true',
        jsonBody: "={{ JSON.stringify({ payload: { statut: 'valide' }, filter: { must: [{ key: 'source_ref', match: { value: $('Décider').first().json.lettre_ref } }] } }) }}",
        options: { timeout: 60000 },
      },
      [1680, -120],
    ),
    nCode('Résultat', 'lettre-resultat', [1920, 0]),
    nCode('Événement', 'lettre-evenement', [2160, 0]),
    nExec('Journal', ID.journal, [2400, 0]),
    nCode('Sortie', 'lettre-sortie', [2640, 0]),
  ];
  const c = fusion(
    enchaine(['Entrée'], 'Lettre de la validation', 'Décider', 'Ajouter la lettre ?'),
    sortieSi('Ajouter la lettre ?', 'Lire la lettre (a_verifier)', 'Résultat'),
    enchaine(['Lire la lettre (a_verifier)'], 'Reconstituer la lettre', 'Indexer (lettre validée)', 'Marquer la lettre validée', 'Résultat', 'Événement', 'Journal', 'Sortie'),
  );
  ecrire('84-brique-lettre-validee.json', workflow(ID.lettreValidee, 'AI-Care – Brique lettre validée (ajout au RAG)', noeuds, c));
}

// =====================================================================================================
// JOUR 4, ÉTAPE 7 – connexion du soignant (identifiant + code PIN) et session
// =====================================================================================================
// ---- 88 : connexion : PIN vérifié (scrypt), verrouillage après 5 échecs en 5 minutes, jeton de session de 12 heures ----
{
  const noeuds = [
    webhookInterface('aicare-connexion', [0, 0]),
    nCode('Contrôler la connexion', 'connexion-controle', [240, 0]),
    nPg(
      'Soignant',
      "SELECT g.identifiant, g.nom, g.pin_hash, g.actif, (SELECT count(*) FROM soins.connexions_echecs e WHERE e.identifiant = $1 AND e.le > now() - interval '5 minutes') >= 5 AS verrouille FROM soins.soignants g WHERE g.identifiant = $1",
      '$json.identifiant',
      [480, 0],
    ),
    nCode('Vérifier le PIN', 'connexion-verifier', [720, 0]),
    nSi('PIN accepté ?', '={{ $json.autorise === true }}', true, [960, 0]),
    nCode('Créer le jeton', 'connexion-jeton', [1200, -120]),
    nPg(
      'Ouvrir la session',
      'WITH menage AS (DELETE FROM soins.sessions WHERE expire_le < now()), remise AS (DELETE FROM soins.connexions_echecs WHERE identifiant = $2) INSERT INTO soins.sessions (jeton_hash, identifiant) VALUES ($1, $2) RETURNING expire_le',
      '$json.hash, $json.identifiant',
      [1440, -120],
      { alwaysOutputData: false },
    ),
    nCode('Réponse connexion', 'connexion-reponse', [1680, -120]),
    // seuls les comptes qui existent sont comptés : la table ne grossit pas avec des identifiants inventés
    nPg(
      "Noter l'échec",
      "INSERT INTO soins.connexions_echecs (identifiant) SELECT $1 WHERE $2 NOT IN ('verrouille', 'format') AND EXISTS (SELECT 1 FROM soins.soignants WHERE identifiant = $1) RETURNING id",
      '$json.identifiant, $json.motif',
      [1200, 160],
    ),
    nCode('Refus de connexion', 'connexion-refus', [1440, 160]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Contrôler la connexion', 'Soignant', 'Vérifier le PIN', 'PIN accepté ?'),
    sortieSi('PIN accepté ?', 'Créer le jeton', "Noter l'échec"),
    enchaine(['Créer le jeton'], 'Ouvrir la session', 'Réponse connexion'),
    enchaine(["Noter l'échec"], 'Refus de connexion'),
  );
  ecrire('88-connexion.json', workflow(ID.connexion, 'AI-Care – Connexion du soignant (identifiant et PIN)', noeuds, c));
}

// ---- 89 : « qui suis-je » (au rechargement de la page) et déconnexion ----------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-moi', [0, 0]),
    nSi('Déconnexion ?', '={{ $json.body?.deconnexion === true }}', true, [240, 0]),
    nPg('Fermer la session', 'DELETE FROM soins.sessions WHERE jeton_hash = $1 RETURNING identifiant', "$('Session').first().json.jeton_hash", [480, -120]),
    noeud('Réponse déconnexion', 'n8n-nodes-base.code', 2, { jsCode: 'return [{ json: { ok: true } }];\n' }, [720, -120]),
    nCode('Réponse moi', 'moi-reponse', [480, 120]),
  ];
  const c = fusion(enchaine(['Webhook'], 'Déconnexion ?'), sortieSi('Déconnexion ?', 'Fermer la session', 'Réponse moi'), enchaine(['Fermer la session'], 'Réponse déconnexion'));
  ecrire('89-session.json', workflow(ID.moi, 'AI-Care – Session (qui suis-je, déconnexion)', noeuds, c));
}

// =====================================================================================================
// COTISATIONS RETRAITE des aidants familiaux (page « Cotisations retraite », données FICTIVES) : agent en tâche de fond
// =====================================================================================================
// Le moteur de règles (workflows/code/sgb6/regles.js) est recopié TEL QUEL dans chaque nœud qui s'en sert (un nœud Code de n8n ne peut pas
// importer de fichier) : « import » remplacé par les valeurs légales, « export » retiré. Rien d'autre n'est modifié ; tests/sgb6-n8n.test.mjs le vérifie.
// Les identifiants de nœuds de cette section partent de 9000 : les workflows existants gardent exactement les leurs (pas de bruit dans git).
const compteurAvantSgb6 = compteur;
compteur = 9000;
const moteurSgb6 = () =>
  readFileSync(join(racine, 'code', 'sgb6', 'regles.js'), 'utf8')
    .replace(/\r/g, '')
    .replace(/^import valeursJson .*$/m, `const valeursJson = ${readFileSync(join(racine, '..', 'data', 'sgb6', 'valeurs-legales.json'), 'utf8').replace(/\r/g, '').trim()};`)
    .replace(/^export /gm, '');
const CAISSE_SGB6 = JSON.stringify(JSON.parse(readFileSync(join(racine, '..', 'data', 'sgb6', 'caisse.json'), 'utf8')));
const nCodeSgb6 = (name, fichier, position) =>
  noeud(name, 'n8n-nodes-base.code', 2, { jsCode: `${moteurSgb6()}\n// ---- nœud « ${name} » (${fichier}.js) ----\n${code(fichier, { __CAISSE__: CAISSE_SGB6, __MODELE__: JSON.stringify(MODELE), __THREADS__: String(THREADS), __SGB6_MODELE__: JSON.stringify(SGB6_MODELE) })}` }, position);
const reponseJson = (nom, position, expression = '$json') =>
  noeud(nom, 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: `={{ JSON.stringify(${expression}) }}`, options: {} }, position);
const webhookReponse = (chemin) => ({ ...webhookInterface(chemin, [0, 0]), parameters: { httpMethod: 'POST', path: chemin, responseMode: 'responseNode', options: { allowedOrigins: '*' } } });
Object.assign(ID, {
  sgb6Lister: 'aicaresgb6lister01',
  sgb6Deposer: 'aicaresgb6deposer1',
  sgb6Lancer: 'aicaresgb6lancer01',
  sgb6Agent: 'aicaresgb6agent001',
  sgb6Tache: 'aicaresgb6tache001',
  sgb6Dossier: 'aicaresgb6dossier1',
  sgb6Decider: 'aicaresgb6decider1',
  sgb6Tour: 'aicaresgb6tour0001',
});
// Modèle local qui PILOTE l'agent des cotisations : variable d'environnement SGB6_MODELE à la génération. Défaut provisoire : qwen2.5:7b (0 refus de la garde contre 1 pour qwen3:8b au premier essai) ; le comparatif
// (tests/sgb6-modeles.mjs, docs/cotisations.md) dit ce que valent les autres. Le modèle se règle aussi dans la page, à chaque lancement.
const SGB6_MODELE = process.env.SGB6_MODELE || 'qwen2.5:7b';
// Modèles que la PAGE peut choisir (liste fermée : le nom envoyé par l'interface est contrôlé contre elle) ; SGB6_MODELES pour la changer à la génération.
const SGB6_MODELES = (process.env.SGB6_MODELES || 'qwen2.5:7b,qwen3:8b,llama3.1:8b,llama3.2').split(',').map((m) => m.trim()).filter(Boolean);
const moteurAgentSgb6 = () =>
  `${moteurSgb6()}\n${readFileSync(join(racine, 'code', 'sgb6', 'agent.js'), 'utf8').replace(/\r/g, '').replace(/^import \{[\s\S]*?\} from '\.\/regles\.js';\n/m, '').replace(/^export /gm, '')}`;
const remplSgb6 = { __CAISSE__: CAISSE_SGB6, __MODELE__: JSON.stringify(MODELE), __THREADS__: String(THREADS), __SGB6_MODELE__: JSON.stringify(SGB6_MODELE), __SGB6_MODELES__: JSON.stringify(SGB6_MODELES) };
// nœud Code avec le moteur de règles ET l'agent piloté (garde, outils, tour de modèle)
const nCodeAgent = (name, fichier, position) =>
  noeud(name, 'n8n-nodes-base.code', 2, { jsCode: `${moteurAgentSgb6()}\n// ---- nœud « ${name} » (${fichier}.js) ----\n${code(fichier, remplSgb6)}` }, position);
// nœud Code simple (sans moteur) avec les constantes du pilote
const nCodeSimple = (name, fichier, position, remplacements = {}) => noeud(name, 'n8n-nodes-base.code', 2, { jsCode: code(fichier, { ...remplSgb6, ...remplacements }) }, position);
const ETAPES_SGB6 = "['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration']";

// ---- 90 : aicare-sgb6-lister : les dossiers et leur statut -------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-lister', [0, 0]),
    nPg('Dossiers', "SELECT id, aidant, personne, statut, revue, to_char(recu_le, 'YYYY-MM-DD') AS recu_le, (resultat IS NOT NULL) AS traite FROM soins.sgb6_dossiers ORDER BY recu_le, id", '', [240, 0], { alwaysOutputData: true }),
    { ...nHttpGet('Modèles installés (Ollama)', [360, 0]), parameters: { method: 'GET', url: 'http://host.docker.internal:11434/api/tags', options: { timeout: 8000 } }, executeOnce: true, onError: 'continueRegularOutput' },
    nCodeSimple('Liste', 'sgb6-lister', [480, 0]),
  ];
  ecrire('90-sgb6-lister.json', workflow(ID.sgb6Lister, 'AI-Care – Cotisations : lister les dossiers', noeuds, enchaine(['Webhook'], 'Dossiers', 'Modèles installés (Ollama)', 'Liste')));
}

// ---- 91 : aicare-sgb6-deposer : dépôt d'un questionnaire (.txt, ou PDF avec du texte), 1 Mo au plus ----------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-deposer', [0, 0]),
    nCode('Contrôler le dépôt', 'sgb6-deposer-controle', [240, 0]),
    nSi('Dépôt accepté ?', '={{ $json.refus === undefined }}', true, [480, 0]),
    nSi('Est un PDF ?', '={{ $json.pdf === true }}', true, [720, -120]),
    { ...nOcr('Lire le PDF (service OCR)', [960, -240]), onError: 'continueRegularOutput' },
    nCode('Texte du PDF', 'sgb6-deposer-pdf', [1200, -240]),
    noeud('Texte du fichier', 'n8n-nodes-base.code', 2, { jsCode: "const e = $input.first().json;\nreturn [{ json: { nom: e.nom, texte: e.texte } }];\n" }, [960, 0]),
    nCodeSgb6('Questionnaire reconnu ?', 'sgb6-deposer-valider', [1440, -120]),
    nSi('Dépôt valide ?', '={{ $json.refus === undefined }}', true, [1680, -120]),
    nPg(
      'Enregistrer le dépôt',
      "WITH d AS (INSERT INTO soins.sgb6_dossiers (id, questionnaire, aidant, personne, recu_le) VALUES ($1, $2, $3, $4, $5::date) RETURNING id) INSERT INTO soins.sgb6_journal (dossier_id, etape, outil, resultat, choisi_par, soignant) SELECT id, 'depot', 'deposer', 'questionnaire déposé', 'humain', $6 FROM d RETURNING dossier_id AS id",
      "$json.id, $json.texte, $json.aidant, $json.personne, $json.recu_le, $('Session').first().json.soignant.identifiant",
      [1920, -240],
    ),
    nCode('Réponse', 'sgb6-deposer-reponse', [2160, 0]),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Webhook'], 'Contrôler le dépôt', 'Dépôt accepté ?'),
    { 'Dépôt accepté ?': { main: [[vers('Est un PDF ?')], [vers('Réponse')]] } },
    { 'Est un PDF ?': { main: [[vers('Lire le PDF (service OCR)')], [vers('Texte du fichier')]] } },
    enchaine(['Lire le PDF (service OCR)'], 'Texte du PDF', 'Questionnaire reconnu ?'),
    { 'Texte du fichier': { main: [[vers('Questionnaire reconnu ?')]] } },
    enchaine(['Questionnaire reconnu ?'], 'Dépôt valide ?'),
    { 'Dépôt valide ?': { main: [[vers('Enregistrer le dépôt')], [vers('Réponse')]] } },
    enchaine(['Enregistrer le dépôt'], 'Réponse'),
  );
  ecrire('91-sgb6-deposer.json', workflow(ID.sgb6Deposer, 'AI-Care – Cotisations : déposer un questionnaire', noeuds, c));
}

// ---- 93 : l'AGENT (sous-workflow, tâche de fond) : lire, extraire, contrôler, caisse, règles, calcul, déclaration ----------
// Un battement de coeur et une ligne de journal à chaque étape ; une tâche annulée ou interrompue n'est jamais réécrite par un résultat tardif.
// L'IA (facultative) ne fait que recopier les champs : le contrôle, les règles et le calcul sont du code (regles.js).
{
  const ETAPE =
    "WITH j AS (INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, duree_ms, choisi_par, soignant) VALUES ($1, $2::uuid, $3, $4, $5, $6::int, 'agent', $7)), t AS (UPDATE soins.taches SET fait = $8::int, heartbeat = now() WHERE id = $2::uuid AND statut = 'en_cours' RETURNING statut) SELECT coalesce((SELECT statut FROM t), (SELECT statut FROM soins.taches WHERE id = $2::uuid)) AS statut";
  const valeursEtape = "$('Entrée').first().json.dossier_id, $('Entrée').first().json.task_id, $json.journal.etape, $json.journal.outil, $json.journal.resultat, String($json.journal.duree_ms), $('Entrée').first().json.soignant, $json.fait";
  const actif = (nom, position) => nSi(nom, "={{ $json.statut === 'en_cours' }}", true, position);
  const MAX_TOURS = 12;
  // journal d'un tour : outil choisi, raison (épurée par le code), accepté ou refusé par la garde, durée ; choisi_par = 'modele'
  const TOUR =
    "WITH j AS (INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, raison, accepte, duree_ms, choisi_par, soignant) VALUES ($1, $2::uuid, 'tour', $3, $4, $5, $6::boolean, $7::int, 'modele', $8)), t AS (UPDATE soins.taches SET fait = $9::int, heartbeat = now() WHERE id = $2::uuid AND statut = 'en_cours' RETURNING statut) SELECT coalesce((SELECT statut FROM t), (SELECT statut FROM soins.taches WHERE id = $2::uuid)) AS statut, $10::jsonb AS sess";
  const valeursTour = "$('Entrée').first().json.dossier_id, $('Entrée').first().json.task_id, $json.ligne.outil, $json.ligne.resultat, $json.ligne.raison, String($json.ligne.accepte), String($json.ligne.duree_ms), $('Entrée').first().json.soignant, $json.sess.tours, JSON.stringify($json.sess)";
  // corps de la requête /api/chat : même contenu que requeteChat() de agent.js (outils, température 0, num_ctx 8192, keep_alive 30m), messages pris dans la session
  const gabarit = requeteChat(nouvelleSession({ dossier_id: 'x', texte: '', annee: 2026, modele: SGB6_MODELE }));
  const corpsChat = `={{ JSON.stringify({ model: $json.sess.modele, messages: $json.sess.messages, tools: ${JSON.stringify(OUTILS, null, 1)}, stream: false, keep_alive: '30m', ...(/^qwen3/i.test($json.sess.modele) ? { think: false } : {}), options: { temperature: 0, num_ctx: ${gabarit.options.num_ctx}, num_predict: ${gabarit.options.num_predict}, seed: ${gabarit.options.seed} } }) }}`;
  const noeuds = [
    entree(),
    nPg('Dossier', 'SELECT id, questionnaire FROM soins.sgb6_dossiers WHERE id = $1', '$json.dossier_id', [240, 0]),
    nSi('Pilotage par le modèle ?', "={{ $('Entrée').first().json.pilote === 'modele' }}", true, [360, 0]),
    // ---- pilotage par le modèle : MAX_TOURS tours déroulés (pas de boucle : l'état circule d'un nœud à l'autre, un nom unique par tour) ----
    nCodeAgent('Démarrer le pilotage', 'sgb6-agent-pilote-demarrer', [480, 600]),
    ...Array.from({ length: MAX_TOURS }, (_, i) => i + 1).flatMap((k) => [
      nCodeSimple(`Tour ${k} : préparer`, 'sgb6-agent-pilote-preparer', [720 + (k - 1) * 1200, 600]),
      { ...nHttp(`Pilote SGB VI (tour ${k})`, { method: 'POST', url: 'http://host.docker.internal:11434/api/chat', jsonBody: corpsChat, options: { timeout: 300000 } }, [960 + (k - 1) * 1200, 600]), onError: 'continueRegularOutput' }, // 5 minutes au plus par réponse
      nCodeSimple(`Tour ${k} : fusion`, 'sgb6-agent-pilote-fusion', [1200 + (k - 1) * 1200, 600], { __PREPARER__: `Tour ${k} : préparer` }),
      nExec(`Tour ${k} : garde et outil`, ID.sgb6Tour, [1440 + (k - 1) * 1200, 600]),
      nPg(`Tour ${k} terminé`, TOUR, valeursTour, [1680 + (k - 1) * 1200, 600]),
      nSi(`Tour ${k} : continuer ?`, "={{ $json.statut === 'en_cours' && !$json.sess.fin }}", true, [1920 + (k - 1) * 1200, 600]),
    ]),
    nCodeSimple('Fin du pilotage', 'sgb6-agent-pilote-fin', [720, 900]),
    nSi('Pilotage abouti ?', "={{ $json.sess.fin === 'termine' }}", true, [960, 900]),
    nCodeAgent('Résultat (pilote)', 'sgb6-agent-pilote-resultat', [1200, 800]),
    nPg(
      'Repli sur la mission guidée',
      "WITH t AS (UPDATE soins.taches SET total = 7, fait = 0, heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id) INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, duree_ms, choisi_par, soignant) SELECT $2, $1::uuid, 'pilotage', 'repli', 'pilotage par le modèle abandonné : ' || $3, 0, 'agent', $4 FROM t RETURNING 1",
      "$('Entrée').first().json.task_id, $('Entrée').first().json.dossier_id, $json.sess.abandon ?? 'raison inconnue', $('Entrée').first().json.soignant",
      [1200, 1000],
      { alwaysOutputData: true },
    ),
    // ---- mission guidée par le code (et repli du pilotage) ----
    nCodeSgb6('Lire le questionnaire', 'sgb6-agent-lire', [480, 0]),
    nPg('Étape 1 terminée', ETAPE, valeursEtape, [720, 0]),
    actif('Tâche active ? (1)', [960, 0]),
    nSi("Lecture par l'IA ?", "={{ $('Entrée').first().json.lecture_ia === true }}", true, [1200, 0]),
    nCodeSgb6("Préparer la lecture par l'IA", 'sgb6-agent-ia-preparer', [1440, -160]),
    { ...nHttp('Extraction SGB VI (Ollama)', { method: 'POST', url: 'http://host.docker.internal:11434/api/generate', jsonBody: '={{ JSON.stringify($json.body) }}', options: { timeout: 300000 } }, [1680, -160]), onError: 'continueRegularOutput' }, // 5 minutes au plus, puis repli sur les règles
    nCodeSgb6("Lire la réponse de l'IA", 'sgb6-agent-ia-lire', [1920, -160]),
    nCodeSgb6('Extraction par règles', 'sgb6-agent-extraire', [1440, 160]),
    nPg('Étape 2 terminée', ETAPE, valeursEtape, [2160, 0]),
    actif('Tâche active ? (2)', [2400, 0]),
    // étapes 3 à 7 : UN nœud par étape, puis journal + avancement + battement de coeur + contrôle d'annulation après chacune
    ...[
      ['Contrôler les champs', 'sgb6-agent-etape-controler', 3],
      ['Lire le dossier de la caisse', 'sgb6-agent-etape-caisse', 4],
      ['Vérifier les règles', 'sgb6-agent-etape-regles', 5],
      ['Calculer la cotisation', 'sgb6-agent-etape-calculer', 6],
      ['Préparer la déclaration', 'sgb6-agent-etape-declaration', 7],
    ].flatMap(([nom, fichier, n]) => [
      nCodeSgb6(nom, fichier, [2640 + (n - 3) * 720, 0]),
      nPg(`Étape ${n} terminée`, ETAPE, valeursEtape, [2880 + (n - 3) * 720, 0]),
      actif(`Tâche active ? (${n})`, [3120 + (n - 3) * 720, 0]),
    ]),
    nCodeSgb6('Résultat', 'sgb6-agent-resultat', [6000, 0]),
    nPg(
      'Enregistrer le résultat',
      "WITH t AS (UPDATE soins.taches SET fait = 7, statut = 'termine', termine_le = now(), heartbeat = now(), resultat = $4::jsonb WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id), j AS (INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, duree_ms, choisi_par, soignant) SELECT $2, $1::uuid, e->>'etape', e->>'outil', e->>'resultat', (e->>'duree_ms')::int, 'agent', $5 FROM jsonb_array_elements($3::jsonb) e WHERE EXISTS (SELECT 1 FROM t)), d AS (UPDATE soins.sgb6_dossiers SET statut = $6, resultat = $4::jsonb, mis_a_jour_le = now() WHERE id = $2 AND statut IN ('a_traiter', 'pret_a_valider', 'exception') AND EXISTS (SELECT 1 FROM t) RETURNING id) SELECT (SELECT count(*) FROM t) AS enregistre",
      "$('Entrée').first().json.task_id, $('Entrée').first().json.dossier_id, JSON.stringify($json.journal), JSON.stringify($json.resultat), $('Entrée').first().json.soignant, $json.resultat.statut",
      [6240, 0],
    ),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Entrée'], 'Dossier', 'Pilotage par le modèle ?'),
    { 'Pilotage par le modèle ?': { main: [[vers('Démarrer le pilotage')], [vers('Lire le questionnaire')]] } },
    enchaine(['Démarrer le pilotage'], 'Tour 1 : préparer'),
    ...Array.from({ length: MAX_TOURS }, (_, i) => i + 1).map((k) => enchaine([`Tour ${k} : préparer`], `Pilote SGB VI (tour ${k})`, `Tour ${k} : fusion`, `Tour ${k} : garde et outil`, `Tour ${k} terminé`, `Tour ${k} : continuer ?`)),
    enchaine(['Lire le questionnaire'], 'Étape 1 terminée', 'Tâche active ? (1)'),
    sortieSiFin('Tâche active ? (1)', "Lecture par l'IA ?"),
    { "Lecture par l'IA ?": { main: [[vers("Préparer la lecture par l'IA")], [vers('Extraction par règles')]] } },
    enchaine(["Préparer la lecture par l'IA"], 'Extraction SGB VI (Ollama)', "Lire la réponse de l'IA", 'Étape 2 terminée'),
    enchaine(['Extraction par règles'], 'Étape 2 terminée'),
    enchaine(['Étape 2 terminée'], 'Tâche active ? (2)'),
    sortieSiFin('Tâche active ? (2)', 'Contrôler les champs'),
    ...[
      ['Contrôler les champs', 3, 'Lire le dossier de la caisse'],
      ['Lire le dossier de la caisse', 4, 'Vérifier les règles'],
      ['Vérifier les règles', 5, 'Calculer la cotisation'],
      ['Calculer la cotisation', 6, 'Préparer la déclaration'],
      ['Préparer la déclaration', 7, 'Résultat'],
    ].flatMap(([nom, n, suivant]) => [enchaine([nom], `Étape ${n} terminée`, `Tâche active ? (${n})`), sortieSiFin(`Tâche active ? (${n})`, suivant)]),
    enchaine(['Résultat'], 'Enregistrer le résultat'),
    // pilotage : tour k -> tour k+1 (sortie « oui » du test), ou fin du pilotage (sortie « non »)
    ...Array.from({ length: MAX_TOURS }, (_, i) => i + 1).map((k) => ({ [`Tour ${k} : continuer ?`]: { main: [k < MAX_TOURS ? [vers(`Tour ${k + 1} : préparer`)] : [vers('Fin du pilotage')], [vers('Fin du pilotage')]] } })),
    enchaine(['Fin du pilotage'], 'Pilotage abouti ?'),
    { 'Pilotage abouti ?': { main: [[vers('Résultat (pilote)')], [vers('Repli sur la mission guidée')]] } },
    enchaine(['Résultat (pilote)'], 'Enregistrer le résultat'),
    enchaine(['Repli sur la mission guidée'], 'Lire le questionnaire'),
  );
  ecrire('93-sgb6-agent.json', workflow(ID.sgb6Agent, "AI-Care – Cotisations : l'agent (tâche de fond)", noeuds, c));
}

// ---- 97 : UN TOUR de l'agent piloté (sous-workflow) : garde puis exécution de l'outil choisi par le modèle -----------------
{
  const noeuds = [entree(), nCodeAgent('Pilote SGB VI : garde et outils', 'sgb6-pilote-tour', [240, 0])];
  ecrire('97-sgb6-tour.json', workflow(ID.sgb6Tour, "AI-Care – Cotisations : un tour de l'agent piloté (garde et outils)", noeuds, enchaine(['Entrée'], 'Pilote SGB VI : garde et outils')));
}

// ---- 92 : aicare-sgb6-lancer : renvoie un tache_id tout de suite, l'agent travaille en tâche de fond --------------------
{
  const noeuds = [
    webhookReponse('aicare-sgb6-lancer'),
    nCodeSimple('Contrôler le lancement', 'sgb6-lancer-controle', [240, 0]),
    nPg(
      'Dossier',
      "SELECT id, statut, (SELECT t.id FROM soins.taches t WHERE t.type = 'sgb6_agent' AND t.statut = 'en_cours' AND t.parametres->>'dossier' = $1 AND t.heartbeat > now() - interval '30 minutes' ORDER BY t.cree_le DESC LIMIT 1) AS tache_en_cours FROM soins.sgb6_dossiers WHERE id = $1",
      '$json.id',
      [480, 0],
    ),
    nCode('Vérifier le lancement', 'sgb6-lancer-verifier', [720, 0]),
    nSi('Lancement possible ?', '={{ $json.ok === true && !$json.reponse }}', true, [960, 0]),
    nPg(
      'Créer la tâche',
      "INSERT INTO soins.taches (type, parametres, total, statut) VALUES ('sgb6_agent', jsonb_build_object('dossier', $1::text, 'lecture_ia', $2::boolean, 'soignant', $3::text, 'pilote', $4::text, 'modele', $5::text), CASE WHEN $4::text = 'modele' THEN 12 ELSE 7 END, 'en_cours') RETURNING id",
      "$json.id, $json.lecture_ia, $json.soignant, $json.pilote, $json.modele",
      [1200, -120],
      { alwaysOutputData: false },
    ),
    nCode('Réponse (tâche)', 'sgb6-lancer-reponse', [1440, -120]),
    reponseJson('Répondre tout de suite', [1680, -120]),
    nCode('Vers l\'agent', 'sgb6-lancer-vers-agent', [1920, -120]),
    { ...nExec("L'agent", ID.sgb6Agent, [2160, -120]), onError: 'continueRegularOutput' },
    // si l'agent s'arrête sur une erreur, la tâche ne reste pas « en cours » (sinon elle serait déjà « terminée » : aucun effet)
    nPg('Terminer en erreur', "UPDATE soins.taches SET statut = 'termine_avec_erreurs', termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id", "$('Créer la tâche').first().json.id", [2400, -120], { alwaysOutputData: true }),
    reponseJson('Répondre (refus)', [1200, 160], '$json.reponse'),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Webhook'], 'Contrôler le lancement', 'Dossier', 'Vérifier le lancement', 'Lancement possible ?'),
    { 'Lancement possible ?': { main: [[vers('Créer la tâche')], [vers('Répondre (refus)')]] } },
    enchaine(['Créer la tâche'], 'Réponse (tâche)', 'Répondre tout de suite', "Vers l'agent", "L'agent", 'Terminer en erreur'),
  );
  ecrire('92-sgb6-lancer.json', workflow(ID.sgb6Lancer, "AI-Care – Cotisations : lancer l'agent (tâche de fond)", noeuds, c));
}

// ---- 94 : aicare-sgb6-tache : avancement, étapes déjà faites et résultat ------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-tache', [0, 0]),
    nCode('Contrôler la tâche', 'sgb6-tache-controle', [240, 0]),
    nPg(
      'Lire la tâche',
      "SELECT t.id, t.statut, t.total, t.fait, t.parametres->>'dossier' AS dossier, t.parametres->>'pilote' AS pilote, t.resultat, coalesce((SELECT jsonb_agg(jsonb_build_object('etape', j.etape, 'outil', j.outil, 'resultat', j.resultat, 'duree_ms', j.duree_ms, 'choisi_par', j.choisi_par, 'raison', j.raison, 'accepte', j.accepte) ORDER BY j.id) FROM soins.sgb6_journal j WHERE j.tache_id = t.id), '[]'::jsonb) AS etapes FROM soins.taches t WHERE t.id = $1::uuid AND t.type = 'sgb6_agent'",
      '$json.tache_id',
      [480, 0],
    ),
    nCode('Réponse', 'sgb6-tache-reponse', [720, 0]),
  ];
  ecrire('94-sgb6-tache.json', workflow(ID.sgb6Tache, "AI-Care – Cotisations : avancement de l'agent", noeuds, enchaine(['Webhook'], 'Contrôler la tâche', 'Lire la tâche', 'Réponse')));
}

// ---- 95 : aicare-sgb6-dossier : le dernier résultat enregistré d'un dossier -------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-dossier', [0, 0]),
    nCode('Contrôler le dossier', 'sgb6-dossier-controle', [240, 0]),
    nPg(
      'Dossier',
      "SELECT d.id, d.aidant, d.personne, d.statut, d.revue, to_char(d.recu_le, 'YYYY-MM-DD') AS recu_le, d.resultat, (SELECT jsonb_build_object('decision', x.decision, 'motif', x.motif, 'soignant', x.soignant, 'heure', x.heure) FROM soins.sgb6_decisions x WHERE x.dossier_id = d.id ORDER BY x.id DESC LIMIT 1) AS derniere_decision FROM soins.sgb6_dossiers d WHERE d.id = $1",
      '$json.id',
      [480, 0],
    ),
    nCode('Réponse', 'sgb6-dossier-reponse', [720, 0]),
  ];
  ecrire('95-sgb6-dossier.json', workflow(ID.sgb6Dossier, 'AI-Care – Cotisations : dernier résultat d\'un dossier', noeuds, enchaine(['Webhook'], 'Contrôler le dossier', 'Dossier', 'Réponse')));
}

// ---- 96 : aicare-sgb6-decider : valider, revue ou refuser (acte humain, soignant de la SESSION) ----------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-decider', [0, 0]),
    nCode('Contrôler la décision', 'sgb6-decider-controle', [240, 0]),
    nPg(
      'Dossier',
      "SELECT id, statut, revue, (resultat IS NOT NULL) AS traite, (resultat IS NOT NULL AND NOT jsonb_path_exists(resultat, '$.regles[*] ? (@.statut != \"ok\")')) AS regles_ok FROM soins.sgb6_dossiers WHERE id = $1",
      '$json.id',
      [480, 0],
    ),
    nCode('Vérifier la décision', 'sgb6-decider-verifier', [720, 0]),
    nSi('Décision permise ?', '={{ $json.ok === true && !$json.reponse }}', true, [960, 0]),
    nPg(
      'Appliquer la décision',
      "WITH u AS (UPDATE soins.sgb6_dossiers SET statut = CASE $2 WHEN 'valider' THEN 'valide' WHEN 'refuser' THEN 'refuse' ELSE statut END, revue = revue OR $2 = 'revue', mis_a_jour_le = now() WHERE id = $1 AND statut IN ('pret_a_valider', 'exception') RETURNING statut, revue), d AS (INSERT INTO soins.sgb6_decisions (dossier_id, decision, motif, soignant) SELECT $1, $2, NULLIF($3, ''), $4 FROM u), j AS (INSERT INTO soins.sgb6_journal (dossier_id, etape, outil, resultat, choisi_par, soignant) SELECT $1, 'decision', 'decider', 'décision humaine : ' || $2, 'humain', $4 FROM u) SELECT statut, revue FROM u",
      '$json.id, $json.decision, $json.motif, $json.soignant',
      [1200, -120],
    ),
    nCode('Réponse', 'sgb6-decider-reponse', [1440, -120]),
    noeud('Réponse (refus)', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: $input.first().json.reponse }];\n" }, [1200, 160]),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Webhook'], 'Contrôler la décision', 'Dossier', 'Vérifier la décision', 'Décision permise ?'),
    { 'Décision permise ?': { main: [[vers('Appliquer la décision')], [vers('Réponse (refus)')]] } },
    enchaine(['Appliquer la décision'], 'Réponse'),
  );
  ecrire('96-sgb6-decider.json', workflow(ID.sgb6Decider, 'AI-Care – Cotisations : décider (valider, revue, refuser)', noeuds, c));
}

compteur = compteurAvantSgb6;
for (const [fichier, wf] of enAttente) {
  proteger(wf);
  writeFileSync(join(racine, fichier), JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log(`écrit ${fichier} (${wf.nodes.length} nœuds)`);
}
