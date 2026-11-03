// Erzeugt die n8n-Workflows (JSON) aus den Dateien workflows/code/*.js.
// Der Code der Knoten steht in echten .js-Dateien (lesbar, prüfbar, testbar) statt im JSON:
// dieses Skript setzt sie zusammen. Aufruf: node workflows/generer.mjs
//
//   00-indexeur.json                       gemeinsamer Unter-Workflow: Zerlegen, Embedding, Qdrant
//   10-connecteur-logiciel-soins.json      PostgreSQL (Notizen, Bewohnerakten)
//   20-connecteur-fhir-hopital.json        HAPI FHIR (Krankenhausdatenbank)
//   30-connecteur-fichiers.json            Ordner data/fichiers (+ OCR der PDF)
//   40-connecteur-epa.json                 ePA (gematik-Mocks)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTILS, requeteChat, nouvelleSession } from './code/sgb6/agent.js';

const racine = dirname(fileURLToPath(import.meta.url));
// `remplacements`: { __MARQUE__: Text }, im Code ersetzt (z. B. die Prompts, die bei der Erzeugung eingebunden werden).
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

// ---- Knoten-Fabrik -----------------------------------------------------------------------------------
let compteur = 0;
const uuid = () => `a1c3e000-${String(++compteur).padStart(4, '0')}-4000-8000-${String(compteur).padStart(12, '0')}`;

function noeud(name, type, typeVersion, parameters, position, extra = {}) {
  return { parameters, id: uuid(), name, type, typeVersion, position, ...extra };
}
const nCode = (name, fichier, position, remplacements) => noeud(name, 'n8n-nodes-base.code', 2, { jsCode: code(fichier, remplacements) }, position);
// unique: n8n führt einen Knoten einmal PRO empfangenem Element aus; executeOnce erzwingt nur eine einzige Ausführung.
const nPostgres = (name, query, position, unique = false) =>
  noeud(name, 'n8n-nodes-base.postgres', 2.6, { operation: 'executeQuery', query, options: {} }, position, {
    credentials: CRED_PG,
    ...(unique ? { executeOnce: true } : {}),
  });
const nHttpGet = (name, position) =>
  // HAPI liefert ohne ausdrücklichen Accept-Header HTML: Wir fordern FHIR-JSON an.
  noeud(name, 'n8n-nodes-base.httpRequest', 4.2, { url: '={{ $json.url }}', sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/fhir+json' }] }, options: { timeout: 120000, response: { response: { responseFormat: 'json' } } } }, position); // application/fhir+json wird standardmäßig nicht als JSON erkannt
const nIndexer = (position) =>
  noeud(
    'Indizieren',
    'n8n-nodes-base.executeWorkflow',
    1.2,
    {
      source: 'database',
      workflowId: { __rl: true, value: ID.indexeur, mode: 'id' },
      mode: 'once', // ein einziger Aufruf mit allen Dokumenten
      options: { waitForSubWorkflow: true },
    },
    position,
  );

// Zeitplan: 4-mal pro Tag (alle 6 Stunden, Berliner Zeit). Die Anbindungen sind um jeweils
// 10 Minuten versetzt, damit Ollama und der Arbeitsspeicher des Rechners nicht gleichzeitig belastet werden.
const HEURES = '0,6,12,18';
const cron = (minute) => `0 ${minute} ${HEURES} * * *`; // Sekunden Minuten Stunden Tag Monat Wochentag

// OCR (OCRmyPDF): sendet das am Element angehängte PDF (Binärfeld "data") an den Dienst compose/ocr.
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

// Gemeinsame Auslöser der Anbindungen: Zeitplan + manuell + Webhook (Start auf Anforderung).
function declencheurs(chemin, minute) {
  return [
    noeud(
      'Zeitplan',
      'n8n-nodes-base.scheduleTrigger',
      1.2,
      { rule: { interval: [{ field: 'cronExpression', expression: cron(minute) }] } },
      [0, -200],
    ),
    noeud('Manueller Start', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 0]),
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
const DECL = ['Zeitplan', 'Manueller Start', 'Webhook'];

// Verbindungen: lineare Folge zwischen Knotennamen; `depuis` = Liste der Quellen der ersten Verbindung
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
// Die Workflows werden ganz am ENDE geschrieben: Der Schutz der Einstiegspunkte (proteger) braucht alle weiter unten definierten Hilfsfunktionen.
const enAttente = [];
const ecrire = (fichier, wf) => enAttente.push([fichier, wf]);

// ---- 00: Indexierer (Unter-Workflow) -----------------------------------------------------------------------
{
  const noeuds = [
    noeud('Eingang', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, [0, 0]),
    // alwaysOutputData: Auch ohne Dokument durchläuft ein Element den Ablauf, und der Workflow liefert eine Zusammenfassung.
    { ...nCode('Zerlegen und Hashen', 'indexeur-decouper', [240, 0]), alwaysOutputData: true },
    // Doppelschutz: Das Protokoll sagt, welche SHA-256-Fingerabdrücke bereits importiert wurden (eine einzige Abfrage).
    noeud(
      'Bereits importiert',
      'n8n-nodes-base.postgres',
      2.6,
      {
        operation: 'executeQuery',
        query: "SELECT source, empreinte FROM soins.journal_imports WHERE empreinte = ANY(string_to_array($1, '|'))",
        options: {
          queryReplacement: "={{ [ $('Zerlegen und Hashen').all().map(i => i.json.payload?.empreinte ?? '').join('|') ] }}",
        },
      },
      [480, 0],
      { credentials: CRED_PG, executeOnce: true, alwaysOutputData: true },
    ),
    nCode('Neuigkeiten behalten', 'indexeur-nouveautes', [720, 0]),
    noeud(
      'Neuigkeiten?',
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
    // Zweig „nichts Neues“: kein Embedding, kein Aufruf an Qdrant.
    nCode('Nichts Neues', 'indexeur-rien', [1200, 220]),
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
    nCode('Punkte bauen', 'indexeur-points', [1440, 0]),
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
    // Protokoll: eine Zeile pro importiertem Abschnitt (erst nach erfolgreichem Qdrant-Schreiben geschrieben).
    noeud(
      'Protokollieren',
      'n8n-nodes-base.postgres',
      2.6,
      {
        operation: 'executeQuery',
        query:
          "INSERT INTO soins.journal_imports (source, reference, patient_id, empreinte, statut, detail) SELECT x.source, x.reference, x.patient_id, x.empreinte, 'importe', x.detail FROM jsonb_to_recordset($1::jsonb) AS x(source text, reference text, patient_id text, empreinte text, detail text) ON CONFLICT (source, empreinte) DO NOTHING",
        options: {
          queryReplacement:
            "={{ [ JSON.stringify($('Neuigkeiten behalten').all().map(i => ({ source: i.json.payload.source, reference: i.json.payload.source_ref + '#' + i.json.payload.chunk_index, patient_id: i.json.payload.patient_id ?? null, empreinte: i.json.payload.empreinte, detail: i.json.collection + ' / ' + i.json.payload.type }))) ] }}",
        },
      },
      [1920, 0],
      { credentials: CRED_PG, executeOnce: true },
    ),
    nCode('Zusammenfassung', 'indexeur-resume', [2160, 0]),
  ];
  const c = fusion(
    enchaine(['Eingang'], 'Zerlegen und Hashen', 'Bereits importiert', 'Neuigkeiten behalten', 'Neuigkeiten?'),
    {
      'Neuigkeiten?': {
        main: [[{ node: 'Embedding (nomic-embed-text)', type: 'main', index: 0 }], [{ node: 'Nichts Neues', type: 'main', index: 0 }]],
      },
    },
    enchaine(['Embedding (nomic-embed-text)'], 'Punkte bauen', 'Upsert Qdrant', 'Protokollieren', 'Zusammenfassung'),
  );
  ecrire('00-indexeur.json', workflow(ID.indexeur, 'AI-Care – Indexierer (Unter-Workflow)', noeuds, c));
}

// ---- 10: Pflegesoftware ------------------------------------------------------------------------------
{
  const notes = `SELECT n.id, n.patient_id, n.horodatage, n.auteur, n.categorie, n.texte, r.civilite, r.prenom, r.nom, r.chambre FROM soins.notes_soins n JOIN soins.residents r USING (patient_id) WHERE n.horodatage > now() - interval '30 days' ORDER BY n.horodatage`;
  const fiches = `SELECT r.patient_id, r.civilite, r.prenom, r.nom, to_char(r.date_naissance, 'DD.MM.YYYY') AS naissance, r.chambre, r.etage, r.diagnostics, r.allergies, r.regime, r.risques, (SELECT string_agg(m.medicament || ' ' || m.dosage || ' (' || m.schema_prise || ')', ' ; ' ORDER BY m.id) FROM soins.plan_medication m WHERE m.patient_id = r.patient_id AND m.actif) AS medication, (SELECT string_agg(to_char(v.horodatage AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI') || ' ' || v.type || ' ' || v.valeur || ' ' || v.unite, ' ; ' ORDER BY v.horodatage DESC) FROM (SELECT * FROM soins.signes_vitaux WHERE patient_id = r.patient_id ORDER BY horodatage DESC LIMIT 6) v) AS vitaux, (SELECT max(horodatage) FROM soins.signes_vitaux WHERE patient_id = r.patient_id) AS maj, r.date_admission AS admission FROM soins.residents r ORDER BY r.chambre::int`;
  const noeuds = [
    ...declencheurs('import-soins', 0),
    nPostgres('Aktuelle Notizen', notes, [260, 100]),
    nPostgres('Bewohnerakten', fiches, [500, 100], true),
    nCode('Pflegedokumente', 'soins-docs', [740, 100]),
    nIndexer([980, 100]),
  ];
  const c = enchaine(DECL, 'Aktuelle Notizen', 'Bewohnerakten', 'Pflegedokumente', 'Indizieren');
  ecrire('10-connecteur-logiciel-soins.json', workflow(ID.soins, 'AI-Care – Anbindung Pflegesoftware', noeuds, c));
}

// ---- 20: Krankenhausdatenbank (FHIR) ----------------------------------------------------------------------
{
  const corr = `SELECT patient_id, civilite, prenom, nom, chambre, fhir_id, kvnr FROM soins.v_correspondance`;
  const noeuds = [
    ...declencheurs('import-fhir', 10),
    nPostgres('Zuordnung', corr, [260, 100]),
    nCode('FHIR-Anfragen', 'fhir-requetes', [500, 100]),
    nHttpGet('FHIR lesen', [740, 100]),
    nCode('FHIR-Dokumente', 'fhir-docs', [980, 100]),
    nIndexer([1220, 100]),
  ];
  const c = enchaine(DECL, 'Zuordnung', 'FHIR-Anfragen', 'FHIR lesen', 'FHIR-Dokumente', 'Indizieren');
  ecrire('20-connecteur-fhir-hopital.json', workflow(ID.fhir, 'AI-Care – Anbindung Krankenhausdatenbank (FHIR)', noeuds, c));
}

// ---- 30: Dateien (+ OCR) --------------------------------------------------------------------------------
{
  const residents = `SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre FROM soins.residents`;
  const noeuds = [
    ...declencheurs('import-fichiers', 20),
    nPostgres('Bewohnerliste', residents, [260, 100]),
    noeud(
      'Dateien lesen',
      'n8n-nodes-base.readWriteFile',
      1,
      { fileSelector: '/home/node/.n8n-files/fichiers/*', options: {} },
      [500, 100],
      { executeOnce: true },
    ),
    noeud(
      'Ist ein PDF',
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
    nCode('PDF-Dateiname', 'fichiers-nom-ocr', [1220, 0]),
    nCode('Text dekodieren', 'fichiers-decoder', [980, 220]),
    noeud('Zusammenführen', 'n8n-nodes-base.merge', 3, { mode: 'append' }, [1460, 100]),
    nCode('Dateidokumente', 'fichiers-docs', [1700, 100]),
    nIndexer([1940, 100]),
  ];
  const c = fusion(
    enchaine(DECL, 'Bewohnerliste', 'Dateien lesen', 'Ist ein PDF'),
    { 'Ist ein PDF': { main: [[{ node: 'OCR (OCRmyPDF)', type: 'main', index: 0 }], [{ node: 'Text dekodieren', type: 'main', index: 0 }]] } },
    enchaine(['OCR (OCRmyPDF)'], 'PDF-Dateiname'),
    { 'PDF-Dateiname': { main: [[{ node: 'Zusammenführen', type: 'main', index: 0 }]] } },
    { 'Text dekodieren': { main: [[{ node: 'Zusammenführen', type: 'main', index: 1 }]] } },
    enchaine(['Zusammenführen'], 'Dateidokumente', 'Indizieren'),
  );
  ecrire('30-connecteur-fichiers.json', workflow(ID.fichiers, 'AI-Care – Anbindung Dateien (OCR)', noeuds, c));
}

// ---- 40 : ePA --------------------------------------------------------------------------------------------
{
  const corr = `SELECT patient_id, civilite, prenom, nom, chambre, fhir_id, kvnr FROM soins.v_correspondance`;
  const noeuds = [
    ...declencheurs('import-epa', 30),
    nPostgres('Zuordnung', corr, [260, 100]),
    nCode('ePA-Anfragen', 'epa-requetes', [500, 100]),
    nHttpGet('ePA lesen', [740, 100]),
    nCode('ePA-Dokumente', 'epa-docs', [980, 100]),
    nIndexer([1220, 100]),
    // Neuigkeiten: Ein Bewohner, dessen ePA bereits importiert war und für den gerade neuer oder geänderter Inhalt indiziert wurde, erhält eine
    // Benachrichtigung (Seite Meldungen). Der erste Import eines Bewohners meldet nichts.
    nPostgres(
      'ePA-Neuigkeiten',
      "INSERT INTO soins.alarmes (topic, chambre, type, libelle, patient_id, faits, contexte) SELECT 'epa/' || n.patient_id || '/' || to_char(now(), 'YYYYMMDDHH24MI'), r.chambre, 'document', 'Neuigkeit in der ePA', n.patient_id, jsonb_build_object('gravite', 'info', 'resident', r.civilite || ' ' || r.prenom || ' ' || r.nom, 'chambre', r.chambre, 'etage', r.etage, 'source', 'ePA', 'courrier', jsonb_build_object('titre', 'Neuer oder geänderter Inhalt in der ePA', 'expediteur', 'ePA', 'date', now())), '{\"statut\":\"aucun\"}'::jsonb FROM (SELECT DISTINCT patient_id FROM soins.journal_imports WHERE source = 'epa' AND importe_le > now() - interval '15 minutes') n JOIN soins.residents r ON r.patient_id = n.patient_id WHERE EXISTS (SELECT 1 FROM soins.journal_imports j WHERE j.source = 'epa' AND j.patient_id = n.patient_id AND j.importe_le <= now() - interval '15 minutes') ON CONFLICT (topic) WHERE type = 'document' DO NOTHING RETURNING id",
      [1460, 100],
      true,
    ),
  ];
  const c = enchaine(DECL, 'Zuordnung', 'ePA-Anfragen', "ePA lesen", 'ePA-Dokumente', 'Indizieren', 'ePA-Neuigkeiten');
  ecrire('40-connecteur-epa.json', workflow(ID.epa, 'AI-Care – Anbindung ePA', noeuds, c));
}

// ---- 50: KIM (Arztbriefe in Mailpit) ---------------------------------------------------------
{
  const residents = `SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre FROM soins.residents`;
  const get = (name, url, position, extra = {}) =>
    noeud(name, 'n8n-nodes-base.httpRequest', 4.2, { url, options: { timeout: 120000, ...extra } }, position);
  const noeuds = [
    ...declencheurs('import-kim', 40),
    nPostgres('Bewohnerliste', residents, [260, 100], true),
    get('Nachrichten auflisten', 'http://mailpit:8025/api/v1/messages?limit=100', [500, 100]),
    nCode('Zu lesende Nachrichten', 'kim-messages', [740, 100]),
    get('Nachrichtendetail', '=http://mailpit:8025/api/v1/message/{{ $json.id }}', [980, 100]),
    nCode('Anhänge', 'kim-pieces', [1220, 100]),
    get('Anhang herunterladen', '=http://mailpit:8025/api/v1/message/{{ $json.id }}/part/{{ $json.partId }}', [1460, 100], {
      response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
    }),
    nOcr('PDF-Text (OCRmyPDF)', [1700, 100]),
    { ...nCode('KIM-Dokumente', 'kim-docs', [1940, 100]), alwaysOutputData: true },
    nIndexer([2180, 100]),
  ];
  const c = enchaine(DECL, 'Bewohnerliste', 'Nachrichten auflisten', 'Zu lesende Nachrichten', 'Nachrichtendetail', 'Anhänge', 'Anhang herunterladen', 'PDF-Text (OCRmyPDF)', 'KIM-Dokumente', 'Indizieren');
  ecrire('50-connecteur-kim.json', workflow(ID.kim, 'AI-Care – Anbindung KIM (Arztbriefe)', noeuds, c));
}

// =====================================================================================================
// TAG 3 – wiederverwendbare Bausteine (Unter-Workflows): Suchen, Vorlage, Verfassen, Speichern, Protokoll
// =====================================================================================================

// ---- Einlesen der versionierten Prompts (prompts/*.md) ----------------------------------------------------
function lirePrompts() {
  const dossier = join(racine, '..', 'prompts');
  const lire = (nom) => readFileSync(join(dossier, nom), 'utf8').replace(/\r/g, '');
  const separe = (brut, nom) => {
    const m = brut.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`${nom}: Kopfzeile „---“ fehlt`);
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
      if (meta[cle] === undefined) throw new Error(`${fichier}: Feld „${cle}“ fehlt`);
    }
    if (meta.id !== fichier.replace(/\.md$/, '')) throw new Error(`${fichier}: id „${meta.id}“ weicht vom Dateinamen ab`);
    if (!['texte', 'json', 'phrases'].includes(meta.sortie)) throw new Error(`${fichier}: sortie muss texte, json oder phrases sein`);
    // Abschnittsüberschriften: deutsch (ANWEISUNG / AUSGABEFORMAT) oder französisch (INSTRUCTION / FORMAT DE SORTIE) akzeptiert
    const instruction = corps.match(/## (?:ANWEISUNG|INSTRUCTION)\n([\s\S]*?)\n## (?:AUSGABEFORMAT|AUSGABE-FORMAT|FORMAT DE SORTIE)\n/);
    const format = corps.match(/## (?:AUSGABEFORMAT|AUSGABE-FORMAT|FORMAT DE SORTIE)\n([\s\S]*)$/);
    if (!instruction || !format) throw new Error(`${fichier}: Abschnitte „## ANWEISUNG“ und „## AUSGABEFORMAT“ (oder „## INSTRUCTION“ und „## FORMAT DE SORTIE“) erforderlich`);
    PROMPTS[meta.id] = {
      id: meta.id,
      version: String(meta.version),
      sortie: meta.sortie,
      temperature: meta.temperature,
      heures: meta.heures,
      requete: meta.requete,
      protocoles: meta.protocoles,
      // Rubriken eines „phrases“-Textes: „S=S – Situation:|B=…“ -> [{ cle, titre }]
      sections: String(meta.sections ?? '').split('|').map((s) => s.trim()).filter(Boolean).map((s) => ({ cle: s.slice(0, s.indexOf('=')), titre: s.slice(s.indexOf('=') + 1) })),
      // bereits bestätigte Dienstberichte werden nur von Prompts erneut gelesen, die es verlangen (Modus B), nie als Fakten eines neuen Berichts
      rapports_valides: meta.rapports_valides === true,
      // standardmäßig höchstens 8 Fakten pro Bewohner (kürzerer Prompt = schnellere Erzeugung)
      max_faits: Number(meta.max_faits ?? 8),
      // Länge der Antwort: Anzahl Sätze und Zeichen pro Satz (eine kürzere Antwort wird schneller erzeugt)
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
// Sprachmodell: llama3.2 (3 Milliarden Parameter, ca. 2,5-mal schneller) auf diesem Rechner mit 8 GB;
// llama3 (8 Milliarden) auf einem leistungsstärkeren Rechner: $env:AICARE_MODELE = 'llama3' ; node workflows/generer.mjs
const MODELE = process.env.AICARE_MODELE || 'llama3.2';
// Rechen-Threads von Ollama: standardmäßig 3 (Rechner mit 4 Kernen); $env:AICARE_THREADS = 6 ; node workflows/generer.mjs auf einem leistungsstärkeren Rechner.
const THREADS = Math.max(1, Number(process.env.AICARE_THREADS || 3));
const remplPrompts = { __PROMPTS__: JSON.stringify(PROMPTS), __REGLES__: JSON.stringify(REGLES) };

// ---- Fabriken für die Bausteine --------------------------------------------------------------------
// mode: 'once' = ein einziger Aufruf mit allen Elementen; 'each' = ein Aufruf (eine Ausführung) pro Element, nacheinander.
const nExec = (name, workflowId, position, mode = 'once') =>
  noeud(
    name,
    'n8n-nodes-base.executeWorkflow',
    1.2,
    { source: 'database', workflowId: { __rl: true, value: workflowId, mode: 'id' }, mode, options: { waitForSubWorkflow: true } },
    position,
  );
const entree = (position = [0, 0]) => noeud('Eingang', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, position);
// Parametrisierte SQL-Abfrage ($1, $2…): Die Werte laufen über queryReplacement, nie über Verkettung.
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

// ---- SICHERHEIT DER EINSTIEGSPUNKTE (Tag 4, Schritt 7) --------------------------------------------------------------
// 1. Geheimer Schlüssel: Header X-AICare-Cle (Zugangsdaten „AI-Care clé des webhooks“, Wert in der .env). Die Oberfläche sendet ihn ebenfalls: Er ist daher
//    in ihrem Code sichtbar und ersetzt die Anmeldung der Pflegekraft NICHT (siehe DECISIONS.md).
// 2. Erlaubte Ursprünge: CORS auf die Adresse der Oberfläche beschränkt (AICARE_ORIGINES zum Ändern).
// 3. Sitzung: Das Bearer-Token der Pflegekraft wird VOR jeder Verarbeitung geprüft; ohne gültige Sitzung wird nichts ausgeführt.
// Von `ecrire` auf alle Webhooks angewendet, außer auf die Anmeldung (nur Schlüssel) und die eingehende Post (von Mailpit aufgerufen, das keinen Header senden kann).
const CRED_CLE = { httpHeaderAuth: { id: 'aicarecle000000001', name: 'AI-Care clé des webhooks' } };
const ORIGINES = process.env.AICARE_ORIGINES || ['localhost', '127.0.0.1'].flatMap((h) => [5173, 5174, 5175].map((p) => `http://${h}:${p}`)).join(',');
// INTERNER Pfad (von n8n selbst aufgerufen, nie von der Oberfläche): eigener Schlüssel, nicht im Code der Oberfläche enthalten, und keine Sitzung einer Pflegekraft
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
      nCode(n('Sitzung (Token)'), 'session-jeton', [x + 120, y - 380]),
      nPg(n('Sitzung (Datenbank)'), 'SELECT s.identifiant, g.nom, s.jeton_hash FROM soins.sessions s JOIN soins.soignants g ON g.identifiant = s.identifiant WHERE s.jeton_hash = $1 AND s.expire_le > now() AND g.actif', '$json.hash', [x + 240, y - 380]),
      nCode(n('Sitzung'), 'session-resultat', [x + 360, y - 380]),
      nSi(n('Sitzung gültig?'), '={{ $json.ok === true }}', true, [x + 480, y - 380]),
      nCode(n('Anfrage'), 'session-requete', [x + 600, y - 460], { __WEBHOOK__: w.name }),
      nCode(n('Ablehnung (Sitzung)'), 'session-refus', [x + 600, y - 300]),
    );
    if (repondre) nouveaux.push(noeud(n('Antworten (Sitzung)'), 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} }, [x + 720, y - 300]));
    // Der Knoten „Sitzung“ behält seinen genauen Namen (ohne Suffix), wenn es nur einen Webhook gibt: Der Code der folgenden Knoten liest ihn
    Object.assign(
      c,
      { [w.name]: { main: [[{ node: n('Sitzung (Token)'), type: 'main', index: 0 }]] } },
      enchaine([n('Sitzung (Token)')], n('Sitzung (Datenbank)'), n('Sitzung'), n('Sitzung gültig?')),
      sortieSi(n('Sitzung gültig?'), n('Anfrage'), n('Ablehnung (Sitzung)')),
      { [n('Anfrage')]: { main: [apres.map((node) => ({ node, type: 'main', index: 0 }))] } },
      repondre ? enchaine([n('Ablehnung (Sitzung)')], n('Antworten (Sitzung)')) : {},
    );
  });
  wf.nodes.push(...nouveaux);
  return wf;
}

// ---- 64: Protokoll ---------------------------------------------------------------------------------------
{
  const noeuds = [
    entree(),
    nPg(
      'Ins Protokoll schreiben',
      "INSERT INTO soins.journal_ia (evenement, patient_id, mode, action, prompt_id, prompt_version, modele, duree_ms, details) VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, '')::int, $9::jsonb) RETURNING id",
      "$json.evenement, $json.patient_id ?? '', $json.mode ?? '', $json.action ?? '', $json.prompt_id ?? '', $json.prompt_version ?? '', $json.modele ?? '', String($json.duree_ms ?? ''), JSON.stringify($json.details ?? {})",
      [240, 0],
    ),
  ];
  ecrire('64-brique-journal.json', workflow(ID.journal, 'AI-Care – Baustein Protokoll', noeuds, enchaine(['Eingang'], 'Ins Protokoll schreiben')));
}

// ---- 60: Suchen ----------------------------------------------------------------------------------------
{
  const P = "$('Parameter').first().json";
  const pid = `${P}.patient_id`;
  const periode = `${pid}, ${P}.depuis, ${P}.jusqua`;
  const filtrePatient = `{ key: 'patient_id', match: { value: ${P}.patient_id } }`;
  const vecteur = "$('Embedding der Anfrage').first().json.embeddings[0]";
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
    nCode('Parameter', 'brique-chercher-params', [240, 0]),
    nPg(
      'Bewohner',
      "SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre, etage, diagnostics, allergies, regime, risques FROM soins.residents WHERE patient_id = $1",
      pid, [480, 0],
    ),
    nPg('Andere Bewohner', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE patient_id <> $1', pid, [720, 0]),
    nPg(
      'Notizen des Zeitraums',
      'SELECT id, horodatage, auteur, categorie, texte FROM soins.notes_soins WHERE patient_id = $1 AND horodatage >= $2::timestamptz AND horodatage <= $3::timestamptz ORDER BY horodatage',
      periode, [960, 0],
    ),
    nPg(
      'Vitalwerte des Zeitraums',
      'SELECT horodatage, type, valeur, unite FROM soins.signes_vitaux WHERE patient_id = $1 AND horodatage >= $2::timestamptz AND horodatage <= $3::timestamptz ORDER BY horodatage',
      periode, [1200, 0],
    ),
    nPg('Medikationsplan', 'SELECT medicament, dosage, schema_prise, indication FROM soins.plan_medication WHERE patient_id = $1 AND actif ORDER BY id', pid, [1440, 0]),
    nHttp(
      'Embedding der Anfrage',
      {
        method: 'POST',
        url: 'http://host.docker.internal:11434/api/embed',
        jsonBody: `={{ JSON.stringify({ model: 'nomic-embed-text', input: 'search_query: ' + ${P}.requete, keep_alive: '30m' }) }}`,
        options: { timeout: 120000 },
      },
      [1680, 0],
    ),
    recherche(
      'Qdrant Zeitraum', 'patients',
      `${filtrePatient}, { key: 'date', range: { gte: ${P}.depuis, lte: ${P}.jusqua } }`,
      `${P}.limite`, [1920, 0],
    ),
    recherche(
      'Qdrant Hintergrund', 'patients',
      `${filtrePatient}, { key: 'type', match: { any: ['diagnostic', 'allergie', 'medication', 'analyse', 'document', 'lettre_validee'] } }`,
      6, [2160, 0],
    ),
    recherche('Qdrant Standards', 'connaissances', null, 2, [2400, 0]),
    nHttp(
      'Qdrant Schreiben',
      {
        method: 'POST',
        url: 'http://qdrant:6333/collections/a_verifier/points/scroll',
        jsonBody: `={{ JSON.stringify({ limit: 5, with_payload: true, with_vector: false, filter: { must: [ ${filtrePatient}, { key: 'statut', match: { value: 'a_verifier' } } ] } }) }}`,
        options: { timeout: 120000 },
      },
      [2640, 0],
    ),
    nCode('Fakten zusammenstellen', 'brique-chercher-faits', [2880, 0]),
  ];
  const c = enchaine(
    ['Eingang'], 'Parameter', 'Bewohner', 'Andere Bewohner', 'Notizen des Zeitraums', 'Vitalwerte des Zeitraums', 'Medikationsplan',
    'Embedding der Anfrage', 'Qdrant Zeitraum', 'Qdrant Hintergrund', 'Qdrant Standards', 'Qdrant Schreiben', 'Fakten zusammenstellen',
  );
  ecrire('60-brique-chercher.json', workflow(ID.chercher, 'AI-Care – Baustein Suchen', noeuds, c));
}

// ---- 61: gesperrte Vorlage ---------------------------------------------------------------------------
{
  const noeuds = [entree(), nCode('Gesperrte Vorlage', 'brique-template', [240, 0], remplPrompts)];
  ecrire('61-brique-template.json', workflow(ID.template, 'AI-Care – Baustein Gesperrte Vorlage', noeuds, enchaine(['Eingang'], 'Gesperrte Vorlage')));
}

// ---- 62: Verfassen (Llama 3, Temperatur 0,1) ---------------------------------------------------------
{
  const noeuds = [
    entree(),
    nCode('Aufruf vorbereiten', 'brique-rediger-appel', [240, 0], { __MODELE__: JSON.stringify(MODELE), __THREADS__: String(THREADS) }),
    nHttp(
      'Sprachmodell (Ollama)',
      {
        method: 'POST',
        url: 'http://host.docker.internal:11434/api/generate',
        jsonBody: '={{ JSON.stringify($json.body) }}',
        options: { timeout: 1800000 }, // 30 Min.: Llama 3 braucht auf diesem Rechner manchmal mehr als 15 Min.
      },
      [480, 0],
    ),
    nCode('Antwort prüfen', 'brique-rediger-controle', [720, 0]),
    nPg(
      'Entwurf erstellen',
      "INSERT INTO soins.brouillons (patient_id, mode, action, consigne, prompt_id, prompt_version, modele, texte_ia, faits, avertissements, retirees) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb) RETURNING id",
      "$('Aufruf vorbereiten').first().json.patient.patient_id, $('Aufruf vorbereiten').first().json.mode ?? 'a', $('Aufruf vorbereiten').first().json.action ?? $('Aufruf vorbereiten').first().json.prompt_id, $('Aufruf vorbereiten').first().json.consigne ?? '', $('Aufruf vorbereiten').first().json.prompt_id, $('Aufruf vorbereiten').first().json.prompt_version, $json.modele, $json.texte, JSON.stringify($('Aufruf vorbereiten').first().json.faits.map(f => ({ id: f.id, label: f.label, texte: f.texte, date: f.date, ref: f.ref }))), JSON.stringify($json.avertissements), JSON.stringify($json.retirees ?? [])",
      [960, 0],
      { alwaysOutputData: false },
    ),
    nCode('Ergebnis des Entwurfs', 'brique-rediger-resultat', [1200, 0]),
    nCode('Ereignis', 'brique-rediger-evenement', [1440, 0]),
    nExec('Protokoll', ID.journal, [1680, 0]),
    noeud('Antwort', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: $('Ergebnis des Entwurfs').first().json }];\n" }, [1920, 0]),
  ];
  const c = enchaine(['Eingang'], 'Aufruf vorbereiten', 'Sprachmodell (Ollama)', 'Antwort prüfen', 'Entwurf erstellen', 'Ergebnis des Entwurfs', 'Ereignis', 'Protokoll', 'Antwort');
  ecrire('62-brique-rediger.json', workflow(ID.rediger, 'AI-Care – Baustein Verfassen', noeuds, c));
}

// ---- 63: Speichern (nur nach Bestätigung) -------------------------------------------------
{
  const noeuds = [
    entree(),
    nCode('Bestätigung prüfen', 'brique-enregistrer-controle', [240, 0]),
    nPg(
      'Entwurf bestätigen',
      "WITH b AS (UPDATE soins.brouillons SET statut = 'valide' WHERE id = $1::uuid AND statut = 'brouillon' RETURNING *) INSERT INTO soins.validations (patient_id, mode, action, consigne, texte, sources, modifiee, valide_par, soignant_id, brouillon_id) SELECT b.patient_id, b.mode, b.action, b.consigne, $2::text, (SELECT coalesce(jsonb_agg(DISTINCT f->>'label'), '[]'::jsonb) FROM jsonb_array_elements(b.faits) AS f), btrim($2::text) <> btrim(b.texte_ia), $3::text, NULLIF($4::text, ''), b.id FROM b RETURNING id AS validation_id, patient_id, mode, action, modifiee",
      '$json.brouillon_id, $json.texte, $json.valide_par, $json.soignant_id',
      [480, 0],
    ),
    nCode('Ergebnis der Bestätigung', 'brique-enregistrer-resultat', [720, 0]),
    nCode('Ereignis', 'brique-enregistrer-evenement', [960, 0]),
    nExec('Protokoll', ID.journal, [1200, 0]),
    nCode('Ausgabe', 'brique-enregistrer-sortie', [1440, 0]),
  ];
  const c = enchaine(['Eingang'], 'Bestätigung prüfen', 'Entwurf bestätigen', 'Ergebnis der Bestätigung', 'Ereignis', 'Protokoll', 'Ausgabe');
  ecrire('63-brique-enregistrer.json', workflow(ID.enregistrer, 'AI-Care – Baustein Speichern (nach Bestätigung)', noeuds, c));
}

// ---- 65: Prüfstand der Bausteine (nur Modus A: kein freier Text) -----------------------------
{
  const noeuds = [
    noeud('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'test-briques', responseMode: 'lastNode', options: {} }, [0, 0], { webhookId: 'aicare-test-briques' }),
    // Nur patient_id und prompt_id werden aus dem Anfragekörper gelesen; alles Übrige stammt aus den Dateien prompts/
    nCode('Prompt-Parameter', 'brique-prompt-parametres', [240, 0], remplPrompts),
    nExec('Suchen', ID.chercher, [480, 0]),
    nCode('Zur Vorlage', 'brique-vers-template', [720, 0]),
    nExec('Vorlage', ID.template, [960, 0]),
    nCode('Zum Verfassen', 'brique-vers-rediger', [1200, 0]),
    nExec('Verfassen', ID.rediger, [1440, 0]),
    // Zweiter Eingang: einen Entwurf bestätigen. Dieser Text wird gespeichert, er wird NIE an die KI gesendet.
    noeud('Webhook Bestätigung', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'test-enregistrer', responseMode: 'lastNode', options: {} }, [0, 300], { webhookId: 'aicare-test-enregistrer' }),
    nCode('Inhalt der Bestätigung', 'valider-corps', [240, 300], { "$('Sitzung')": "$('Sitzung (Webhook Bestätigung)')" }),
    nExec('Speichern', ID.enregistrer, [480, 300]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Prompt-Parameter', 'Suchen', 'Zur Vorlage', 'Vorlage', 'Zum Verfassen', 'Verfassen'),
    enchaine(['Webhook Bestätigung'], 'Inhalt der Bestätigung', 'Speichern'),
  );
  ecrire('65-banc-essai-briques.json', workflow(ID.banc, "AI-Care – Prüfstand der Bausteine", noeuds, c));
}

// =====================================================================================================
// TAG 3, SCHRITT 3 – EINSTIEGS-Workflows der Oberfläche: Aktion (Modus A), Anweisung (Modus B), Bestätigen
// =====================================================================================================
const webhookInterface = (chemin, position) =>
  noeud(
    'Webhook',
    'n8n-nodes-base.webhook',
    2,
    // CORS für die lokale Entwicklung offen (Oberfläche auf anderem Port, Tablet im Netzwerk); in der Produktion einzuschränken.
    { httpMethod: 'POST', path: chemin, responseMode: 'lastNode', options: { allowedOrigins: '*' } },
    position,
    { webhookId: `aicare-${chemin}` },
  );
// ---- 70: Modus A – {action, chambre}: Dienstbericht, ePA-Zusammenfassung, Aufmerksamkeitspunkte ---------------------------
// („Dokument prüfen“ hat einen eigenen Einstiegspunkt, 77, weil seine Antwort vor Ende der Arbeit abgeht.)
{
  const noeuds = [
    webhookInterface('aicare-action', [0, 0]),
    nCode('Anfrage prüfen', 'maitre-controle-demande', [240, 0]),
    nPg('Bewohner des Zimmers', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre = $1', '$json.chambre', [480, 0]),
    nCode('Ablauf wählen', 'maitre-choisir-parcours', [720, 0]),
    nCode('Prompt-Parameter', 'brique-prompt-parametres', [960, 0], remplPrompts),
    nExec('Suchen', ID.chercher, [1200, 0]),
    nCode('Zur Vorlage', 'brique-vers-template', [1440, 0]),
    nExec('Vorlage', ID.template, [1680, 0]),
    nCode('Zum Verfassen', 'brique-vers-rediger', [1920, 0]),
    nExec('Verfassen', ID.rediger, [2160, 0]),
    nCode('Textantwort', 'maitre-reponse-texte', [2400, 0]),
  ];
  const c = enchaine(
    ['Webhook'], 'Anfrage prüfen', 'Bewohner des Zimmers', 'Ablauf wählen', 'Prompt-Parameter', 'Suchen', 'Zur Vorlage', 'Vorlage',
    'Zum Verfassen', 'Verfassen', 'Textantwort',
  );
  ecrire('70-maitre-action.json', workflow(ID.maitreAction, "AI-Care – Eingang Modus A (Aktion und Zimmer)", noeuds, c));
}

// ---- 71: Modus B – {chambre, consigne}: Die Prüfung der Anweisung ist das EINZIGE Tor für freien Text -----
{
  const noeuds = [
    webhookInterface('aicare-consigne', [0, 0]),
    nCode('Zimmer prüfen', 'maitre-chambre-consigne', [240, 0]),
    nPg('Bewohner des Zimmers', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre = $1', '$json.chambre', [480, 0]),
    nPg('Andere Bewohner (Prüfung)', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre <> $1', "$('Zimmer prüfen').first().json.chambre", [720, 0]),
    nCode('Anweisung prüfen', 'maitre-controle-consigne', [960, 0]),
    nSi('Anweisung akzeptiert?', '={{ $json.accepte === true }}', true, [1200, 0]),

    // Anweisung abgelehnt: Protokoll + Antwort, NICHTS wird an die KI gesendet
    nCode('Ereignis Ablehnung', 'maitre-evenement-refus', [1440, 260]),
    nExec('Protokoll', ID.journal, [1680, 260]),
    nCode('Antwort Ablehnung', 'maitre-reponse-refus', [1920, 260]),

    // Anweisung akzeptiert: suchen, gesperrte Vorlage, verfassen
    nCode('Parameter Anweisung', 'maitre-params-consigne', [1440, -200], remplPrompts),
    nExec('Suchen', ID.chercher, [1680, -200]),
    nCode('Zur Vorlage (Anweisung)', 'maitre-vers-template-consigne', [1920, -200]),
    nExec('Vorlage', ID.template, [2160, -200]),
    nCode('Zum Verfassen (Anweisung)', 'maitre-vers-rediger-consigne', [2400, -200]),
    nExec('Verfassen', ID.rediger, [2640, -200]),
    nCode('Textantwort', 'maitre-reponse-texte', [2880, -200]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Zimmer prüfen', 'Bewohner des Zimmers', 'Andere Bewohner (Prüfung)', 'Anweisung prüfen', 'Anweisung akzeptiert?'),
    sortieSi('Anweisung akzeptiert?', 'Parameter Anweisung', 'Ereignis Ablehnung'),
    enchaine(['Ereignis Ablehnung'], 'Protokoll', 'Antwort Ablehnung'),
    enchaine(['Parameter Anweisung'], 'Suchen', 'Zur Vorlage (Anweisung)', 'Vorlage', 'Zum Verfassen (Anweisung)', 'Verfassen', 'Textantwort'),
  );
  ecrire('71-maitre-consigne.json', workflow(ID.maitreConsigne, 'AI-Care – Eingang Modus B (geführte Anweisung)', noeuds, c));
}

// ---- 72: Bestätigen & Speichern ---------------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-valider', [0, 0]),
    nCode('Inhalt der Bestätigung', 'valider-corps', [240, 0]),
    nExec('Speichern', ID.enregistrer, [480, 0]),
    // Ein bestätigter Dienstbericht wird dem RAG hinzugefügt und an das nächste Team übergeben (andere Aktionen: nur gespeichert).
    nSi('Dienstbericht?', "={{ $json.ok === true && $json.action === 'generer_sbar' }}", true, [720, 0]),
    nCode('Zur Nachbearbeitung', 'valider-vers-apres', [960, -120]),
    { ...nExec('Nach der Bestätigung', ID.apresValidation, [1200, -120]), onError: 'continueRegularOutput' },
    nCode('Antwort Bestätigung', 'valider-reponse', [1440, -120]),
    nSi('Prüfung bestätigt?', "={{ $json.ok === true && $json.action === 'verifier_document' }}", true, [960, 140]),
    nCode('Zum bestätigten Schreiben', 'valider-vers-lettre', [1200, 300]),
    { ...nExec('Bestätigtes Schreiben', ID.lettreValidee, [1440, 300]), onError: 'continueRegularOutput' },
    nCode('Antwort Bestätigung (Schreiben)', 'valider-reponse-lettre', [1680, 300]),
    noeud('Einfache Antwort', 'n8n-nodes-base.code', 2, { jsCode: 'return [{ json: $input.first().json }];\n' }, [1200, 500]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Inhalt der Bestätigung', 'Speichern', 'Dienstbericht?'),
    sortieSi('Dienstbericht?', 'Zur Nachbearbeitung', 'Prüfung bestätigt?'),
    sortieSi('Prüfung bestätigt?', 'Zum bestätigten Schreiben', 'Einfache Antwort'),
    enchaine(['Zum bestätigten Schreiben'], 'Bestätigtes Schreiben', 'Antwort Bestätigung (Schreiben)'),
    enchaine(['Zur Nachbearbeitung'], 'Nach der Bestätigung', 'Antwort Bestätigung'),
  );
  ecrire('72-maitre-valider.json', workflow(ID.maitreValider, 'AI-Care – Eingang Bestätigen & Speichern', noeuds, c));
}

// =====================================================================================================
// TAG 3, SCHRITT 4 – Dienstbericht (SBAR der letzten 12 Stunden) pro Bewohner und pro Etage;
// nach der Bestätigung: Aufnahme ins RAG + Übergabe an das nächste Team
// =====================================================================================================

// ---- 66: nach der Bestätigung (RAG + Übergabe) ----------------------------------------------------------
{
  const idsValides = "'{' + ($('Eingang').first().json.validation_ids ?? []).map(Number).filter(Number.isInteger).join(',') + '}'";
  const noeuds = [
    entree(),
    // Der dem RAG hinzugefügte und übergebene Text wird aus der Tabelle der Bestätigungen gelesen, nicht aus der empfangenen Anfrage.
    nPg(
      'Bestätigte Berichte',
      "SELECT v.id AS validation_id, v.patient_id, v.texte, v.sources, v.valide_par, v.valide_le, r.civilite, r.prenom, r.nom, r.chambre, r.etage FROM soins.validations v JOIN soins.residents r ON r.patient_id = v.patient_id WHERE v.id = ANY($1::bigint[]) AND v.action = 'generer_sbar' ORDER BY r.chambre",
      idsValides, [240, 0],
    ),
    nCode('RAG-Dokumente', 'apres-validation-docs', [480, 0]),
    nExec('Indizieren (RAG)', ID.indexeur, [720, 0]),
    nCode('Übergabenachricht', 'apres-validation-message', [960, 0]),
    // Simulierter Übergabe-Briefkasten (Mailpit). Ein Sendefehler wird vermerkt, er macht die Bestätigung nicht rückgängig.
    {
      ...nHttp(
        'Senden (Mailpit)',
        { method: 'POST', url: 'http://mailpit:8025/api/v1/send', jsonBody: "={{ JSON.stringify($('Übergabenachricht').first().json.mailpit) }}", options: { timeout: 60000 } },
        [1200, 0],
      ),
      onError: 'continueRegularOutput',
    },
    nPg(
      'Übergabe vermerken',
      "INSERT INTO soins.transmissions (portee, etage, patient_ids, validation_ids, destinataire, canal, sujet, statut, detail) VALUES ($1, NULLIF($2, '')::int, $3::text[], $4::bigint[], $5, 'mailpit', $6, $7, $8::jsonb) RETURNING id",
      "$('Übergabenachricht').first().json.portee, String($('Übergabenachricht').first().json.etage ?? ''), '{' + $('Übergabenachricht').first().json.patient_ids.join(',') + '}', '{' + $('Übergabenachricht').first().json.validation_ids.join(',') + '}', $('Übergabenachricht').first().json.destinataire, $('Übergabenachricht').first().json.sujet, $('Senden (Mailpit)').first().json.error ? 'echec' : 'envoye', JSON.stringify($('Senden (Mailpit)').first().json.error ? { erreur: String($('Senden (Mailpit)').first().json.error.message ?? $('Senden (Mailpit)').first().json.error).slice(0, 200) } : { mailpit_id: $('Senden (Mailpit)').first().json.ID ?? null })",
      [1440, 0],
    ),
    nCode('Zusammenfassung', 'apres-validation-resume', [1680, 0]),
    nCode('Ereignisse', 'apres-validation-evenements', [1920, 0]),
    nExec('Protokoll', ID.journal, [2160, 0], 'each'),
    nCode('Ausgabe', 'apres-validation-sortie', [2400, 0]),
  ];
  const c = enchaine(['Eingang'], 'Bestätigte Berichte', 'RAG-Dokumente', 'Indizieren (RAG)', 'Übergabenachricht', 'Senden (Mailpit)', 'Übergabe vermerken', 'Zusammenfassung', 'Ereignisse', 'Protokoll', 'Ausgabe');
  ecrire('66-brique-apres-validation.json', workflow(ID.apresValidation, 'AI-Care – Baustein nach Bestätigung (RAG + Übergabe)', noeuds, c));
}

// ---- 67: Dienstbericht EINES Bewohners (einmal pro Bewohner einer Etage aufgerufen) ----------------------
{
  const noeuds = [
    entree(),
    // Herzschlag + Abbruchkontrolle: Vor jedem Bewohner wird „ich lebe“ vermerkt; ist die Aufgabe nicht mehr
    // „en_cours“ (abgebrochen, unterbrochen), wird dieser Bewohner übersprungen und keine Erzeugung gestartet.
    nPg(
      'Aufgabe noch gewünscht',
      "UPDATE soins.taches SET heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING true AS active",
      '$json.task_id',
      [240, 0],
    ),
    nSi('Aufgabe läuft?', '={{ $json.active === true }}', true, [480, 0]),
    nCode('Bewohner übersprungen', 'rapport-garde-ignore', [720, 200]),
    nCode("Eingang übernehmen", 'rapport-garde-reprise', [720, 0]),
    nCode('Prompt-Parameter', 'brique-prompt-parametres', [960, 0], remplPrompts),
    nExec('Suchen', ID.chercher, [1200, 0]),
    nCode('Zur Vorlage', 'brique-vers-template', [1440, 0]),
    nExec('Vorlage', ID.template, [1680, 0]),
    nCode('Zum Verfassen', 'brique-vers-rediger', [1920, 0]),
    { ...nExec('Verfassen', ID.rediger, [2160, 0]), onError: 'continueRegularOutput' },
    nCode('Ergebnis des Berichts', 'rapport-garde-resultat', [2400, 0]),
    // Fortschritt: Die Oberfläche fragt die Aufgabe ab, während die nächsten Bewohner erzeugt werden. Eine zwischenzeitlich abgebrochene Aufgabe
    // wird nicht mehr geändert (das zu spät eingetroffene Ergebnis wird verworfen).
    nPg(
      'Aufgabe voranbringen',
      "UPDATE soins.taches SET fait = fait + 1, heartbeat = now(), resultat = resultat || $2::jsonb WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id",
      '$json.task_id, JSON.stringify([$json.entree])',
      [2640, 0],
    ),
    nCode('Ausgabe', 'rapport-garde-sortie', [2880, 0]),
  ];
  const c = fusion(
    enchaine(['Eingang'], 'Aufgabe noch gewünscht', 'Aufgabe läuft?'),
    sortieSi('Aufgabe läuft?', "Eingang übernehmen", 'Bewohner übersprungen'),
    enchaine(["Eingang übernehmen"], 'Prompt-Parameter', 'Suchen', 'Zur Vorlage', 'Vorlage', 'Zum Verfassen', 'Verfassen', 'Ergebnis des Berichts', 'Aufgabe voranbringen', 'Ausgabe'),
  );
  ecrire('67-brique-rapport-garde.json', workflow(ID.rapportGarde, 'AI-Care – Baustein Dienstbericht (ein Bewohner)', noeuds, c));
}

// ---- 73: Stapel einer Etage bestätigen ---------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-valider-lot', [0, 0]),
    nCode('Inhalt des Stapels', 'lot-corps', [240, 0]),
    { ...nExec('Speichern', ID.enregistrer, [480, 0], 'each'), onError: 'continueRegularOutput' },
    nCode('Stapel zusammenführen', 'lot-rassembler', [720, 0]),
    nSi('Bestätigte Berichte vorhanden?', '={{ $json.nb_valides > 0 }}', true, [960, 0]),
    { ...nExec('Nach der Bestätigung', ID.apresValidation, [1200, -120]), onError: 'continueRegularOutput' },
    nCode('Antwort des Stapels', 'lot-reponse', [1440, -120]),
    nCode('Antwort des Stapels (keine)', 'lot-reponse', [1200, 140]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Inhalt des Stapels', 'Speichern', 'Stapel zusammenführen', 'Bestätigte Berichte vorhanden?'),
    sortieSi('Bestätigte Berichte vorhanden?', 'Nach der Bestätigung', 'Antwort des Stapels (keine)'),
    enchaine(['Nach der Bestätigung'], 'Antwort des Stapels'),
  );
  ecrire('73-maitre-valider-lot.json', workflow(ID.maitreValiderLot, "AI-Care – Eingang Stapel einer Etage bestätigen", noeuds, c));
}

// ---- 68: Dienstbericht einer VOLLSTÄNDIGEN Etage (Unter-Workflow): ein SBAR pro Bewohner, nacheinander ------------
// Aufgerufen von 74 (Klick der Pflegekraft) und von 76 (automatischer Start um 5:30 Uhr). Die Aufgabe existiert bereits (task_id).
{
  const noeuds = [
    entree(),
    nPg("Bewohner der Etage", 'SELECT patient_id FROM soins.residents WHERE etage = $1 ORDER BY chambre', '$json.etage', [240, 0]),
    nCode('Zu bearbeitende Bewohner', 'etage-elements', [480, 0]),
    // ein Bewohner nach dem anderen: Der Rechner führt nicht zwei Erzeugungen gleichzeitig aus
    { ...nExec('Dienstbericht', ID.rapportGarde, [720, 0], 'each'), onError: 'continueRegularOutput', alwaysOutputData: true },
    nPg(
      'Aufgabe beenden',
      "UPDATE soins.taches SET statut = CASE WHEN jsonb_path_exists(resultat, '$[*].erreur') OR fait < total THEN 'termine_avec_erreurs' ELSE 'termine' END, termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id",
      "$('Eingang').first().json.task_id",
      [960, 0],
    ),
  ];
  const c = enchaine(['Eingang'], "Bewohner der Etage", 'Zu bearbeitende Bewohner', 'Dienstbericht', 'Aufgabe beenden');
  ecrire('68-brique-etage-complet.json', workflow(ID.etageComplet, "AI-Care – Baustein Dienstbericht einer Etage (vollständig)", noeuds, c));
}

// ---- 74: Dienstbericht einer Etage auf Anforderung (asynchrone Aufgabe) -----------------------------------------
{
  const noeuds = [
    { ...webhookInterface('aicare-etage', [0, 0]), parameters: { httpMethod: 'POST', path: 'aicare-etage', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
    nCode('Etage prüfen', 'etage-controle', [240, 0]),
    nPg("Bewohner der Etage", 'SELECT patient_id FROM soins.residents WHERE etage = $1 ORDER BY chambre', '$json.etage', [480, 0]),
    nPg(
      'Aufgabe erstellen',
      "INSERT INTO soins.taches (type, parametres, total, statut, termine_le) VALUES ('rapport_garde_etage', jsonb_build_object('etage', $1::int), $2::int, CASE WHEN $2::int = 0 THEN 'termine' ELSE 'en_cours' END, CASE WHEN $2::int = 0 THEN now() END) RETURNING id",
      "$('Etage prüfen').first().json.etage, $('Bewohner der Etage').all().filter(i => i.json.patient_id).length",
      [720, 0],
      { alwaysOutputData: false },
    ),
    noeud(
      'Sofort antworten',
      'n8n-nodes-base.respondToWebhook',
      1.1,
      { respondWith: 'json', responseBody: "={{ JSON.stringify({ tache_id: $json.id, total: $('Bewohner der Etage').all().filter(i => i.json.patient_id).length }) }}", options: {} },
      [960, 0],
    ),
    nCode('Zum vollständigen Etagenbericht', 'etage-vers-complet', [1200, 0]),
    { ...nExec('Vollständiger Etagenbericht', ID.etageComplet, [1440, 0]), onError: 'continueRegularOutput' },
  ];
  const c = enchaine(['Webhook'], 'Etage prüfen', "Bewohner der Etage", 'Aufgabe erstellen', 'Sofort antworten', 'Zum vollständigen Etagenbericht', 'Vollständiger Etagenbericht');
  ecrire('74-maitre-etage.json', workflow(ID.maitreEtage, "AI-Care – Eingang Dienstbericht einer Etage (Aufgabe)", noeuds, c));
}

// ---- 75: Fortschritt einer Aufgabe oder letzter Bericht einer Etage ------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-tache', [0, 0]),
    nCode('Aufgabe prüfen', 'tache-controle', [240, 0]),
    nPg(
      'Aufgabe lesen',
      "SELECT id, type, statut, total, fait, parametres, cree_le, resultat FROM soins.taches WHERE ($1 <> '' AND id = NULLIF($1, '')::uuid) OR ($1 = '' AND type = 'rapport_garde_etage' AND parametres->>'etage' = $2 AND cree_le > now() - interval '16 hours') ORDER BY cree_le DESC LIMIT 1",
      '$json.tache_id, $json.etage',
      [480, 0],
    ),
    nCode('Antwort', 'tache-reponse', [720, 0]),
  ];
  ecrire('75-maitre-tache.json', workflow(ID.maitreTache, "AI-Care – Fortschritt einer Aufgabe", noeuds, enchaine(['Webhook'], 'Aufgabe prüfen', 'Aufgabe lesen', 'Antwort')));
}

// ---- 76: AUTOMATISCHE Etagenberichte jeden Morgen um 5:30 Uhr (vor der Übergabe zur Bestätigung bereit) ---------------------
{
  const noeuds = [
    noeud('Zeitplan 5:30 Uhr', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 30 5 * * *' }] } }, [0, -200]),
    noeud('Manueller Start', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 0]),
    // Start auf Anforderung (Tests): antwortet sofort, die Arbeit läuft danach weiter.
    noeud('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'etage-auto', responseMode: 'onReceived', options: {} }, [0, 200], { webhookId: 'aicare-etage-auto' }),
    nPg(
      'Aufgaben erstellen',
      "INSERT INTO soins.taches (type, parametres, total) SELECT 'rapport_garde_etage', jsonb_build_object('etage', r.etage, 'automatique', true), count(*) FROM soins.residents r GROUP BY r.etage HAVING NOT EXISTS (SELECT 1 FROM soins.taches t WHERE t.type = 'rapport_garde_etage' AND t.parametres->>'automatique' = 'true' AND t.parametres->>'etage' = r.etage::text AND t.cree_le > now() - interval '3 hours') RETURNING id, (parametres->>'etage')::int AS etage",
      '',
      [260, 0],
      { alwaysOutputData: true },
    ),
    nCode('Zu bearbeitende Etagen', 'etage-auto-elements', [500, 0]),
    // eine Etage nach der anderen (und in jeder Etage ein Bewohner nach dem anderen)
    { ...nExec('Vollständiger Etagenbericht', ID.etageComplet, [740, 0], 'each'), onError: 'continueRegularOutput' },
  ];
  const c = enchaine(['Zeitplan 5:30 Uhr', 'Manueller Start', 'Webhook'], 'Aufgaben erstellen', 'Zu bearbeitende Etagen', 'Vollständiger Etagenbericht');
  ecrire('76-etage-automatique.json', workflow(ID.etageAuto, "AI-Care – Automatische Etagenberichte (5:30 Uhr)", noeuds, c));
}

// =====================================================================================================
// TAG 4, SCHRITT 3 – „Dokument prüfen“: Kontrollregeln SOFORT, KI-Analyse als Hintergrundaufgabe
// =====================================================================================================
const respondre = (nom, corps, position) =>
  noeud(nom, 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: corps, options: {} }, position);

// ---- 77: Dokument prüfen ---------------------------------------------------------------------------------
{
  const noeuds = [
    { ...webhookInterface('aicare-verifier', [0, 0]), parameters: { httpMethod: 'POST', path: 'aicare-verifier', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
    // vom Workflow „Post“ (85) mit dem INTERNEN Schlüssel aufgerufen: gleiche Regeln, ohne Sitzung einer Pflegekraft
    noeud('Webhook (intern)', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'aicare-verifier-interne', responseMode: 'responseNode', options: {} }, [0, 200], { webhookId: 'aicare-verifier-interne' }),
    nCode('Anfrage prüfen', 'verif-controle', [240, 0]),
    nPg('Bewohner des Zimmers', 'SELECT patient_id, nom, chambre FROM soins.residents WHERE chambre = $1', '$json.chambre', [480, 0]),
    nCode('Ablauf wählen', 'maitre-choisir-parcours', [720, 0]),
    nCode('Prompt-Parameter (Prüfung)', 'brique-prompt-parametres', [960, 0], remplPrompts),
    nExec('Suchen (Prüfung)', ID.chercher, [1200, 0]),
    nCode('Schreiben wählen', 'maitre-choisir-lettre', [1440, 0]),
    nSi('Zu prüfendes Schreiben?', '={{ $json.aucune !== true }}', true, [1680, 0]),

    // kein Schreiben: Antwort ohne Entwurf, keine KI
    nCode('Antwort ohne Schreiben', 'maitre-reponse-sans-lettre', [1920, 300]),
    respondre('Antworten (ohne Schreiben)', '={{ JSON.stringify($json) }}', [2160, 300]),

    // 1. NUR REGELN (Code): das Hauptergebnis, an einen bestätigbaren Entwurf geknüpft
    nCode('Nur Regeln', 'maitre-regles-fusion', [1920, 0]),
    nPg(
      'Prüfentwurf erstellen',
      "INSERT INTO soins.brouillons (patient_id, mode, action, consigne, prompt_id, prompt_version, modele, texte_ia, faits, avertissements) VALUES ($1, 'a', 'verifier_document', NULL, 'verifier_document', $2, NULL, $3, $4::jsonb, '[]'::jsonb) RETURNING id",
      "$('Schreiben wählen').first().json.patient.patient_id, $json.prompt_versions, $json.texte, JSON.stringify($('Schreiben wählen').first().json.faits.map(f => ({ id: f.id, label: f.label, texte: f.texte, date: f.date, ref: f.ref })).concat([{ id: 'L1', label: 'KIM (Arztbrief)', texte: $('Schreiben wählen').first().json.lettre.titre, date: $('Schreiben wählen').first().json.lettre.date, ref: $('Schreiben wählen').first().json.lettre.ref }]))",
      [2160, 0],
      { alwaysOutputData: false },
    ),
    // Einstellung: Die KI-Analyse kann abgeschaltet werden (Tabelle soins.reglages, Schlüssel verification_ia)
    nPg(
      'Einstellung KI-Analyse',
      "SELECT coalesce((SELECT valeur FROM soins.reglages WHERE cle = 'verification_ia'), 'true'::jsonb) = 'true'::jsonb AS actif",
      '',
      [2400, 0],
    ),
    nSi('KI-Analyse aktiviert?', '={{ $json.actif === true }}', true, [2640, 0]),

    // KI aktiviert: Analyseaufgabe, sofortige Antwort, danach läuft die Arbeit weiter
    nPg(
      "Analyseaufgabe erstellen",
      "INSERT INTO soins.taches (type, parametres, total) VALUES ('verification_document', jsonb_build_object('brouillon_id', $1::text, 'patient_id', $2::text), 1) RETURNING id",
      "$('Prüfentwurf erstellen').first().json.id, $('Schreiben wählen').first().json.patient.patient_id",
      [2880, -200],
      { alwaysOutputData: false },
    ),
    nCode('Sofortantwort', 'verif-reponse-immediate', [3120, -200]),
    respondre('Sofort antworten', '={{ JSON.stringify($json.reponse) }}', [3360, -200]),
    nCode('Ereignis (Prüfung)', 'maitre-evenement-verification', [3600, -360]),
    nExec('Protokoll', ID.journal, [3840, -360]),

    // 2. ZUSÄTZLICHE ANALYSE (KI) als Hintergrundaufgabe: Extraktion, Vergleich, danach Zusammenführung mit den Regeln
    // Vor jedem aufwendigen KI-Schritt: Herzschlag, und Abbruch, wenn die Aufgabe abgebrochen oder unterbrochen wurde.
    nPg(
      'Analyse noch gewünscht (Extraktion)',
      "UPDATE soins.taches SET heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING true AS active",
      "$('Analyseaufgabe erstellen').first().json.id",
      [3480, -80],
    ),
    nSi('Analyse läuft? (Extraktion)', '={{ $json.active === true }}', true, [3600, -240]),
    nPg(
      'Analyse noch gewünscht (Vergleich)',
      "UPDATE soins.taches SET heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING true AS active",
      "$('Analyseaufgabe erstellen').first().json.id",
      [4440, -80],
    ),
    nSi('Analyse läuft? (Vergleich)', '={{ $json.active === true }}', true, [4560, -240]),
    nCode('Zu extrahierendes Dokument', 'maitre-doc-extraction', [3600, -80]),
    nExec('Vorlage (Extraktion)', ID.template, [3840, -80]),
    nCode('Zum Verfassen (Extraktion)', 'maitre-vers-rediger-extraction', [4080, -80]),
    ...poursuivre([nExec('Verfassen (Extraktion)', ID.rediger, [4320, -80])]),
    nCode('Fakten zum Vergleichen', 'maitre-faits-comparer', [4560, -80]),
    nExec('Vorlage (Vergleich)', ID.template, [4800, -80]),
    nCode('Zum Verfassen (Vergleich)', 'maitre-vers-rediger-comparaison', [5040, -80]),
    ...poursuivre([nExec('Verfassen (Vergleich)', ID.rediger, [5280, -80])]),
    nCode('Regeln und Zusammenführung', 'maitre-regles-fusion', [5520, -80]),
    nCode('Zusätzliche Analyse', 'verif-analyse', [5760, -80]),
    nPg(
      "Analyse speichern",
      "UPDATE soins.taches SET fait = 1, statut = $2, resultat = $3::jsonb, heartbeat = now(), termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id",
      '$json.task_id, $json.statut, JSON.stringify($json.resultat)',
      [6000, -80],
    ),
    nCode('Ereignis (Analyse)', 'verif-evenement-analyse', [6240, -80]),
    nExec('Protokoll (Analyse)', ID.journal, [6480, -80]),

    // KI deaktiviert: sofortige Antwort ohne Aufgabe
    nCode('Sofortantwort (ohne KI)', 'verif-reponse-immediate', [2880, 260]),
    respondre('Antworten (ohne KI)', '={{ JSON.stringify($json.reponse) }}', [3120, 260]),
    nCode('Ereignis (ohne KI)', 'maitre-evenement-verification', [3360, 260]),
    nExec('Protokoll (ohne KI)', ID.journal, [3600, 260]),
  ];
  const c = fusion(
    enchaine(['Webhook (intern)'], 'Anfrage prüfen'),
    enchaine(['Webhook'], 'Anfrage prüfen', 'Bewohner des Zimmers', 'Ablauf wählen', 'Prompt-Parameter (Prüfung)', 'Suchen (Prüfung)', 'Schreiben wählen', 'Zu prüfendes Schreiben?'),
    sortieSi('Zu prüfendes Schreiben?', 'Nur Regeln', 'Antwort ohne Schreiben'),
    enchaine(['Antwort ohne Schreiben'], 'Antworten (ohne Schreiben)'),
    enchaine(['Nur Regeln'], 'Prüfentwurf erstellen', 'Einstellung KI-Analyse', 'KI-Analyse aktiviert?'),
    sortieSi('KI-Analyse aktiviert?', "Analyseaufgabe erstellen", 'Sofortantwort (ohne KI)'),
    enchaine(["Analyseaufgabe erstellen"], 'Sofortantwort', 'Sofort antworten'),
    enchaine(['Sofort antworten'], 'Ereignis (Prüfung)', 'Protokoll'),
    enchaine(
      ['Sofort antworten'], 'Analyse noch gewünscht (Extraktion)', 'Analyse läuft? (Extraktion)',
    ),
    sortieSiFin('Analyse läuft? (Extraktion)', 'Zu extrahierendes Dokument'),
    enchaine(
      ['Zu extrahierendes Dokument'], 'Vorlage (Extraktion)', 'Zum Verfassen (Extraktion)', 'Verfassen (Extraktion)', 'Analyse noch gewünscht (Vergleich)', 'Analyse läuft? (Vergleich)',
    ),
    sortieSiFin('Analyse läuft? (Vergleich)', 'Fakten zum Vergleichen'),
    enchaine(
      ['Fakten zum Vergleichen'], 'Vorlage (Vergleich)',
      'Zum Verfassen (Vergleich)', 'Verfassen (Vergleich)', 'Regeln und Zusammenführung', 'Zusätzliche Analyse', "Analyse speichern", 'Ereignis (Analyse)', 'Protokoll (Analyse)',
    ),
    enchaine(['Sofortantwort (ohne KI)'], 'Antworten (ohne KI)', 'Ereignis (ohne KI)', 'Protokoll (ohne KI)'),
  );
  ecrire('77-maitre-verifier.json', workflow(ID.maitreVerifier, "AI-Care – Eingang Dokument prüfen (Regeln sofort, KI im Hintergrund)", noeuds, c));
}

// ---- 78: Einstellung der zusätzlichen KI-Analyse ----------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-reglage', [0, 0]),
    nCode('Einstellung prüfen', 'reglage-controle', [240, 0]),
    nPg(
      'Lesen oder Schreiben',
      "WITH w AS (INSERT INTO soins.reglages (cle, valeur) SELECT $1, to_jsonb(NULLIF($2, '')::boolean) WHERE $2 <> '' ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = now() RETURNING valeur) SELECT coalesce((SELECT valeur FROM w), (SELECT valeur FROM soins.reglages WHERE cle = $1), 'true'::jsonb) AS valeur",
      '$json.cle, $json.valeur',
      [480, 0],
    ),
    nCode('Antwort', 'reglage-reponse', [720, 0]),
  ];
  ecrire('78-maitre-reglage.json', workflow(ID.maitreReglage, "AI-Care – Einstellung der zusätzlichen KI-Analyse", noeuds, enchaine(['Webhook'], 'Einstellung prüfen', 'Lesen oder Schreiben', 'Antwort')));
}

// =====================================================================================================
// TAG 4, SCHRITT 4 – zuverlässige Hintergrundaufgaben: abbrechen, Wiederaufnahme beim Start von n8n, Überwacher
// =====================================================================================================

// ---- 79: Aufgabe abbrechen -------------------------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-annuler', [0, 0]),
    nCode('Aufgabe prüfen', 'tache-annuler-controle', [240, 0]),
    nPg(
      'Abbrechen',
      "WITH a AS (UPDATE soins.taches SET statut = 'annulee', termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id, type), j AS (INSERT INTO soins.journal_ia (evenement, action, details) SELECT 'tache_annulee', type, jsonb_build_object('tache_id', id) FROM a) SELECT (SELECT count(*) FROM a) > 0 AS annulee, coalesce((SELECT 'annulee' FROM a), (SELECT statut FROM soins.taches WHERE id = $1::uuid), 'inconnue') AS statut",
      '$json.tache_id',
      [480, 0],
    ),
    nCode('Antwort', 'tache-annuler-reponse', [720, 0]),
  ];
  ecrire('79-maitre-annuler.json', workflow(ID.maitreAnnuler, "AI-Care – Aufgabe abbrechen", noeuds, enchaine(['Webhook'], 'Aufgabe prüfen', 'Abbrechen', 'Antwort')));
}

// ---- 80: Wiederaufnahme beim Start von n8n + Überwacher (Aufgaben ohne Lebenszeichen) -------------------------------------
{
  const requete = (cause, condition) =>
    `WITH u AS (UPDATE soins.taches SET statut = 'interrompue', termine_le = now() WHERE statut = 'en_cours'${condition} RETURNING id, type, fait, total), j AS (INSERT INTO soins.journal_ia (evenement, action, details) SELECT 'tache_interrompue', type, jsonb_build_object('tache_id', id, 'cause', '${cause}', 'fait', fait, 'total', total) FROM u) SELECT count(*) AS interrompues FROM u`;
  const noeuds = [
    // Beim Start von n8n kann keine Arbeit mehr laufen: Jede Aufgabe „en_cours“ wird unterbrochen
    noeud('n8n-Start', 'n8n-nodes-base.n8nTrigger', 1, { events: ['init'] }, [0, -200]),
    nPg('Wiederaufnahme beim Start', requete('redemarrage', ''), '', [260, -200], { alwaysOutputData: true }),
    // Überwacher: alle 5 Minuten wird eine Aufgabe ohne Herzschlag seit 30 Minuten (die maximale Dauer einer Erzeugung) unterbrochen
    noeud('Alle 5 Minuten', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 */5 * * * *' }] } }, [0, 100]),
    noeud('Manueller Start', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 300]),
    nPg('Alarmkontexte (Start)', "UPDATE soins.alarmes SET contexte = '{\"statut\":\"indisponible\"}'::jsonb WHERE contexte->>'statut' = 'en_cours'", '', [520, -200], { alwaysOutputData: true }),
    nPg('Alarmkontexte (Wächter)', "UPDATE soins.alarmes SET contexte = '{\"statut\":\"indisponible\"}'::jsonb WHERE contexte->>'statut' = 'en_cours' AND recue_le < now() - interval '15 minutes'", '', [520, 200], { alwaysOutputData: true }),
    nPg('Aufgaben ohne Lebenszeichen', requete('sans_signe_de_vie', " AND heartbeat < now() - interval '30 minutes'"), '', [260, 200], { alwaysOutputData: true }),
  ];
  const c = fusion(enchaine(['n8n-Start'], 'Wiederaufnahme beim Start', 'Alarmkontexte (Start)'), enchaine(['Alle 5 Minuten', 'Manueller Start'], 'Aufgaben ohne Lebenszeichen', 'Alarmkontexte (Wächter)'));
  ecrire('80-reprise-taches.json', workflow(ID.repriseTaches, 'AI-Care – Wiederaufnahme der Aufgaben (n8n-Start und Wächter)', noeuds, c));
}

// =====================================================================================================
// TAG 4, SCHRITT 5 – Beispiel 2: Sensoralarme (MQTT). SOFORT ein roter Banner mit codierten Fakten,
// der Kontext des KI-Assistenten kommt anschließend hinzu.
// =====================================================================================================
const CRED_MQTT = { mqtt: { id: 'aicaremqtt0000001', name: 'AI-Care MQTT' } };
const CRED_TTN = { mqtt: { id: 'aicarettn00000001', name: 'AI-Care TTN' } };

// ---- 81: Sensoralarm ---------------------------------------------------------------------------------
{
  const noeuds = [
    // Topics capteurs/chambre{n}/{type}; der Inhalt der Nachricht wird nie gelesen (siehe alarme-controle.js)
    noeud('MQTT-Alarm', 'n8n-nodes-base.mqttTrigger', 1, { topics: 'capteurs/+/+', options: {} }, [0, 0], { credentials: CRED_MQTT }),
    // TTN (The Things Stack): zweiter Einstiegspunkt, deaktiviert, solange TTN_APPLICATION und TTN_CLE_API nicht in der .env stehen
    // (der Importer konfiguriert ihn, legt die Zugangsdaten an und aktiviert ihn); die Nachrichten werden in ein Topic capteurs/chambre{n}/{type} übersetzt
    noeud('TTN-Alarm', 'n8n-nodes-base.mqttTrigger', 1, { topics: 'v3/TTN_APPLICATION/devices/+/up', options: { jsonParseBody: true } }, [0, 200], { credentials: CRED_TTN, disabled: true }),
    nCode('Übersetzen (TTN)', 'alarme-ttn', [120, 200]),
    nCode("Alarm prüfen", 'alarme-controle', [240, 0]),
    nSi('Topic gültig?', '={{ $json.rejete === false }}', true, [480, 0]),

    // unbekanntes Topic: kein Alarm, Spur im Protokoll (bereinigtes Topic, nie der Inhalt)
    nCode('Ereignis (Topic abgelehnt)', 'alarme-evenement-rejet', [720, 260]),
    nExec('Protokoll (Ablehnung)', ID.journal, [960, 260]),

    // 1. CODIERTE FAKTEN: Bewohner, Risiken, Allergien, Risikomedikation (keine KI) -> gespeicherter Alarm = anzeigbar
    nPg(
      'Bewohner des Zimmers',
      "SELECT r.patient_id, r.civilite, r.prenom, r.nom, r.chambre, r.etage, r.risques, r.allergies, r.diagnostics, coalesce((SELECT jsonb_agg(jsonb_build_object('medicament', m.medicament, 'dosage', m.dosage)) FROM soins.plan_medication m WHERE m.patient_id = r.patient_id AND m.actif), '[]'::jsonb) AS medication FROM soins.residents r WHERE r.chambre = $1",
      "$json.chambre",
      [720, 0],
    ),
    nCode('Codierte Fakten', 'alarme-faits-codes', [960, 0]),
    nPg(
      "Alarm erstellen",
      "INSERT INTO soins.alarmes (topic, chambre, type, libelle, patient_id, faits, contexte) SELECT $1, $2, $3, $4, NULLIF($5, ''), $6::jsonb, CASE WHEN NULLIF($5, '') IS NULL THEN '{\"statut\":\"aucun\"}'::jsonb WHEN EXISTS (SELECT 1 FROM soins.alarmes a WHERE a.contexte->>'statut' = 'en_cours' AND a.recue_le > now() - interval '10 minutes') THEN '{\"statut\":\"differe\"}'::jsonb ELSE '{\"statut\":\"en_cours\"}'::jsonb END WHERE NOT EXISTS (SELECT 1 FROM soins.alarmes a WHERE a.chambre = $2 AND a.type = $3 AND a.recue_le > now() - interval '60 seconds') RETURNING id, recue_le, chambre, type, libelle, patient_id, contexte->>'statut' AS contexte_statut",
      "$json.topic, $json.chambre, $json.type, $json.libelle, $json.patient_id ?? '', JSON.stringify($json.faits)",
      [1200, 0],
      { alwaysOutputData: false },
    ),

    // 1 bis. AKTUALISIERUNG DES RAG-INDEX: Der gespeicherte Alarm wird zu Qdrant hinzugefügt (Collection patients, Quelle „Sensoren“).
    // Nur ein Embedding (keine Erzeugung); ein Indizierungsfehler stoppt weder den Alarm noch seinen Kontext.
    nCode('RAG-Dokument (Alarm)', 'alarme-document-rag', [1320, 0]),
    { ...nExec('Indizieren (Alarm)', ID.indexeur, [1380, 0]), onError: 'continueRegularOutput' },
    nCode('Alarm gespeichert', 'alarme-enregistree', [1440, 120]),

    // 2. KONTEXT des KI-Assistenten, anschließend (jeweils nur eine Erzeugung; keine Erzeugung, wenn der Bewohner unbekannt ist)
    nSi('Kontext erzeugen?', "={{ $json.contexte_statut === 'en_cours' }}", true, [1440, 0]),
    nCode('Eingang Suchen (Alarm)', 'alarme-entree-chercher', [1680, 0]),
    nCode('Prompt-Parameter', 'brique-prompt-parametres', [1920, 0], remplPrompts),
    nExec('Suchen', ID.chercher, [2160, 0]),
    nCode("Alarm zu den Fakten hinzufügen", 'alarme-ajouter-fait', [2400, 0]),
    nExec('Vorlage', ID.template, [2640, 0]),
    nCode('Zum Verfassen (Alarm)', 'alarme-vers-rediger', [2880, 0]),
    { ...nExec('Verfassen', ID.rediger, [3120, 0]), onError: 'continueRegularOutput' },
    nCode('Kontext bereit', 'alarme-contexte', [3360, 0]),
    nPg('Kontext speichern', 'UPDATE soins.alarmes SET contexte = $2::jsonb WHERE id = $1::uuid RETURNING id', '$json.id, JSON.stringify($json.contexte)', [3600, 0]),
  ];
  const c = fusion(
    enchaine(['MQTT-Alarm'], "Alarm prüfen", 'Topic gültig?'),
    enchaine(['TTN-Alarm'], 'Übersetzen (TTN)', "Alarm prüfen"),
    sortieSi('Topic gültig?', 'Bewohner des Zimmers', 'Ereignis (Topic abgelehnt)'),
    enchaine(['Ereignis (Topic abgelehnt)'], 'Protokoll (Ablehnung)'),
    enchaine(['Bewohner des Zimmers'], 'Codierte Fakten', "Alarm erstellen", 'RAG-Dokument (Alarm)', 'Indizieren (Alarm)', 'Alarm gespeichert', 'Kontext erzeugen?'),
    sortieSiFin('Kontext erzeugen?', 'Eingang Suchen (Alarm)'),
    enchaine(
      ['Eingang Suchen (Alarm)'], 'Prompt-Parameter', 'Suchen', "Alarm zu den Fakten hinzufügen", 'Vorlage', 'Zum Verfassen (Alarm)', 'Verfassen', 'Kontext bereit', 'Kontext speichern',
    ),
  );
  ecrire('81-alarme-capteur.json', workflow(ID.alarmeCapteur, "AI-Care – Sensoralarm (MQTT)", noeuds, c));
}

// ---- 82: von der Oberfläche angezeigte Alarme ----------------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-alarmes', [0, 0]),
    nCode('Anfrage prüfen', 'alarmes-controle', [240, 0]),
    nPg(
      'Alarme lesen',
      "WITH a AS (UPDATE soins.alarmes SET statut = 'acquittee', acquittee_le = now() WHERE $1 <> '' AND id = NULLIF($1, '')::uuid AND statut = 'nouvelle' RETURNING id) SELECT id, recue_le, chambre, type, libelle, faits, contexte, statut, acquittee_le FROM soins.alarmes WHERE ((statut = 'nouvelle' AND recue_le > now() - interval '12 hours') OR ($2 = 'true' AND recue_le > now() - interval '24 hours')) AND id NOT IN (SELECT id FROM a) UNION ALL SELECT id, recue_le, chambre, type, libelle, faits, contexte, 'acquittee', acquittee_le FROM soins.alarmes WHERE id IN (SELECT id FROM a) AND $2 = 'true' ORDER BY recue_le DESC LIMIT 40",
      '$json.acquitter, $json.historique',
      [480, 0],
    ),
    nCode('Antwort', 'alarmes-reponse', [720, 0]),
  ];
  ecrire('82-maitre-alarmes.json', workflow(ID.maitreAlarmes, "AI-Care – Angezeigte Alarme (Liste und Quittierung)", noeuds, enchaine(['Webhook'], 'Anfrage prüfen', 'Alarme lesen', 'Antwort')));
}

// =====================================================================================================
// TAG 4, SCHRITT 6 – Beispiel 3: Dokumente automatisch (eingegangene Post, ePA-Neuigkeiten, Bestätigung -> RAG)
// =====================================================================================================

// ---- 85: Verarbeitung EINES Schreibens (Unter-Workflow): Lesen, OCR, Identifizierung, Kontrollregeln, Meldung ------------
{
  const residents = `SELECT patient_id, civilite, prenom, nom, to_char(date_naissance, 'DD.MM.YYYY') AS naissance, chambre FROM soins.residents`;
  const get = (name, url, position, extra = {}) => noeud(name, 'n8n-nodes-base.httpRequest', 4.2, { url, options: { timeout: 120000, ...extra } }, position);
  const noeuds = [
    entree(),
    // Sperre: Die Post wird nur übernommen, wenn sie frei ist (nie gesehen oder seit mehr als 15 Minuten „en_cours“ nach einem Fehler); sonst nichts
    nPg(
      'Post übernehmen',
      "INSERT INTO soins.courriers_traites (message_id, etat) VALUES ($1, 'en_cours') ON CONFLICT (message_id) DO UPDATE SET debut = now() WHERE soins.courriers_traites.etat = 'en_cours' AND soins.courriers_traites.debut < now() - interval '15 minutes' RETURNING message_id",
      "$json.id",
      [0, 160],
    ),
    nSi('Post frei?', '={{ !!$json.message_id }}', true, [120, 160]),
    nPostgres('Bewohnerliste', residents, [240, 0], true),
    get('Nachrichtendetail', "=http://mailpit:8025/api/v1/message/{{ $('Eingang').first().json.id }}", [480, 0]),
    // ohne PDF-Anhang (z. B. eine Übergabenachricht): „Anhänge“ liefert nichts und der Workflow endet dort
    nCode('Anhänge', 'kim-pieces', [720, 0]),
    get('Anhang herunterladen', '=http://mailpit:8025/api/v1/message/{{ $json.id }}/part/{{ $json.partId }}', [960, 0], {
      response: { response: { responseFormat: 'file', outputPropertyName: 'data' } },
    }),
    nOcr('PDF-Text (OCRmyPDF)', [1200, 0]),
    { ...nCode('KIM-Dokumente', 'kim-docs', [1440, 0]), alwaysOutputData: true },
    nIndexer([1680, 0]),
    nCode('Zu verarbeitende Post', 'courrier-a-traiter', [1920, 0]),
    nSi('Post identifiziert?', '={{ !!$json.patient_id }}', true, [2160, 0]),

    // identifiziert: Die Kontrollregeln (ohne KI) antworten sofort, die KI-Analyse folgt als Hintergrundaufgabe (Workflow 77)
    {
      ...nHttp(
        'Post überprüfen',
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
    nCode('Meldung (Post identifiziert)', 'courrier-alerte-identifie', [2640, -160]),

    // nicht identifiziert: nie geraten, Meldung „nicht identifizierte Post“
    nCode('Meldung (Post nicht identifiziert)', 'courrier-alerte-inconnu', [2400, 200]),

    nPg(
      'Meldungen erstellen',
      "WITH ins AS (INSERT INTO soins.alarmes (topic, chambre, type, libelle, patient_id, faits, contexte) SELECT x.topic, x.chambre, 'document', x.libelle, NULLIF(x.patient_id, ''), x.faits, '{\"statut\":\"aucun\"}'::jsonb FROM jsonb_to_recordset($1::jsonb) AS x(topic text, chambre text, libelle text, patient_id text, faits jsonb) ON CONFLICT (topic) WHERE type = 'document' DO NOTHING RETURNING id, topic, patient_id, libelle), j AS (INSERT INTO soins.journal_ia (evenement, patient_id, action, details) SELECT 'courrier_recu', patient_id, 'verifier_document', jsonb_build_object('alarme_id', id, 'courrier', topic, 'alerte', libelle) FROM ins) SELECT count(*) AS alertes_creees FROM ins",
      'JSON.stringify($json.alertes)',
      [2880, 0],
    ),
    // Die Nachricht wird als verarbeitet vermerkt: Das geplante Nachholen nimmt sie nicht erneut auf
    nPg(
      'Post als verarbeitet markieren',
      "UPDATE soins.courriers_traites SET etat = 'traite', traite_le = now() WHERE message_id = $1",
      "$('Eingang').first().json.id",
      [3120, 0],
    ),
  ];
  const c = fusion(
    enchaine(['Eingang'], 'Post übernehmen', 'Post frei?'),
    { 'Post frei?': { main: [[{ node: 'Bewohnerliste', type: 'main', index: 0 }], []] } },
    enchaine(['Bewohnerliste'], 'Nachrichtendetail', 'Anhänge', 'Anhang herunterladen', 'PDF-Text (OCRmyPDF)', 'KIM-Dokumente', 'Indizieren', 'Zu verarbeitende Post', 'Post identifiziert?'),
    sortieSi('Post identifiziert?', 'Post überprüfen', 'Meldung (Post nicht identifiziert)'),
    enchaine(['Post überprüfen'], 'Meldung (Post identifiziert)', 'Meldungen erstellen', 'Post als verarbeitet markieren'),
    enchaine(['Meldung (Post nicht identifiziert)'], 'Meldungen erstellen'),
  );
  ecrire('85-brique-courrier.json', workflow(ID.courrierTraiter, "AI-Care – Baustein Post (eine Nachricht: OCR, Identifizierung, Regeln, Meldung)", noeuds, c));
}

// ---- 83: eingegangene Post (Mailpit benachrichtigt n8n per Webhook; Mailpit hat kein IMAP) ------------------------------
{
  const noeuds = [
    noeud('Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'courrier-recu', responseMode: 'onReceived', options: {} }, [0, 0], { webhookId: 'aicare-courrier-recu' }),
    nCode('Post kontrollieren', 'courrier-controle', [240, 0]),
    { ...nExec('Post verarbeiten', ID.courrierTraiter, [480, 0]), onError: 'continueRegularOutput' },
  ];
  ecrire('83-courrier-automatique.json', workflow(ID.courrierAuto, 'AI-Care – Eingegangene Post (Benachrichtigung von Mailpit)', noeuds, enchaine(['Webhook'], 'Post kontrollieren', 'Post verarbeiten')));
}

// ---- 86: Nachholen der Post (verlorene Benachrichtigung, n8n war beim Eintreffen der Post gestoppt) ----------------------
{
  const noeuds = [
    noeud('Alle 2 Minuten', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'cronExpression', expression: '0 */2 * * * *' }] } }, [0, -100]),
    noeud('Manueller Start', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 100]),
    nPostgres('Bereits verarbeitete Post', "SELECT message_id FROM soins.courriers_traites WHERE etat = 'traite' OR debut > now() - interval '15 minutes'", [260, 0], true),
    noeud('Aktuelle Nachrichten', 'n8n-nodes-base.httpRequest', 4.2, { url: 'http://mailpit:8025/api/v1/messages?limit=50', options: { timeout: 60000 } }, [500, 0]),
    nCode('Nachzuholende Post', 'courrier-a-rattraper', [740, 0]),
    // ein Schreiben nach dem anderen
    { ...nExec('Post verarbeiten', ID.courrierTraiter, [980, 0], 'each'), onError: 'continueRegularOutput' },
  ];
  const c = enchaine(['Alle 2 Minuten', 'Manueller Start'], 'Bereits verarbeitete Post', 'Aktuelle Nachrichten', 'Nachzuholende Post', 'Post verarbeiten');
  ecrire('86-courrier-rattrapage.json', workflow(ID.courrierRattrapage, 'AI-Care – Nachholen der Post (alle 2 Minuten)', noeuds, c));
}

// ---- 84: bestätigtes Schreiben -> RAG (aufgerufen nach der Bestätigung eines Berichts „Dokument prüfen“) ------------------
{
  const noeuds = [
    entree(),
    nPg(
      'Schreiben der Bestätigung',
      "SELECT v.id AS validation_id, v.patient_id, b.id AS brouillon_id, (SELECT f->>'ref' FROM jsonb_array_elements(b.faits) f WHERE f->>'id' = 'L1') AS lettre_ref, (b.texte_ia LIKE '%Aucune contradiction détectée%' OR b.texte_ia LIKE '%Kein Widerspruch von den Kontrollregeln erkannt%' OR b.texte_ia LIKE '%Keine Widersprüche erkannt%' OR b.texte_ia LIKE '%Keinen Widerspruch erkannt%' OR b.texte_ia LIKE '%Kein Widerspruch erkannt%') AS sans_contradiction FROM soins.validations v JOIN soins.brouillons b ON b.id = v.brouillon_id WHERE v.id = $1::bigint AND v.action = 'verifier_document'",
      '$json.validation_id',
      [240, 0],
    ),
    nCode('Entscheiden', 'lettre-decider', [480, 0]),
    nSi('Schreiben hinzufügen?', '={{ $json.ajouter === true }}', true, [720, 0]),
    nHttp(
      'Schreiben lesen (a_verifier)',
      {
        method: 'POST',
        url: 'http://qdrant:6333/collections/a_verifier/points/scroll',
        jsonBody: "={{ JSON.stringify({ limit: 50, with_payload: true, with_vector: false, filter: { must: [{ key: 'source_ref', match: { value: $json.lettre_ref } }] } }) }}",
        options: { timeout: 60000 },
      },
      [960, -120],
    ),
    nCode('Schreiben rekonstruieren', 'lettre-reconstituer', [1200, -120]),
    nExec('Indizieren (bestätigtes Schreiben)', ID.indexeur, [1440, -120]),
    nHttp(
      'Schreiben als bestätigt markieren',
      {
        method: 'POST',
        url: 'http://qdrant:6333/collections/a_verifier/points/payload?wait=true',
        jsonBody: "={{ JSON.stringify({ payload: { statut: 'valide' }, filter: { must: [{ key: 'source_ref', match: { value: $('Entscheiden').first().json.lettre_ref } }] } }) }}",
        options: { timeout: 60000 },
      },
      [1680, -120],
    ),
    nCode('Ergebnis', 'lettre-resultat', [1920, 0]),
    nCode('Ereignis', 'lettre-evenement', [2160, 0]),
    nExec('Protokoll', ID.journal, [2400, 0]),
    nCode('Ausgabe', 'lettre-sortie', [2640, 0]),
  ];
  const c = fusion(
    enchaine(['Eingang'], 'Schreiben der Bestätigung', 'Entscheiden', 'Schreiben hinzufügen?'),
    sortieSi('Schreiben hinzufügen?', 'Schreiben lesen (a_verifier)', 'Ergebnis'),
    enchaine(['Schreiben lesen (a_verifier)'], 'Schreiben rekonstruieren', 'Indizieren (bestätigtes Schreiben)', 'Schreiben als bestätigt markieren', 'Ergebnis', 'Ereignis', 'Protokoll', 'Ausgabe'),
  );
  ecrire('84-brique-lettre-validee.json', workflow(ID.lettreValidee, 'AI-Care – Baustein bestätigtes Schreiben (Hinzufügen zum RAG)', noeuds, c));
}

// =====================================================================================================
// TAG 4, SCHRITT 7 – Anmeldung der Pflegekraft (Kennung + PIN-Code) und Sitzung
// =====================================================================================================
// ---- 88: Anmeldung: PIN geprüft (scrypt), Sperre nach 5 Fehlversuchen in 5 Minuten, Sitzungstoken von 12 Stunden ----
{
  const noeuds = [
    webhookInterface('aicare-connexion', [0, 0]),
    nCode('Anmeldung prüfen', 'connexion-controle', [240, 0]),
    nPg(
      'Pflegekraft',
      "SELECT g.identifiant, g.nom, g.pin_hash, g.actif, (SELECT count(*) FROM soins.connexions_echecs e WHERE e.identifiant = $1 AND e.le > now() - interval '5 minutes') >= 5 AS verrouille FROM soins.soignants g WHERE g.identifiant = $1",
      '$json.identifiant',
      [480, 0],
    ),
    nCode('PIN überprüfen', 'connexion-verifier', [720, 0]),
    nSi('PIN akzeptiert?', '={{ $json.autorise === true }}', true, [960, 0]),
    nCode('Token erstellen', 'connexion-jeton', [1200, -120]),
    nPg(
      'Sitzung öffnen',
      'WITH menage AS (DELETE FROM soins.sessions WHERE expire_le < now()), remise AS (DELETE FROM soins.connexions_echecs WHERE identifiant = $2) INSERT INTO soins.sessions (jeton_hash, identifiant) VALUES ($1, $2) RETURNING expire_le',
      '$json.hash, $json.identifiant',
      [1440, -120],
      { alwaysOutputData: false },
    ),
    nCode('Antwort Anmeldung', 'connexion-reponse', [1680, -120]),
    // Nur existierende Konten werden gezählt: Die Tabelle wächst nicht mit erfundenen Kennungen
    nPg(
      "Fehlschlag vermerken",
      "INSERT INTO soins.connexions_echecs (identifiant) SELECT $1 WHERE $2 NOT IN ('verrouille', 'format') AND EXISTS (SELECT 1 FROM soins.soignants WHERE identifiant = $1) RETURNING id",
      '$json.identifiant, $json.motif',
      [1200, 160],
    ),
    nCode('Anmeldung abgelehnt', 'connexion-refus', [1440, 160]),
  ];
  const c = fusion(
    enchaine(['Webhook'], 'Anmeldung prüfen', 'Pflegekraft', 'PIN überprüfen', 'PIN akzeptiert?'),
    sortieSi('PIN akzeptiert?', 'Token erstellen', "Fehlschlag vermerken"),
    enchaine(['Token erstellen'], 'Sitzung öffnen', 'Antwort Anmeldung'),
    enchaine(["Fehlschlag vermerken"], 'Anmeldung abgelehnt'),
  );
  ecrire('88-connexion.json', workflow(ID.connexion, 'AI-Care – Anmeldung der Pflegekraft (Kennung und PIN)', noeuds, c));
}

// ---- 89: „Wer bin ich“ (beim Neuladen der Seite) und Abmeldung ----------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-moi', [0, 0]),
    nSi('Abmeldung?', '={{ $json.body?.deconnexion === true }}', true, [240, 0]),
    nPg('Sitzung schließen', 'DELETE FROM soins.sessions WHERE jeton_hash = $1 RETURNING identifiant', "$('Sitzung').first().json.jeton_hash", [480, -120]),
    noeud('Antwort Abmeldung', 'n8n-nodes-base.code', 2, { jsCode: 'return [{ json: { ok: true } }];\n' }, [720, -120]),
    nCode('Antwort Ich', 'moi-reponse', [480, 120]),
  ];
  const c = fusion(enchaine(['Webhook'], 'Abmeldung?'), sortieSi('Abmeldung?', 'Sitzung schließen', 'Antwort Ich'), enchaine(['Sitzung schließen'], 'Antwort Abmeldung'));
  ecrire('89-session.json', workflow(ID.moi, 'AI-Care – Sitzung (Wer bin ich, Abmeldung)', noeuds, c));
}

// =====================================================================================================
// RENTENBEITRÄGE pflegender Angehöriger (Seite „Rentenbeiträge“, FIKTIVE Daten): Agent als Hintergrundaufgabe
// =====================================================================================================
// Die Regel-Engine (workflows/code/sgb6/regles.js) wird UNVERÄNDERT in jeden Knoten kopiert, der sie nutzt (ein Code-Knoten von n8n kann keine
// Datei importieren): „import“ wird durch die gesetzlichen Werte ersetzt, „export“ entfernt. Sonst wird nichts geändert; tests/sgb6-n8n.test.mjs prüft das.
// Die Knoten-Kennungen dieses Abschnitts beginnen bei 9000: Die bestehenden Workflows behalten genau ihre eigenen (kein Rauschen in git).
const compteurAvantSgb6 = compteur;
compteur = 9000;
const moteurSgb6 = () =>
  readFileSync(join(racine, 'code', 'sgb6', 'regles.js'), 'utf8')
    .replace(/\r/g, '')
    .replace(/^import valeursJson .*$/m, `const valeursJson = ${readFileSync(join(racine, '..', 'data', 'sgb6', 'valeurs-legales.json'), 'utf8').replace(/\r/g, '').trim()};`)
    .replace(/^export /gm, '');
const CAISSE_SGB6 = JSON.stringify(JSON.parse(readFileSync(join(racine, '..', 'data', 'sgb6', 'caisse.json'), 'utf8')));
const nCodeSgb6 = (name, fichier, position) =>
  noeud(name, 'n8n-nodes-base.code', 2, { jsCode: `${moteurSgb6()}\n// ---- Knoten „${name}“ (${fichier}.js) ----\n${code(fichier, { __CAISSE__: CAISSE_SGB6, __MODELE__: JSON.stringify(MODELE), __THREADS__: String(THREADS), __SGB6_MODELE__: JSON.stringify(SGB6_MODELE) })}` }, position);
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
// Lokales Modell, das den Beitrags-Agenten STEUERT: Umgebungsvariable SGB6_MODELE bei der Erzeugung. Vorläufiger Standard: qwen2.5:7b (0 Ablehnungen durch den Wächter gegenüber 1 bei qwen3:8b im ersten Versuch); der Vergleich
// (tests/sgb6-modeles.mjs, docs/cotisations.md) zeigt, was die anderen taugen. Das Modell lässt sich auch in der Seite bei jedem Start einstellen.
const SGB6_MODELE = process.env.SGB6_MODELE || 'qwen2.5:7b';
// Modelle, die die SEITE wählen kann (geschlossene Liste: Der von der Oberfläche gesendete Name wird dagegen geprüft); SGB6_MODELES zum Ändern bei der Erzeugung.
const SGB6_MODELES = (process.env.SGB6_MODELES || 'qwen2.5:7b,qwen3:8b,llama3.1:8b,llama3.2').split(',').map((m) => m.trim()).filter(Boolean);
const moteurAgentSgb6 = () =>
  `${moteurSgb6()}\n${readFileSync(join(racine, 'code', 'sgb6', 'agent.js'), 'utf8').replace(/\r/g, '').replace(/^import \{[\s\S]*?\} from '\.\/regles\.js';\n/m, '').replace(/^export /gm, '')}`;
const remplSgb6 = { __CAISSE__: CAISSE_SGB6, __MODELE__: JSON.stringify(MODELE), __THREADS__: String(THREADS), __SGB6_MODELE__: JSON.stringify(SGB6_MODELE), __SGB6_MODELES__: JSON.stringify(SGB6_MODELES) };
// Code-Knoten mit der Regel-Engine UND dem gesteuerten Agenten (Wächter, Werkzeuge, Modellrunde)
const nCodeAgent = (name, fichier, position) =>
  noeud(name, 'n8n-nodes-base.code', 2, { jsCode: `${moteurAgentSgb6()}\n// ---- Knoten „${name}“ (${fichier}.js) ----\n${code(fichier, remplSgb6)}` }, position);
// einfacher Code-Knoten (ohne Engine) mit den Konstanten der Steuerung
const nCodeSimple = (name, fichier, position, remplacements = {}) => noeud(name, 'n8n-nodes-base.code', 2, { jsCode: code(fichier, { ...remplSgb6, ...remplacements }) }, position);
const ETAPES_SGB6 = "['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration']";

// ---- 90: aicare-sgb6-lister: die Akten und ihr Status -------------------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-lister', [0, 0]),
    nPg('Akten', "SELECT id, aidant, personne, statut, revue, to_char(recu_le, 'YYYY-MM-DD') AS recu_le, (resultat IS NOT NULL) AS traite FROM soins.sgb6_dossiers ORDER BY recu_le, id", '', [240, 0], { alwaysOutputData: true }),
    { ...nHttpGet('Installierte Modelle (Ollama)', [360, 0]), parameters: { method: 'GET', url: 'http://host.docker.internal:11434/api/tags', options: { timeout: 8000 } }, executeOnce: true, onError: 'continueRegularOutput' },
    nCodeSimple('Liste', 'sgb6-lister', [480, 0]),
  ];
  ecrire('90-sgb6-lister.json', workflow(ID.sgb6Lister, 'AI-Care – Rentenbeiträge: Akten auflisten', noeuds, enchaine(['Webhook'], 'Akten', 'Installierte Modelle (Ollama)', 'Liste')));
}

// ---- 91: aicare-sgb6-deposer: Hinterlegen eines Fragebogens (.txt oder PDF mit Text), höchstens 1 MB ----------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-deposer', [0, 0]),
    nCode('Upload prüfen', 'sgb6-deposer-controle', [240, 0]),
    nSi('Upload akzeptiert?', '={{ $json.refus === undefined }}', true, [480, 0]),
    nSi('Ist ein PDF?', '={{ $json.pdf === true }}', true, [720, -120]),
    { ...nOcr('PDF lesen (OCR-Dienst)', [960, -240]), onError: 'continueRegularOutput' },
    nCode('PDF-Text', 'sgb6-deposer-pdf', [1200, -240]),
    noeud('Dateitext', 'n8n-nodes-base.code', 2, { jsCode: "const e = $input.first().json;\nreturn [{ json: { nom: e.nom, texte: e.texte } }];\n" }, [960, 0]),
    nCodeSgb6('Fragebogen erkannt?', 'sgb6-deposer-valider', [1440, -120]),
    nSi('Upload gültig?', '={{ $json.refus === undefined }}', true, [1680, -120]),
    nPg(
      'Upload speichern',
      "WITH d AS (INSERT INTO soins.sgb6_dossiers (id, questionnaire, aidant, personne, recu_le) VALUES ($1, $2, $3, $4, $5::date) RETURNING id) INSERT INTO soins.sgb6_journal (dossier_id, etape, outil, resultat, choisi_par, soignant) SELECT id, 'depot', 'deposer', 'Fragebogen hinterlegt', 'humain', $6 FROM d RETURNING dossier_id AS id",
      "$json.id, $json.texte, $json.aidant, $json.personne, $json.recu_le, $('Sitzung').first().json.soignant.identifiant",
      [1920, -240],
    ),
    nCode('Antwort', 'sgb6-deposer-reponse', [2160, 0]),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Webhook'], 'Upload prüfen', 'Upload akzeptiert?'),
    { 'Upload akzeptiert?': { main: [[vers('Ist ein PDF?')], [vers('Antwort')]] } },
    { 'Ist ein PDF?': { main: [[vers('PDF lesen (OCR-Dienst)')], [vers('Dateitext')]] } },
    enchaine(['PDF lesen (OCR-Dienst)'], 'PDF-Text', 'Fragebogen erkannt?'),
    { 'Dateitext': { main: [[vers('Fragebogen erkannt?')]] } },
    enchaine(['Fragebogen erkannt?'], 'Upload gültig?'),
    { 'Upload gültig?': { main: [[vers('Upload speichern')], [vers('Antwort')]] } },
    enchaine(['Upload speichern'], 'Antwort'),
  );
  ecrire('91-sgb6-deposer.json', workflow(ID.sgb6Deposer, 'AI-Care – Rentenbeiträge: Fragebogen hochladen', noeuds, c));
}

// ---- 93: der AGENT (Unter-Workflow, Hintergrundaufgabe): lesen, extrahieren, prüfen, Kasse, Regeln, Berechnung, Meldung ----------
// Ein Herzschlag und eine Protokollzeile bei jedem Schritt; eine abgebrochene oder unterbrochene Aufgabe wird nie von einem verspäteten Ergebnis überschrieben.
// Die KI (optional) übernimmt nur die Felder: Prüfung, Regeln und Berechnung sind Code (regles.js).
{
  const ETAPE =
    "WITH j AS (INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, duree_ms, choisi_par, soignant) VALUES ($1, $2::uuid, $3, $4, $5, $6::int, 'agent', $7)), t AS (UPDATE soins.taches SET fait = $8::int, heartbeat = now() WHERE id = $2::uuid AND statut = 'en_cours' RETURNING statut) SELECT coalesce((SELECT statut FROM t), (SELECT statut FROM soins.taches WHERE id = $2::uuid)) AS statut";
  const valeursEtape = "$('Eingang').first().json.dossier_id, $('Eingang').first().json.task_id, $json.journal.etape, $json.journal.outil, $json.journal.resultat, String($json.journal.duree_ms), $('Eingang').first().json.soignant, $json.fait";
  const actif = (nom, position) => nSi(nom, "={{ $json.statut === 'en_cours' }}", true, position);
  const MAX_TOURS = 12;
  // Protokoll einer Runde: gewähltes Werkzeug, Begründung (vom Code bereinigt), vom Wächter angenommen oder abgelehnt, Dauer; choisi_par = 'modele'
  const TOUR =
    "WITH j AS (INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, raison, accepte, duree_ms, choisi_par, soignant) VALUES ($1, $2::uuid, 'tour', $3, $4, $5, $6::boolean, $7::int, 'modele', $8)), t AS (UPDATE soins.taches SET fait = $9::int, heartbeat = now() WHERE id = $2::uuid AND statut = 'en_cours' RETURNING statut) SELECT coalesce((SELECT statut FROM t), (SELECT statut FROM soins.taches WHERE id = $2::uuid)) AS statut, $10::jsonb AS sess";
  const valeursTour = "$('Eingang').first().json.dossier_id, $('Eingang').first().json.task_id, $json.ligne.outil, $json.ligne.resultat, $json.ligne.raison, String($json.ligne.accepte), String($json.ligne.duree_ms), $('Eingang').first().json.soignant, $json.sess.tours, JSON.stringify($json.sess)";
  // Körper der Anfrage /api/chat: gleicher Inhalt wie requeteChat() in agent.js (Werkzeuge, Temperatur 0, num_ctx 8192, keep_alive 30m), Nachrichten aus der Sitzung
  const gabarit = requeteChat(nouvelleSession({ dossier_id: 'x', texte: '', annee: 2026, modele: SGB6_MODELE }));
  const corpsChat = `={{ JSON.stringify({ model: $json.sess.modele, messages: $json.sess.messages, tools: ${JSON.stringify(OUTILS, null, 1)}, stream: false, keep_alive: '30m', ...(/^qwen3/i.test($json.sess.modele) ? { think: false } : {}), options: { temperature: 0, num_ctx: ${gabarit.options.num_ctx}, num_predict: ${gabarit.options.num_predict}, seed: ${gabarit.options.seed} } }) }}`;
  const noeuds = [
    entree(),
    nPg('Akte', 'SELECT id, questionnaire FROM soins.sgb6_dossiers WHERE id = $1', '$json.dossier_id', [240, 0]),
    nSi('Steuerung durch das Modell?', "={{ $('Eingang').first().json.pilote === 'modele' }}", true, [360, 0]),
    // ---- Steuerung durch das Modell: MAX_TOURS ausgerollte Runden (keine Schleife: Der Zustand wandert von Knoten zu Knoten, ein eindeutiger Name pro Runde) ----
    nCodeAgent('Steuerung starten', 'sgb6-agent-pilote-demarrer', [480, 600]),
    ...Array.from({ length: MAX_TOURS }, (_, i) => i + 1).flatMap((k) => [
      nCodeSimple(`Runde ${k}: vorbereiten`, 'sgb6-agent-pilote-preparer', [720 + (k - 1) * 1200, 600]),
      { ...nHttp(`SGB-VI-Pilot (Runde ${k})`, { method: 'POST', url: 'http://host.docker.internal:11434/api/chat', jsonBody: corpsChat, options: { timeout: 300000 } }, [960 + (k - 1) * 1200, 600]), onError: 'continueRegularOutput' }, // höchstens 5 Minuten pro Antwort
      nCodeSimple(`Runde ${k}: Zusammenführung`, 'sgb6-agent-pilote-fusion', [1200 + (k - 1) * 1200, 600], { __PREPARER__: `Runde ${k}: vorbereiten` }),
      nExec(`Runde ${k}: Wächter und Werkzeug`, ID.sgb6Tour, [1440 + (k - 1) * 1200, 600]),
      nPg(`Runde ${k} beendet`, TOUR, valeursTour, [1680 + (k - 1) * 1200, 600]),
      nSi(`Runde ${k}: weiter?`, "={{ $json.statut === 'en_cours' && !$json.sess.fin }}", true, [1920 + (k - 1) * 1200, 600]),
    ]),
    nCodeSimple('Ende der Steuerung', 'sgb6-agent-pilote-fin', [720, 900]),
    nSi('Steuerung erfolgreich?', "={{ $json.sess.fin === 'termine' }}", true, [960, 900]),
    nCodeAgent('Ergebnis (Pilot)', 'sgb6-agent-pilote-resultat', [1200, 800]),
    nPg(
      'Rückfall auf die geführte Mission',
      "WITH t AS (UPDATE soins.taches SET total = 7, fait = 0, heartbeat = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id) INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, duree_ms, choisi_par, soignant) SELECT $2, $1::uuid, 'pilotage', 'repli', 'Steuerung durch das Modell aufgegeben: ' || $3, 0, 'agent', $4 FROM t RETURNING 1",
      "$('Eingang').first().json.task_id, $('Eingang').first().json.dossier_id, $json.sess.abandon ?? 'Grund unbekannt', $('Eingang').first().json.soignant",
      [1200, 1000],
      { alwaysOutputData: true },
    ),
    // ---- vom Code geführte Mission (und Rückfall der Steuerung) ----
    nCodeSgb6('Fragebogen lesen', 'sgb6-agent-lire', [480, 0]),
    nPg('Schritt 1 beendet', ETAPE, valeursEtape, [720, 0]),
    actif('Aufgabe aktiv? (1)', [960, 0]),
    nSi("Lesen durch die KI?", "={{ $('Eingang').first().json.lecture_ia === true }}", true, [1200, 0]),
    nCodeSgb6("Lesen durch die KI vorbereiten", 'sgb6-agent-ia-preparer', [1440, -160]),
    { ...nHttp('SGB-VI-Extraktion (Ollama)', { method: 'POST', url: 'http://host.docker.internal:11434/api/generate', jsonBody: '={{ JSON.stringify($json.body) }}', options: { timeout: 300000 } }, [1680, -160]), onError: 'continueRegularOutput' }, // höchstens 5 Minuten, danach Rückfall auf die Regeln
    nCodeSgb6("KI-Antwort lesen", 'sgb6-agent-ia-lire', [1920, -160]),
    nCodeSgb6('Extraktion durch Regeln', 'sgb6-agent-extraire', [1440, 160]),
    nPg('Schritt 2 beendet', ETAPE, valeursEtape, [2160, 0]),
    actif('Aufgabe aktiv? (2)', [2400, 0]),
    // Schritte 3 bis 7: EIN Knoten pro Schritt, danach jeweils Protokoll + Fortschritt + Herzschlag + Abbruchkontrolle
    ...[
      ['Felder prüfen', 'sgb6-agent-etape-controler', 3],
      ['Kassenakte lesen', 'sgb6-agent-etape-caisse', 4],
      ['Regeln überprüfen', 'sgb6-agent-etape-regles', 5],
      ['Beitrag berechnen', 'sgb6-agent-etape-calculer', 6],
      ['Meldung vorbereiten', 'sgb6-agent-etape-declaration', 7],
    ].flatMap(([nom, fichier, n]) => [
      nCodeSgb6(nom, fichier, [2640 + (n - 3) * 720, 0]),
      nPg(`Schritt ${n} beendet`, ETAPE, valeursEtape, [2880 + (n - 3) * 720, 0]),
      actif(`Aufgabe aktiv? (${n})`, [3120 + (n - 3) * 720, 0]),
    ]),
    nCodeSgb6('Ergebnis', 'sgb6-agent-resultat', [6000, 0]),
    nPg(
      'Ergebnis speichern',
      "WITH t AS (UPDATE soins.taches SET fait = 7, statut = 'termine', termine_le = now(), heartbeat = now(), resultat = $4::jsonb WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id), j AS (INSERT INTO soins.sgb6_journal (dossier_id, tache_id, etape, outil, resultat, duree_ms, choisi_par, soignant) SELECT $2, $1::uuid, e->>'etape', e->>'outil', e->>'resultat', (e->>'duree_ms')::int, 'agent', $5 FROM jsonb_array_elements($3::jsonb) e WHERE EXISTS (SELECT 1 FROM t)), d AS (UPDATE soins.sgb6_dossiers SET statut = $6, resultat = $4::jsonb, mis_a_jour_le = now() WHERE id = $2 AND statut IN ('a_traiter', 'pret_a_valider', 'exception') AND EXISTS (SELECT 1 FROM t) RETURNING id) SELECT (SELECT count(*) FROM t) AS enregistre",
      "$('Eingang').first().json.task_id, $('Eingang').first().json.dossier_id, JSON.stringify($json.journal), JSON.stringify($json.resultat), $('Eingang').first().json.soignant, $json.resultat.statut",
      [6240, 0],
    ),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Eingang'], 'Akte', 'Steuerung durch das Modell?'),
    { 'Steuerung durch das Modell?': { main: [[vers('Steuerung starten')], [vers('Fragebogen lesen')]] } },
    enchaine(['Steuerung starten'], 'Runde 1: vorbereiten'),
    ...Array.from({ length: MAX_TOURS }, (_, i) => i + 1).map((k) => enchaine([`Runde ${k}: vorbereiten`], `SGB-VI-Pilot (Runde ${k})`, `Runde ${k}: Zusammenführung`, `Runde ${k}: Wächter und Werkzeug`, `Runde ${k} beendet`, `Runde ${k}: weiter?`)),
    enchaine(['Fragebogen lesen'], 'Schritt 1 beendet', 'Aufgabe aktiv? (1)'),
    sortieSiFin('Aufgabe aktiv? (1)', "Lesen durch die KI?"),
    { "Lesen durch die KI?": { main: [[vers("Lesen durch die KI vorbereiten")], [vers('Extraktion durch Regeln')]] } },
    enchaine(["Lesen durch die KI vorbereiten"], 'SGB-VI-Extraktion (Ollama)', "KI-Antwort lesen", 'Schritt 2 beendet'),
    enchaine(['Extraktion durch Regeln'], 'Schritt 2 beendet'),
    enchaine(['Schritt 2 beendet'], 'Aufgabe aktiv? (2)'),
    sortieSiFin('Aufgabe aktiv? (2)', 'Felder prüfen'),
    ...[
      ['Felder prüfen', 3, 'Kassenakte lesen'],
      ['Kassenakte lesen', 4, 'Regeln überprüfen'],
      ['Regeln überprüfen', 5, 'Beitrag berechnen'],
      ['Beitrag berechnen', 6, 'Meldung vorbereiten'],
      ['Meldung vorbereiten', 7, 'Ergebnis'],
    ].flatMap(([nom, n, suivant]) => [enchaine([nom], `Schritt ${n} beendet`, `Aufgabe aktiv? (${n})`), sortieSiFin(`Aufgabe aktiv? (${n})`, suivant)]),
    enchaine(['Ergebnis'], 'Ergebnis speichern'),
    // Steuerung: Runde k -> Runde k+1 (Ausgang „ja“ des Tests) oder Ende der Steuerung (Ausgang „nein“)
    ...Array.from({ length: MAX_TOURS }, (_, i) => i + 1).map((k) => ({ [`Runde ${k}: weiter?`]: { main: [k < MAX_TOURS ? [vers(`Runde ${k + 1}: vorbereiten`)] : [vers('Ende der Steuerung')], [vers('Ende der Steuerung')]] } })),
    enchaine(['Ende der Steuerung'], 'Steuerung erfolgreich?'),
    { 'Steuerung erfolgreich?': { main: [[vers('Ergebnis (Pilot)')], [vers('Rückfall auf die geführte Mission')]] } },
    enchaine(['Ergebnis (Pilot)'], 'Ergebnis speichern'),
    enchaine(['Rückfall auf die geführte Mission'], 'Fragebogen lesen'),
  );
  ecrire('93-sgb6-agent.json', workflow(ID.sgb6Agent, "AI-Care – Rentenbeiträge: der Agent (Hintergrundaufgabe)", noeuds, c));
}

// ---- 97: EINE RUNDE des gesteuerten Agenten (Unter-Workflow): Wächter, dann Ausführung des vom Modell gewählten Werkzeugs -----------------
{
  const noeuds = [entree(), nCodeAgent('SGB-VI-Pilot: Wächter und Werkzeuge', 'sgb6-pilote-tour', [240, 0])];
  ecrire('97-sgb6-tour.json', workflow(ID.sgb6Tour, "AI-Care – Rentenbeiträge: eine Runde des gesteuerten Agenten (Wächter und Werkzeuge)", noeuds, enchaine(['Eingang'], 'SGB-VI-Pilot: Wächter und Werkzeuge')));
}

// ---- 92: aicare-sgb6-lancer: liefert sofort eine tache_id, der Agent arbeitet als Hintergrundaufgabe --------------------
{
  const noeuds = [
    webhookReponse('aicare-sgb6-lancer'),
    nCodeSimple('Start prüfen', 'sgb6-lancer-controle', [240, 0]),
    nPg(
      'Akte',
      "SELECT id, statut, (SELECT t.id FROM soins.taches t WHERE t.type = 'sgb6_agent' AND t.statut = 'en_cours' AND t.parametres->>'dossier' = $1 AND t.heartbeat > now() - interval '30 minutes' ORDER BY t.cree_le DESC LIMIT 1) AS tache_en_cours FROM soins.sgb6_dossiers WHERE id = $1",
      '$json.id',
      [480, 0],
    ),
    nCode('Start überprüfen', 'sgb6-lancer-verifier', [720, 0]),
    nSi('Start möglich?', '={{ $json.ok === true && !$json.reponse }}', true, [960, 0]),
    nPg(
      'Aufgabe erstellen',
      "INSERT INTO soins.taches (type, parametres, total, statut) VALUES ('sgb6_agent', jsonb_build_object('dossier', $1::text, 'lecture_ia', $2::boolean, 'soignant', $3::text, 'pilote', $4::text, 'modele', $5::text), CASE WHEN $4::text = 'modele' THEN 12 ELSE 7 END, 'en_cours') RETURNING id",
      "$json.id, $json.lecture_ia, $json.soignant, $json.pilote, $json.modele",
      [1200, -120],
      { alwaysOutputData: false },
    ),
    nCode('Antwort (Aufgabe)', 'sgb6-lancer-reponse', [1440, -120]),
    reponseJson('Sofort antworten', [1680, -120]),
    nCode('Zum Agenten', 'sgb6-lancer-vers-agent', [1920, -120]),
    { ...nExec("Der Agent", ID.sgb6Agent, [2160, -120]), onError: 'continueRegularOutput' },
    // Bricht der Agent mit einem Fehler ab, bleibt die Aufgabe nicht „en_cours“ (sonst wäre sie schon „termine“: keine Wirkung)
    nPg('Mit Fehler beenden', "UPDATE soins.taches SET statut = 'termine_avec_erreurs', termine_le = now() WHERE id = $1::uuid AND statut = 'en_cours' RETURNING id", "$('Aufgabe erstellen').first().json.id", [2400, -120], { alwaysOutputData: true }),
    reponseJson('Antworten (Ablehnung)', [1200, 160], '$json.reponse'),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Webhook'], 'Start prüfen', 'Akte', 'Start überprüfen', 'Start möglich?'),
    { 'Start möglich?': { main: [[vers('Aufgabe erstellen')], [vers('Antworten (Ablehnung)')]] } },
    enchaine(['Aufgabe erstellen'], 'Antwort (Aufgabe)', 'Sofort antworten', "Zum Agenten", "Der Agent", 'Mit Fehler beenden'),
  );
  ecrire('92-sgb6-lancer.json', workflow(ID.sgb6Lancer, "AI-Care – Rentenbeiträge: Agent starten (Hintergrundaufgabe)", noeuds, c));
}

// ---- 94: aicare-sgb6-tache: Fortschritt, bereits erledigte Schritte und Ergebnis ------------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-tache', [0, 0]),
    nCode('Aufgabe prüfen', 'sgb6-tache-controle', [240, 0]),
    nPg(
      'Aufgabe lesen',
      "SELECT t.id, t.statut, t.total, t.fait, t.parametres->>'dossier' AS dossier, t.parametres->>'pilote' AS pilote, t.resultat, coalesce((SELECT jsonb_agg(jsonb_build_object('etape', j.etape, 'outil', j.outil, 'resultat', j.resultat, 'duree_ms', j.duree_ms, 'choisi_par', j.choisi_par, 'raison', j.raison, 'accepte', j.accepte) ORDER BY j.id) FROM soins.sgb6_journal j WHERE j.tache_id = t.id), '[]'::jsonb) AS etapes FROM soins.taches t WHERE t.id = $1::uuid AND t.type = 'sgb6_agent'",
      '$json.tache_id',
      [480, 0],
    ),
    nCode('Antwort', 'sgb6-tache-reponse', [720, 0]),
  ];
  ecrire('94-sgb6-tache.json', workflow(ID.sgb6Tache, "AI-Care – Rentenbeiträge: Fortschritt des Agenten", noeuds, enchaine(['Webhook'], 'Aufgabe prüfen', 'Aufgabe lesen', 'Antwort')));
}

// ---- 95: aicare-sgb6-dossier: das zuletzt gespeicherte Ergebnis einer Akte -------------------------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-dossier', [0, 0]),
    nCode('Akte prüfen', 'sgb6-dossier-controle', [240, 0]),
    nPg(
      'Akte',
      "SELECT d.id, d.aidant, d.personne, d.statut, d.revue, to_char(d.recu_le, 'YYYY-MM-DD') AS recu_le, d.resultat, (SELECT jsonb_build_object('decision', x.decision, 'motif', x.motif, 'soignant', x.soignant, 'heure', x.heure) FROM soins.sgb6_decisions x WHERE x.dossier_id = d.id ORDER BY x.id DESC LIMIT 1) AS derniere_decision FROM soins.sgb6_dossiers d WHERE d.id = $1",
      '$json.id',
      [480, 0],
    ),
    nCode('Antwort', 'sgb6-dossier-reponse', [720, 0]),
  ];
  ecrire('95-sgb6-dossier.json', workflow(ID.sgb6Dossier, 'AI-Care – Rentenbeiträge: letztes Ergebnis einer Akte', noeuds, enchaine(['Webhook'], 'Akte prüfen', 'Akte', 'Antwort')));
}

// ---- 96: aicare-sgb6-decider: bestätigen, Prüfaufgabe oder ablehnen (menschliche Handlung, Pflegekraft der SITZUNG) ----------------------------
{
  const noeuds = [
    webhookInterface('aicare-sgb6-decider', [0, 0]),
    nCode('Entscheidung prüfen', 'sgb6-decider-controle', [240, 0]),
    nPg(
      'Akte',
      "SELECT id, statut, revue, (resultat IS NOT NULL) AS traite, (resultat IS NOT NULL AND NOT jsonb_path_exists(resultat, '$.regles[*] ? (@.statut != \"ok\")')) AS regles_ok FROM soins.sgb6_dossiers WHERE id = $1",
      '$json.id',
      [480, 0],
    ),
    nCode('Entscheidung überprüfen', 'sgb6-decider-verifier', [720, 0]),
    nSi('Entscheidung zulässig?', '={{ $json.ok === true && !$json.reponse }}', true, [960, 0]),
    nPg(
      'Entscheidung anwenden',
      "WITH u AS (UPDATE soins.sgb6_dossiers SET statut = CASE $2 WHEN 'valider' THEN 'valide' WHEN 'refuser' THEN 'refuse' ELSE statut END, revue = revue OR $2 = 'revue', mis_a_jour_le = now() WHERE id = $1 AND statut IN ('pret_a_valider', 'exception') RETURNING statut, revue), d AS (INSERT INTO soins.sgb6_decisions (dossier_id, decision, motif, soignant) SELECT $1, $2, NULLIF($3, ''), $4 FROM u), j AS (INSERT INTO soins.sgb6_journal (dossier_id, etape, outil, resultat, choisi_par, soignant) SELECT $1, 'decision', 'decider', 'Entscheidung eines Menschen: ' || $2, 'humain', $4 FROM u) SELECT statut, revue FROM u",
      '$json.id, $json.decision, $json.motif, $json.soignant',
      [1200, -120],
    ),
    nCode('Antwort', 'sgb6-decider-reponse', [1440, -120]),
    noeud('Antwort (Ablehnung)', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: $input.first().json.reponse }];\n" }, [1200, 160]),
  ];
  const vers = (n, i = 0) => ({ node: n, type: 'main', index: i });
  const c = fusion(
    enchaine(['Webhook'], 'Entscheidung prüfen', 'Akte', 'Entscheidung überprüfen', 'Entscheidung zulässig?'),
    { 'Entscheidung zulässig?': { main: [[vers('Entscheidung anwenden')], [vers('Antwort (Ablehnung)')]] } },
    enchaine(['Entscheidung anwenden'], 'Antwort'),
  );
  ecrire('96-sgb6-decider.json', workflow(ID.sgb6Decider, 'AI-Care – Rentenbeiträge: entscheiden (bestätigen, Prüfaufgabe, ablehnen)', noeuds, c));
}

compteur = compteurAvantSgb6;
for (const [fichier, wf] of enAttente) {
  proteger(wf);
  writeFileSync(join(racine, fichier), JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log(`geschrieben ${fichier} (${wf.nodes.length} Knoten)`);
}
