// Datenzugriffsschicht. Die Oberfläche ruft NUR diese Funktionen auf.
//
// Schalter: VITE_MOCK=true (Standard) -> simulierte Antworten aus src/mock/mock.json
//           VITE_MOCK=false          -> n8n-Webhooks (Tag 3), ohne dass sich anderswo etwas ändert.
// Die Einstellung erfolgt in der Datei .env im Stammverzeichnis des Repositorys (siehe .env.exemple).
import mock from './mock/mock.json';
import { dossiersSimules, traiterSimule, traiterSimulePilote, deposerSimule } from './mock/cotisations.js';

export const MOCK = import.meta.env.VITE_MOCK !== 'false';
const N8N = (import.meta.env.VITE_N8N_WEBHOOK_URL || 'http://localhost:5679/webhook').replace(/\/$/, '');
// Ein Bericht kann auf einem kleinen Rechner mehrere Minuten dauern (Sprachmodell ohne Grafikkarte).
const DELAI_MAX_MS = 20 * 60 * 1000;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Ersetzt {resident}, {chambre}, {consigne} in einem simulierten Text.
function remplir(texte, valeurs) {
  return texte.replace(/\{(\w+)\}/g, (_, cle) => valeurs[cle] ?? `{${cle}}`);
}

function reponseSimulee(demande) {
  const modele = demande.mode === 'b' ? mock.consigne : mock.actions[demande.action];
  if (!modele) throw new Error(`Unbekannte Aktion: ${demande.action}`);
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

// ---- Sitzung der Pflegekraft (Tag 4, Schritt 7) ---------------------------------------------------------------------
// Das bei der Anmeldung erhaltene Token bleibt in sessionStorage (wird beim Schließen des Tabs gelöscht) und wird im Authorization-Header jedes Aufrufs gesendet.
// Der Schlüssel VITE_N8N_CLE (Header X-AICare-Cle) ist im Code der Oberfläche sichtbar: Er filtert Aufrufe von außerhalb der Oberfläche, schützt die
// Daten aber NICHT; das tut nur die Sitzung. n8n prüft die Sitzung vor jeder Verarbeitung und antwortet { erreur: 'session' }, wenn sie fehlt oder abgelaufen ist.
const CLE = import.meta.env.VITE_N8N_CLE || '';
const CLE_STOCKAGE = 'aicare-jeton';
let jeton = '';
try {
  jeton = sessionStorage.getItem(CLE_STOCKAGE) || '';
} catch {
  /* Speicher nicht verfügbar: Die Sitzung übersteht kein Neuladen */
}
function memoriserJeton(valeur) {
  jeton = valeur || '';
  try {
    if (jeton) sessionStorage.setItem(CLE_STOCKAGE, jeton);
    else sessionStorage.removeItem(CLE_STOCKAGE);
  } catch {
    /* ebenso */
  }
}
const ecouteursSession = new Set();
// Wird aufgerufen, wenn n8n die Sitzung ablehnt (abgelaufen, anderswo beendet): Die Oberfläche öffnet dann wieder die Anmeldeseite.
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
  if (!res.ok) throw new Error(`n8n hat mit ${res.status} geantwortet`);
  const json = await res.json();
  if (json?.erreur === 'session') {
    memoriserJeton('');
    ecouteursSession.forEach((f) => f());
    throw new Error('session');
  }
  return json;
}

// Simulierte Konten (nur im simulierten Modus): kein Geheimnis, serverseitig wird nichts geprüft.
const COMPTE_SIMULE = { identifiant: 'demo', pin: '123456', nom: 'Frau Demo (Simulation)' };
let soignantSimule = null;

// -> { ok: true, soignant: { identifiant, nom } } oder { ok: false, motif: 'identifiants' | 'verrouille' | 'reseau' }
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

// Beim Laden der Seite: die Pflegekraft der laufenden Sitzung oder null (keine Sitzung oder Sitzung abgelaufen).
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
    /* Die Sitzung wird hier ohnehin vergessen; auf der n8n-Seite läuft sie nach 12 Stunden ab */
  }
  memoriserJeton('');
}
// Modus A: n8n erhält {action, chambre}; der Prompt bleibt auf der n8n-Seite verborgen.
// Modus B: n8n erhält {chambre, consigne}, PRÜFT den Text (Länge, verbotene Wörter, Versuch, die
//          Regeln zu ändern) und fügt ihn dann in die gesperrte Vorlage ein.
// Antwort: { brouillon_id, texte, sources: [...], alertes: [{type, message}], avertissements: [{type, detail}] }
//          oder, bei abgelehnter Anweisung: { refuse: true, motif, message }.
// Der erhaltene Text ist ein ENTWURF: Er wird nur durch „Bestätigen & Speichern“ gespeichert.
export async function demander(demande) {
  if (MOCK) {
    await pause(700); // simuliert die Erzeugungszeit
    return reponseSimulee(demande);
  }
  if (demande.mode === 'b') return appelN8n('aicare-consigne', { chambre: demande.chambre, consigne: demande.consigne });
  // „Dokument prüfen“: Die Kontrollregeln antworten sofort, die Analyse des KI-Assistenten folgt (antwort.analyse)
  if (demande.action === 'verifier_document') return appelN8n('aicare-verifier', { chambre: demande.chambre, ...(demande.ref ? { ref: demande.ref } : {}) });
  return appelN8n('aicare-action', { action: demande.action, chambre: demande.chambre });
}

// ---- Ergänzende Analyse des KI-Assistenten („Dokument prüfen“), im Hintergrund ---------------------------------------
// Antwort: { statut: 'en_cours' | 'termine' | 'termine_avec_erreurs', resultat: { remarques, alertes, avertissements, indisponible } }
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

// Einstellung: ergänzende Analyse des KI-Assistenten aktiviert oder nicht („Dokument prüfen“).
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

// Schaltfläche [Bestätigen & Speichern]: n8n speichert den geprüften (gegebenenfalls korrigierten) Text, zugeordnet zu seinem Entwurf.
export async function enregistrer({ reponse, texte }) {
  if (MOCK) {
    await pause(300);
    return { ok: true };
  }
  const r = await appelN8n('aicare-valider', { brouillon_id: reponse.brouillon_id, texte });
  if (!r.ok) throw new Error(r.erreur ?? 'Speichern abgelehnt');
  return r;
}

// ---- Übergabebericht für ein STOCKWERK: ein SBAR pro Bewohner, von n8n im Hintergrund erstellt ---------------------------
// lancerEtage -> { tache_id, total } sofort; tacheEtage -> Fortschritt, mit den bereits fertigen Berichten:
//   { statut: 'en_cours' | 'termine' | 'termine_avec_erreurs', total, fait, resultat: [{ chambre, resident, brouillon_id, texte,
//     sources, avertissements } oder { chambre, resident, erreur }] }
export async function lancerEtage({ etage, residents }) {
  if (MOCK) {
    await pause(300);
    const rapports = residents.map((r) => ({ ...reponseSimulee({ mode: 'a', action: 'rapport_garde', chambre: r.chambre, resident: r }), chambre: r.chambre, resident: `${r.civilite} ${r.prenom} ${r.nom}` }));
    return { tache_id: `simule-${etage}`, total: residents.length, _mock: rapports };
  }
  return appelN8n('aicare-etage', { etage });
}

// ---- Sensoralarme (MQTT): rotes Banner -------------------------------------------------------------------------------
// Die nicht quittierten Alarme kommen sofort mit ihren CODIERTEN FAKTEN (Bewohner, Risiken, Allergien, Risikomedikation);
// der Kontext des KI-Assistenten (`contexte`) kommt später hinzu: { statut: 'aucun' | 'differe' | 'en_cours' | 'pret' | 'indisponible', texte, sources, retirees }.
// Alle 2 Sekunden abgefragt: Der Alarm erscheint weniger als 5 Sekunden nach der MQTT-Veröffentlichung.
const demarrageSimule = Date.now();
const acquitteesSimulees = new Map(); // id -> quittierter Alarm (Simulation)
function alarmeSimulee() {
  const age = Date.now() - demarrageSimule;
  if (age < 4000) return null;
  return {
    id: 'simulee-1', recue_le: new Date(demarrageSimule + 4000).toISOString(), chambre: '12', type: 'sortie_lit', libelle: 'Bettausstieg', statut: 'nouvelle', acquittee_le: null,
    faits: { resident: 'Herr Hans Weber', chambre: '12', etage: 1, risques: ['Sturz (hohes Risiko)', 'Nächtliche Desorientierung'], allergies: ['Penicillin'], medication_a_risque: [{ famille: 'tension', libelle: 'Blutdrucksenkung oder Diuretikum: Sturzrisiko', medicaments: ['Ramipril 5 mg', 'Amlodipine 5 mg'] }], source: 'Pflegesoftware' },
    contexte: age < 14000 ? { statut: 'en_cours' } : { statut: 'pret', texte: 'Alarm:\nBettausstieg in Zimmer 12 erkannt. [Sensoren]\nKontext des Bewohners:\nHohes Sturzrisiko, nächtliche Desorientierung. [Pflegesoftware]', sources: ['Sensoren', 'Pflegesoftware'], retirees: [] },
  };
}
// Simuliertes Schreiben (Seite Dokumente): kommt 6 s nach dem Öffnen an.
function documentSimule() {
  if (Date.now() - demarrageSimule < 6000) return null;
  return {
    id: 'simulee-doc-1', recue_le: new Date(demarrageSimule + 6000).toISOString(), chambre: '12', type: 'document', libelle: 'Widerspruch in einem Schreiben', statut: 'nouvelle', acquittee_le: null,
    faits: { gravite: 'rouge', resident: 'Herr Hans Weber', chambre: '12', courrier: { titre: 'Arztbrief – Hans Weber', expediteur: 'Praxis Berger', ref: 'kim/praxis-berger@kim.example.test/arztbrief-weber.pdf' }, contradictions: ['Der Brief nennt Amoxicillin, ein Penicillin, obwohl eine Allergie gegen diese Stoffgruppe bekannt ist.'], source: 'KIM (Arztbrief)' },
    contexte: { statut: 'aucun' },
  };
}
// historique = true: fügt die quittierten Alarme der letzten 24 Stunden hinzu
export async function alarmes(historique = false) {
  if (MOCK) {
    const actives = [alarmeSimulee(), documentSimule()].filter((a) => a && !acquitteesSimulees.has(a.id));
    return historique ? [...actives, ...acquitteesSimulees.values()] : actives;
  }
  const r = await appelN8n('aicare-alarmes', historique ? { historique: true } : {});
  if (!Array.isArray(r.alarmes)) throw new Error('unerwartete Antwort'); // eine Fehlermeldung von n8n bedeutet nicht „kein Alarm“
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
// Eine Hintergrundaufgabe abbrechen (Stockwerksbericht, ergänzende Analyse): wird vor dem nächsten Bewohner / dem nächsten Schritt berücksichtigt.
export async function annulerTache(tache) {
  if (MOCK) {
    await pause(200);
    annulees.add(tache.tache_id);
    return { annulee: true, statut: 'annulee' };
  }
  return appelN8n('aicare-annuler', { tache_id: tache.tache_id });
}

// Bereits vorbereiteter Stockwerksbericht (typischerweise der von 5:30 Uhr) oder null: n8n liefert den letzten der vergangenen 16 Stunden.
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

// ---- Rentenbeiträge pflegender Angehöriger (§ 3 und § 166 SGB VI, § 44 SGB XI): KI-Agent, FIKTIVE DATEN ------------------------
// Ein Agent bearbeitet jeden Fragebogen (lesen, extrahieren, prüfen, Pflegekasse lesen, Regeln prüfen, berechnen, Meldung vorbereiten).
// Er bestätigt oder lehnt nie ab: deciderCotisations ist dem Menschen vorbehalten.
//   listerDossiersCotisations -> { modele (Standardmodell), modeles: [{ nom, installe }] (die, die die Seite wählen kann), dossiers: [{ id, aidant, personne_soignee, recu_le, statut: 'a_traiter' | 'pret_a_valider' | 'exception' | 'valide' | 'refuse', revue }] }
//   lancerAgentCotisations    -> { tache_id, id, etapes: [...] } sofort; etatAgentCotisations -> Fortschritt:
//     { statut: 'en_cours' | 'termine', fait (abgeschlossene Schritte), etapes, resultat (siehe traiterQuestionnaire in regles.js), lecture_ia }
// Simulierter Modus: Die echte Regel-Engine liest die fiktiven Fragebögen, mit einer kleinen Pause pro Schritt.
// Realer Modus (VITE_MOCK=false): n8n-Webhooks aicare-sgb6-lister / deposer / lancer / tache / dossier / decider; der Agent arbeitet dort im Hintergrund
// (Schritte 1 und 2 einzeln, das Lesen durch die KI kann mehrere Minuten dauern), das Ergebnis wird in der Datenbank gespeichert und lässt sich ohne Neustart des Agenten erneut lesen.
//   deposerQuestionnaire({ nom, contenu_base64 }) -> { ok: true, id } oder { ok: false, erreur, message }
//   dossierCotisations(id) -> { statut, revue, resultat (oder null), derniere_decision }
const ETAPES_COTISATIONS = ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration'];
const etatsCotisations = new Map(); // id -> { statut, revue, motif }
const tachesCotisations = new Map(); // tache_id -> { id, fait, resultat, lecture_ia }
const resultatsCotisations = new Map(); // id -> letztes Ergebnis (simulierter Modus)

export async function listerDossiersCotisations() {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-lister', {});
    if (!Array.isArray(r.dossiers)) throw new Error('unerwartete Antwort');
    return { modele: r.modele ?? '', modeles: r.modeles ?? [], dossiers: r.dossiers };
  }
  await pause(200);
  return { modele: 'simuliertes Modell', modeles: [{ nom: 'simuliertes Modell', installe: true }], dossiers: dossiersSimules().map((d) => ({ ...d, statut: etatsCotisations.get(d.id)?.statut ?? 'a_traiter', revue: Boolean(etatsCotisations.get(d.id)?.revue), traite: resultatsCotisations.has(d.id) })) };
}

// pilote: 'modele' (von einem lokalen Modell gesteuert: es wählt die Werkzeuge, die Schutzprüfung des Codes kontrolliert sie) oder 'guidee' (vom Code geführte Mission)
// modele: das lokale Modell, das den Agenten steuert (geschlossene Liste auf der n8n-Seite); ohne Angabe das Standardmodell von n8n
export async function lancerAgentCotisations(id, { lectureIA = false, pilote = 'guidee', modele } = {}) {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-lancer', { id, lecture_ia: lectureIA, pilote, ...(modele ? { modele } : {}) });
    if (!r.tache_id) throw new Error(r.message ?? r.erreur ?? 'Start abgelehnt');
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
    await pause(1000); // eine Abfrage pro Sekunde: Jeder Schritt des Agenten ist sichtbar, ohne n8n während eines mehrminütigen Lesens durch die KI zu überlasten
    const t = await appelN8n('aicare-sgb6-tache', { tache_id });
    if (['interrompue', 'annulee', 'termine_avec_erreurs'].includes(t.statut) || (t.statut === 'termine' && !t.resultat)) throw new Error(`Agent angehalten (${t.statut})`);
    const journal = t.etapes ?? [];
    return { statut: t.statut === 'termine' ? 'termine' : 'en_cours', fait: t.fait ?? 0, etapes: ETAPES_COTISATIONS, journal, tours: journal.filter((x) => x.etape === 'tour'), pilote: t.pilote, resultat: t.resultat, lecture_ia: t.resultat?.lecture_ia ?? null };
  }
  const tache = tachesCotisations.get(tache_id);
  if (!tache) throw new Error('unbekannte Aufgabe');
  await pause(550); // eine kleine Pause pro Schritt (oder pro Runde des Modells), damit man den Agenten vorankommen sieht
  const total = tache.tours ? tache.tours.length : ETAPES_COTISATIONS.length;
  tache.fait = Math.min(tache.fait + 1, total);
  const termine = tache.fait === total;
  if (termine) {
    const actuel = etatsCotisations.get(tache.id);
    resultatsCotisations.set(tache.id, tache.resultat);
    // eine bereits von einer Person entschiedene Akte ändert ihren Status nicht mehr
    if (!actuel || ['pret_a_valider', 'exception'].includes(actuel.statut)) etatsCotisations.set(tache.id, { ...actuel, statut: tache.resultat.statut });
  }
  return { statut: termine ? 'termine' : 'en_cours', fait: tache.fait, etapes: ETAPES_COTISATIONS, resultat: tache.resultat, lecture_ia: tache.lecture_ia, pilote: tache.pilote ?? 'guidee', tours: tache.tours?.slice(0, tache.fait) };
}

// Das zuletzt gespeicherte Ergebnis einer Akte (um es ohne Neustart des Agenten erneut anzusehen).
export async function dossierCotisations(id) {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-dossier', { id });
    if (!r.ok) throw new Error(r.erreur ?? 'Akte nicht gefunden');
    return { statut: r.statut, revue: r.revue, resultat: r.resultat, derniere_decision: r.derniere_decision };
  }
  const etat = etatsCotisations.get(id);
  return { statut: etat?.statut ?? 'a_traiter', revue: Boolean(etat?.revue), resultat: resultatsCotisations.get(id) ?? null, derniere_decision: etat?.motif ? { decision: 'refuser', motif: etat.motif } : null };
}

// Ablage eines Fragebogens: .txt oder PDF mit Text, höchstens 1 MB. Die Prüfung wird auf der n8n-Seite wiederholt.
export async function deposerQuestionnaire({ nom, contenu_base64 }) {
  if (!MOCK) return appelN8n('aicare-sgb6-deposer', { nom, contenu_base64 });
  await pause(300);
  return deposerSimule(nom, contenu_base64);
}

// decision: 'valider' (nur wenn der Agent die Akte als bereit befunden hat) | 'revue' (Überprüfungsaufgabe) | 'refuser' (nach einer Ausnahme, Begründung Pflicht)
export async function deciderCotisations({ id, decision, motif = '' }) {
  if (!MOCK) {
    const r = await appelN8n('aicare-sgb6-decider', { id, decision, motif });
    if (!r.ok) throw new Error(r.message ?? r.erreur ?? 'Entscheidung abgelehnt');
    return r;
  }
  await pause(300);
  const etat = etatsCotisations.get(id);
  if (!etat || !['pret_a_valider', 'exception'].includes(etat.statut)) throw new Error('Die Akte wartet nicht auf eine Entscheidung.');
  if (decision === 'valider') {
    if (etat.statut !== 'pret_a_valider') throw new Error('Bestätigung nicht möglich: Eine Regel ist nicht erfüllt.');
    etatsCotisations.set(id, { ...etat, statut: 'valide' });
  } else if (decision === 'refuser') {
    if (etat.statut !== 'exception') throw new Error('Eine Ablehnung ist nur nach einer Ausnahme möglich.');
    if (!motif.trim()) throw new Error('Die Begründung der Ablehnung ist Pflicht.');
    etatsCotisations.set(id, { ...etat, statut: 'refuse', motif: motif.trim() });
  } else if (decision === 'revue') {
    etatsCotisations.set(id, { ...etat, revue: true });
  } else throw new Error(`Unbekannte Entscheidung: ${decision}`);
  return { ok: true, statut: etatsCotisations.get(id).statut, revue: Boolean(etatsCotisations.get(id).revue) };
}

// Stockwerk bestätigen: Die geprüften (gegebenenfalls korrigierten) Berichte werden gespeichert, ins RAG aufgenommen und dann an das nächste Team weitergegeben.
export async function validerEtage({ etage, rapports }) {
  if (MOCK) {
    await pause(500);
    return { ok: true, nb_valides: rapports.length, refuses: [], apres_validation: { rag: { ajoutes: rapports.length }, transmission: { statut: 'envoye', destinataire: 'equipe-suivante@sonnenhof.example.test', nb_rapports: rapports.length } } };
  }
  const r = await appelN8n('aicare-valider-lot', { etage, rapports: rapports.map((x) => ({ brouillon_id: x.brouillon_id, texte: x.texte })) });
  if (!r.ok) throw new Error('Speichern abgelehnt');
  return r;
}
