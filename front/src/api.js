// Couche d'accès aux données. L'interface n'appelle QUE ces fonctions.
//
// Interrupteur : VITE_MOCK=true (défaut) -> réponses simulées de src/mock/mock.json
//                VITE_MOCK=false         -> webhooks n8n (jour 3), sans rien changer ailleurs.
// Le réglage se fait dans le fichier .env à la racine du dépôt (voir .env.exemple).
import mock from './mock/mock.json';
import { dossiersSimules, traiterSimule, traiterSimulePilote, deposerSimule } from './mock/cotisations.js';

export const MOCK = import.meta.env.VITE_MOCK !== 'false';
const N8N = (import.meta.env.VITE_N8N_WEBHOOK_URL || 'http://localhost:5679/webhook').replace(/\/$/, '');
// Un rapport peut demander plusieurs minutes sur un petit poste (modèle de langage sans carte graphique).
const DELAI_MAX_MS = 20 * 60 * 1000;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Remplace {resident}, {chambre}, {consigne} dans un texte simulé.
function remplir(texte, valeurs) {
  return texte.replace(/\{(\w+)\}/g, (_, cle) => valeurs[cle] ?? `{${cle}}`);
}

function reponseSimulee(demande) {
  const modele = demande.mode === 'b' ? mock.consigne : mock.actions[demande.action];
  if (!modele) throw new Error(`Action inconnue : ${demande.action}`);
  const valeurs = {
    resident: `${demande.resident.civilite} ${demande.resident.nom}`,
    chambre: demande.chambre,
    consigne: demande.consigne ?? '',
  };
  return {
    brouillon_id: `simule-${Date.now()}`,
    texte: remplir(modele.texte, valeurs),
    sources: [...modele.sources],
    alertes: modele.alertes.map((a) => ({ ...a, message: remplir(a.message, valeurs) })),
    avertissements: [],
    analyse: demande.action === 'verifier_document' && reglageSimule ? { statut: 'en_cours', tache_id: 'simule-analyse' } : demande.action === 'verifier_document' ? { statut: 'desactivee' } : undefined,
    retirees: (modele.retirees ?? []).map((r) => ({ ...r, phrase: remplir(r.phrase, valeurs) })),
  };
}

// ---- Session du soignant (jour 4, étape 7) --------------------------------------------------------------------------
// Le jeton reçu à la connexion reste dans sessionStorage (effacé à la fermeture de l'onglet) et part dans l'en-tête Authorization de chaque appel.
// La clé VITE_N8N_CLE (en-tête X-AICare-Cle) est visible dans le code de l'interface : elle filtre les appels hors interface mais ne protège PAS les
// données ; seule la session le fait. n8n vérifie la session avant tout traitement et répond { erreur: 'session' } si elle manque ou a expiré.
const CLE = import.meta.env.VITE_N8N_CLE || '';
const CLE_STOCKAGE = 'aicare-jeton';
let jeton = '';
try {
  jeton = sessionStorage.getItem(CLE_STOCKAGE) || '';
} catch {
  /* stockage indisponible : la session ne survivra pas à un rechargement */
}
function memoriserJeton(valeur) {
  jeton = valeur || '';
  try {
    if (jeton) sessionStorage.setItem(CLE_STOCKAGE, jeton);
    else sessionStorage.removeItem(CLE_STOCKAGE);
  } catch {
    /* idem */
  }
}
const ecouteursSession = new Set();
// Appelé quand n8n refuse la session (expirée, fermée ailleurs) : l'interface rouvre alors la page de connexion.
export function surSessionPerdue(rappel) {
  ecouteursSession.add(rappel);
  return () => ecouteursSession.delete(rappel);
}
const enTetes = (avecSession = true) => ({
  'Content-Type': 'application/json',
  ...(CLE ? { 'X-AICare-Cle': CLE } : {}),
  ...(avecSession && jeton ? { Authorization: `Bearer ${jeton}` } : {}),
});

async function appelN8n(chemin, corps) {
  const res = await fetch(`${N8N}/${chemin}`, {
    method: 'POST',
    headers: enTetes(),
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  if (!res.ok) throw new Error(`n8n a répondu ${res.status}`);
  const json = await res.json();
  if (json?.erreur === 'session') {
    memoriserJeton('');
    ecouteursSession.forEach((f) => f());
    throw new Error('session');
  }
  return json;
}

// Comptes simulés (mode simulé uniquement) : aucun secret, rien n'est vérifié côté serveur.
const COMPTE_SIMULE = { identifiant: 'demo', pin: '123456', nom: 'Mme Démo (simulation)' };
let soignantSimule = null;

// -> { ok: true, soignant: { identifiant, nom } } ou { ok: false, motif: 'identifiants' | 'verrouille' | 'reseau' }
export async function seConnecter(identifiant, pin) {
  if (MOCK) {
    await pause(300);
    if (identifiant.trim().toLowerCase() !== COMPTE_SIMULE.identifiant || pin !== COMPTE_SIMULE.pin) return { ok: false, motif: 'identifiants' };
    soignantSimule = { identifiant: COMPTE_SIMULE.identifiant, nom: COMPTE_SIMULE.nom };
    return { ok: true, soignant: soignantSimule };
  }
  let reponse;
  try {
    const res = await fetch(`${N8N}/aicare-connexion`, { method: 'POST', headers: enTetes(false), body: JSON.stringify({ identifiant, pin }), signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { ok: false, motif: 'reseau' };
    reponse = await res.json();
  } catch {
    return { ok: false, motif: 'reseau' };
  }
  if (reponse?.jeton) {
    memoriserJeton(reponse.jeton);
    return { ok: true, soignant: reponse.soignant };
  }
  return { ok: false, motif: reponse?.erreur === 'verrouille' ? 'verrouille' : 'identifiants' };
}

// Au chargement de la page : le soignant de la session en cours, ou null (pas de session, ou session expirée).
export async function soignantCourant() {
  if (MOCK) return soignantSimule;
  if (!jeton) return null;
  try {
    return (await appelN8n('aicare-moi', {})).soignant ?? null;
  } catch (e) {
    if (e.message === 'session') return null;
    throw e;
  }
}

export async function seDeconnecter() {
  if (MOCK) {
    soignantSimule = null;
    return;
  }
  try {
    await appelN8n('aicare-moi', { deconnexion: true });
  } catch {
    /* la session est de toute façon oubliée ici ; elle expire côté n8n au bout de 12 heures */
  }
  memoriserJeton('');
}
// Mode A : n8n reçoit {action, chambre} ; le prompt reste caché côté n8n.
// Mode B : n8n reçoit {chambre, consigne}, CONTRÔLE le texte (longueur, mots interdits, tentative de changer les
//          règles) puis l'insère dans le template verrouillé.
// Réponse : { brouillon_id, texte, sources: [...], alertes: [{type, message}], avertissements: [{type, detail}] }
//           ou, pour une consigne refusée : { refuse: true, motif, message }.
// Le texte reçu est un BROUILLON : il n'est enregistré que par « Valider & Enregistrer ».
export async function demander(demande) {
  if (MOCK) {
    await pause(700); // simule le temps de génération
    return reponseSimulee(demande);
  }
  if (demande.mode === 'b') return appelN8n('aicare-consigne', { chambre: demande.chambre, consigne: demande.consigne });
  // « Vérifier le document » : les règles de contrôle répondent tout de suite, l'analyse de l'assistant IA suit (réponse.analyse)
  if (demande.action === 'verifier_document') return appelN8n('aicare-verifier', { chambre: demande.chambre, ...(demande.ref ? { ref: demande.ref } : {}) });
  return appelN8n('aicare-action', { action: demande.action, chambre: demande.chambre });
}

// ---- Analyse complémentaire de l'assistant IA (« Vérifier le document »), en tâche de fond ----------------------------
// Réponse : { statut: 'en_cours' | 'termine' | 'termine_avec_erreurs', resultat: { remarques, alertes, avertissements, indisponible } }
let analyseSimulee = 0;
export async function analyseComplementaire(analyse) {
  if (MOCK) {
    await pause(1200);
    analyseSimulee += 1;
    if (analyseSimulee % 3 !== 0) return { statut: 'en_cours' };
    return { statut: 'termine', resultat: { remarques: [], alertes: [], avertissements: [], indisponible: false } };
  }
  const t = await appelN8n('aicare-tache', { tache_id: analyse.tache_id });
  return { statut: t.statut, resultat: t.resultat };
}

// Réglage : analyse complémentaire de l'assistant IA activée ou non (« Vérifier le document »).
let reglageSimule = true;
export async function lireReglageAnalyseIA() {
  if (MOCK) return reglageSimule;
  return (await appelN8n('aicare-reglage', {})).valeur !== false;
}
export async function ecrireReglageAnalyseIA(actif) {
  if (MOCK) {
    reglageSimule = actif;
    return actif;
  }
  return (await appelN8n('aicare-reglage', { valeur: actif })).valeur !== false;
}

// Bouton [Valider & Enregistrer] : n8n enregistre le texte relu (éventuellement corrigé) rattaché à son brouillon.
export async function enregistrer({ reponse, texte }) {
  if (MOCK) {
    await pause(300);
    return { ok: true };
  }
  const r = await appelN8n('aicare-valider', { brouillon_id: reponse.brouillon_id, texte });
  if (!r.ok) throw new Error(r.erreur ?? 'enregistrement refusé');
  return r;
}

// ---- Rapport de garde d'un ÉTAGE : un SBAR par résident, préparé en tâche de fond par n8n ----------------------------
// lancerEtage -> { tache_id, total } tout de suite ; tacheEtage -> avancement, avec les rapports déjà prêts :
//   { statut: 'en_cours' | 'termine' | 'termine_avec_erreurs', total, fait, resultat: [{ chambre, resident, brouillon_id, texte,
//     sources, avertissements } ou { chambre, resident, erreur }] }
export async function lancerEtage({ etage, residents }) {
  if (MOCK) {
    await pause(300);
    const rapports = residents.map((r) => ({ ...reponseSimulee({ mode: 'a', action: 'rapport_garde', chambre: r.chambre, resident: r }), chambre: r.chambre, resident: `${r.civilite} ${r.prenom} ${r.nom}` }));
    return { tache_id: `simule-${etage}`, total: residents.length, _mock: rapports };
  }
  return appelN8n('aicare-etage', { etage });
}

// ---- Alarmes de capteurs (MQTT) : bandeau rouge ------------------------------------------------------------------
// Les alarmes non acquittées arrivent avec leurs FAITS CODÉS (résident, risques, allergies, médication à risque) tout de suite ;
// le contexte de l'assistant IA (`contexte`) s'ajoute plus tard : { statut: 'aucun' | 'differe' | 'en_cours' | 'pret' | 'indisponible', texte, sources, retirees }.
// Interrogées toutes les 2 secondes : l'alarme s'affiche moins de 5 secondes après la publication MQTT.
const demarrageSimule = Date.now();
const acquitteesSimulees = new Map(); // id -> alarme acquittée (simulation)
function alarmeSimulee() {
  const age = Date.now() - demarrageSimule;
  if (age < 4000) return null;
  return {
    id: 'simulee-1', recue_le: new Date(demarrageSimule + 4000).toISOString(), chambre: '12', type: 'sortie_lit', libelle: 'Sortie de lit', statut: 'nouvelle', acquittee_le: null,
    faits: { resident: 'M. Hans Weber', chambre: '12', etage: 1, risques: ['Chute (risque élevé)', 'Désorientation nocturne'], allergies: ['Pénicilline'], medication_a_risque: [{ famille: 'tension', libelle: 'baisse de tension ou diurétique : risque de chute', medicaments: ['Ramipril 5 mg', 'Amlodipine 5 mg'] }], source: 'Logiciel de soins' },
    contexte: age < 14000 ? { statut: 'en_cours' } : { statut: 'pret', texte: 'Alarme :\nSortie de lit détectée en chambre 12. [Capteurs]\nContexte du résident :\nRisque de chute élevé, désorientation nocturne. [Logiciel de soins]', sources: ['Capteurs', 'Logiciel de soins'], retirees: [] },
  };
}
// Courrier simulé (page Documents) : arrive 6 s après l'ouverture.
function documentSimule() {
  if (Date.now() - demarrageSimule < 6000) return null;
  return {
    id: 'simulee-doc-1', recue_le: new Date(demarrageSimule + 6000).toISOString(), chambre: '12', type: 'document', libelle: 'Contradiction dans un courrier', statut: 'nouvelle', acquittee_le: null,
    faits: { gravite: 'rouge', resident: 'M. Hans Weber', chambre: '12', courrier: { titre: 'Arztbrief – Hans Weber', expediteur: 'Praxis Berger', ref: 'kim/praxis-berger@kim.example.test/arztbrief-weber.pdf' }, contradictions: ["La lettre cite amoxicillin, une pénicilline, alors qu'une allergie à cette famille est connue."], source: 'KIM (lettre de médecin)' },
    contexte: { statut: 'aucun' },
  };
}
// historique = true : ajoute les alarmes acquittées des 24 dernières heures
export async function alarmes(historique = false) {
  if (MOCK) {
    const actives = [alarmeSimulee(), documentSimule()].filter((a) => a && !acquitteesSimulees.has(a.id));
    return historique ? [...actives, ...acquitteesSimulees.values()] : actives;
  }
  const r = await appelN8n('aicare-alarmes', historique ? { historique: true } : {});
  if (!Array.isArray(r.alarmes)) throw new Error('réponse inattendue'); // un message d'erreur de n8n n'est pas « aucune alarme »
  return r.alarmes;
}
export async function acquitterAlarme(id) {
  if (MOCK) {
    const a = [alarmeSimulee(), documentSimule()].find((x) => x && x.id === id);
    if (a) acquitteesSimulees.set(id, { ...a, statut: 'acquittee', acquittee_le: new Date().toISOString() });
    return;
  }
  await appelN8n('aicare-alarmes', { acquitter: id });
}
// Annuler une tâche de fond (rapport d'étage, analyse complémentaire) : prise en compte avant le prochain résident / la prochaine étape.
export async function annulerTache(tache) {
  if (MOCK) {
    await pause(200);
    annulees.add(tache.tache_id);
    return { annulee: true, statut: 'annulee' };
  }
  return appelN8n('aicare-annuler', { tache_id: tache.tache_id });
}

// Rapport d'étage déjà préparé (typiquement celui de 5h30), ou null : n8n renvoie le dernier des 16 dernières heures.
export async function dernierRapportEtage(etage) {
  if (MOCK) return null;
  const r = await appelN8n('aicare-tache', { etage, recent: true });
  return r.tache_id ? r : null;
}

export async function tacheEtage(tache) {
  if (MOCK) {
    await pause(600);
    simulees.set(tache.tache_id, Math.min((simulees.get(tache.tache_id) ?? 0) + 1, tache._mock.length));
    const fait = simulees.get(tache.tache_id);
    if (annulees.has(tache.tache_id)) return { statut: 'annulee', total: tache._mock.length, fait, resultat: tache._mock.slice(0, fait) };
    return { statut: fait === tache._mock.length ? 'termine' : 'en_cours', total: tache._mock.length, fait, resultat: tache._mock.slice(0, fait) };
  }
  return appelN8n('aicare-tache', { tache_id: tache.tache_id });
}
const simulees = new Map();
const annulees = new Set();

// ---- Cotisations retraite des aidants familiaux (§ 3 et § 166 SGB VI, § 44 SGB XI) : agent IA, DONNÉES FICTIVES ------------------
// Un agent traite chaque questionnaire (lire, extraire, contrôler, lire la caisse, vérifier les règles, calculer, préparer la déclaration).
// Il ne valide ni ne refuse jamais : deciderCotisations est réservé à l'humain.
//   listerDossiersCotisations -> { modele (modèle par défaut), modeles: [{ nom, installe }] (ceux que la page peut choisir), dossiers: [{ id, aidant, personne_soignee, recu_le, statut: 'a_traiter' | 'pret_a_valider' | 'exception' | 'valide' | 'refuse', revue }] }
//   lancerAgentCotisations    -> { tache_id, id, etapes: [...] } tout de suite ; etatAgentCotisations -> avancement :
//     { statut: 'en_cours' | 'termine', fait (étapes terminées), etapes, resultat (voir traiterQuestionnaire dans regles.js), lecture_ia }
// Mode simulé : le vrai moteur de règles lit les questionnaires fictifs, avec une petite pause par étape.
// Mode réel (VITE_MOCK=false) : webhooks n8n aicare-sgb6-lister / deposer / lancer / tache / dossier / decider ; l'agent y travaille en tâche de fond
// (étapes 1 et 2 une à une, la lecture par l'IA pouvant durer plusieurs minutes), le résultat est enregistré en base et se relit sans relancer l'agent.
//   deposerQuestionnaire({ nom, contenu_base64 }) -> { ok: true, id } ou { ok: false, erreur, message }
//   dossierCotisations(id) -> { statut, revue, resultat (ou null), derniere_decision }
const ETAPES_COTISATIONS = ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration'];
const etatsCotisations = new Map(); // id -> { statut, revue, motif }
const tachesCotisations = new Map(); // tache_id -> { id, fait, resultat, lecture_ia }
const resultatsCotisations = new Map(); // id -> dernier résultat (mode simulé)

export async function listerDossiersCotisations() {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-lister', {});
    if (!Array.isArray(r.dossiers)) throw new Error('réponse inattendue');
    return { modele: r.modele ?? '', modeles: r.modeles ?? [], dossiers: r.dossiers };
  }
  await pause(200);
  return { modele: 'modèle simulé', modeles: [{ nom: 'modèle simulé', installe: true }], dossiers: dossiersSimules().map((d) => ({ ...d, statut: etatsCotisations.get(d.id)?.statut ?? 'a_traiter', revue: Boolean(etatsCotisations.get(d.id)?.revue), traite: resultatsCotisations.has(d.id) })) };
}

// pilote : 'modele' (piloté par un modèle local : il choisit les outils, la garde du code les contrôle) ou 'guidee' (mission guidée par le code)
// modele : le modèle local qui pilote l'agent (liste fermée côté n8n) ; sans lui, le modèle par défaut de n8n
export async function lancerAgentCotisations(id, { lectureIA = false, pilote = 'guidee', modele } = {}) {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-lancer', { id, lecture_ia: lectureIA, pilote, ...(modele ? { modele } : {}) });
    if (!r.tache_id) throw new Error(r.message ?? r.erreur ?? 'lancement refusé');
    return { tache_id: r.tache_id, id, etapes: r.etapes ?? ETAPES_COTISATIONS };
  }
  await pause(150);
  const tache_id = `simule-cot-${id}-${Date.now()}`;
  if (pilote === 'modele') {
    const { resultat, tours } = await traiterSimulePilote(id);
    tachesCotisations.set(tache_id, { id, fait: 0, resultat, tours, pilote, lecture_ia: false });
    return { tache_id, id, etapes: ETAPES_COTISATIONS };
  }
  tachesCotisations.set(tache_id, { id, fait: 0, resultat: traiterSimule(id), lecture_ia: lectureIA });
  return { tache_id, id, etapes: ETAPES_COTISATIONS };
}

export async function etatAgentCotisations(tache_id) {
  if (!MOCK) {
    await pause(1000); // une interrogation par seconde : chaque étape de l'agent est visible, sans harceler n8n pendant une lecture par l'IA de plusieurs minutes
    const t = await appelN8n('aicare-sgb6-tache', { tache_id });
    if (['interrompue', 'annulee', 'termine_avec_erreurs'].includes(t.statut) || (t.statut === 'termine' && !t.resultat)) throw new Error(`agent arrêté (${t.statut})`);
    const journal = t.etapes ?? [];
    return { statut: t.statut === 'termine' ? 'termine' : 'en_cours', fait: t.fait ?? 0, etapes: ETAPES_COTISATIONS, journal, tours: journal.filter((x) => x.etape === 'tour'), pilote: t.pilote, resultat: t.resultat, lecture_ia: t.resultat?.lecture_ia ?? null };
  }
  const tache = tachesCotisations.get(tache_id);
  if (!tache) throw new Error('tâche inconnue');
  await pause(550); // une petite pause par étape (ou par tour du modèle), pour voir l'agent avancer
  const total = tache.tours ? tache.tours.length : ETAPES_COTISATIONS.length;
  tache.fait = Math.min(tache.fait + 1, total);
  const termine = tache.fait === total;
  if (termine) {
    const actuel = etatsCotisations.get(tache.id);
    resultatsCotisations.set(tache.id, tache.resultat);
    // un dossier déjà décidé par une personne ne change plus de statut
    if (!actuel || ['pret_a_valider', 'exception'].includes(actuel.statut)) etatsCotisations.set(tache.id, { ...actuel, statut: tache.resultat.statut });
  }
  return { statut: termine ? 'termine' : 'en_cours', fait: tache.fait, etapes: ETAPES_COTISATIONS, resultat: tache.resultat, lecture_ia: tache.lecture_ia, pilote: tache.pilote ?? 'guidee', tours: tache.tours?.slice(0, tache.fait) };
}

// Le dernier résultat enregistré d'un dossier (pour le revoir sans relancer l'agent).
export async function dossierCotisations(id) {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-dossier', { id });
    if (!r.ok) throw new Error(r.erreur ?? 'dossier introuvable');
    return { statut: r.statut, revue: r.revue, resultat: r.resultat, derniere_decision: r.derniere_decision };
  }
  const etat = etatsCotisations.get(id);
  return { statut: etat?.statut ?? 'a_traiter', revue: Boolean(etat?.revue), resultat: resultatsCotisations.get(id) ?? null, derniere_decision: etat?.motif ? { decision: 'refuser', motif: etat.motif } : null };
}

// Dépôt d'un questionnaire : .txt ou PDF contenant du texte, 1 Mo au plus. Le contrôle est refait côté n8n.
export async function deposerQuestionnaire({ nom, contenu_base64 }) {
  if (!MOCK) return appelN8n('aicare-sgb6-deposer', { nom, contenu_base64 });
  await pause(300);
  return deposerSimule(nom, contenu_base64);
}

// decision : 'valider' (seulement si l'agent a trouvé le dossier prêt) | 'revue' (tâche de revue) | 'refuser' (après une exception, motif obligatoire)
export async function deciderCotisations({ id, decision, motif = '' }) {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-decider', { id, decision, motif });
    if (!r.ok) throw new Error(r.message ?? r.erreur ?? 'décision refusée');
    return r;
  }
  await pause(300);
  const etat = etatsCotisations.get(id);
  if (!etat || !['pret_a_valider', 'exception'].includes(etat.statut)) throw new Error("Le dossier n'est pas en attente de décision.");
  if (decision === 'valider') {
    if (etat.statut !== 'pret_a_valider') throw new Error('Validation impossible : une règle n\'est pas remplie.');
    etatsCotisations.set(id, { ...etat, statut: 'valide' });
  } else if (decision === 'refuser') {
    if (etat.statut !== 'exception') throw new Error('Le refus ne se fait qu\'après une exception.');
    if (!motif.trim()) throw new Error('Le motif du refus est obligatoire.');
    etatsCotisations.set(id, { ...etat, statut: 'refuse', motif: motif.trim() });
  } else if (decision === 'revue') {
    etatsCotisations.set(id, { ...etat, revue: true });
  } else throw new Error(`Décision inconnue : ${decision}`);
  return { ok: true, statut: etatsCotisations.get(id).statut, revue: Boolean(etatsCotisations.get(id).revue) };
}

// Valider l'étage : les rapports relus (éventuellement corrigés) sont enregistrés, ajoutés au RAG puis transmis à l'équipe suivante.
export async function validerEtage({ etage, rapports }) {
  if (MOCK) {
    await pause(500);
    return { ok: true, nb_valides: rapports.length, refuses: [], apres_validation: { rag: { ajoutes: rapports.length }, transmission: { statut: 'envoye', destinataire: 'equipe-suivante@sonnenhof.example.test', nb_rapports: rapports.length } } };
  }
  const r = await appelN8n('aicare-valider-lot', { etage, rapports: rapports.map((x) => ({ brouillon_id: x.brouillon_id, texte: x.texte })) });
  if (!r.ok) throw new Error('enregistrement refusé');
  return r;
}
