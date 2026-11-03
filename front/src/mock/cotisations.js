// Simulierter Modus der Seite „Rentenbeiträge“: Die ECHTE Regel-Engine (workflows/code/sgb6/regles.js) liest die
// fiktiven Fragebögen (data/sgb6/questionnaires/*.txt) und vergleicht sie mit der simulierten Pflegekasse (data/sgb6/caisse.json).
import caisse from '../../../data/sgb6/caisse.json';
import { extraireChamps, traiterQuestionnaire } from '../../../workflows/code/sgb6/regles.js';
import { modeleSimule, piloterOuReplier } from '../../../workflows/code/sgb6/agent.js';

const textes = import.meta.glob('../../../data/sgb6/questionnaires/*.txt', { query: '?raw', import: 'default', eager: true });
export const ANNEE_COTISATIONS = 2026;

const questionnaires = Object.entries(textes)
  .map(([chemin, texte]) => ({ id: chemin.split('/').pop().replace(/\.txt$/, ''), texte }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Vor jeder Bearbeitung angezeigte Liste: Es werden nur Name, pflegebedürftige Person und Eingangsdatum gelesen.
export function dossiersSimules() {
  return questionnaires.map(({ id, texte }) => {
    const { donnees, recu_le } = extraireChamps(texte);
    return {
      id,
      aidant: `${donnees.aidant_prenom ?? ''} ${donnees.aidant_nom ?? ''}`.trim(),
      personne_soignee: `${donnees.personne_prenom ?? ''} ${donnees.personne_nom ?? ''}`.trim(),
      recu_le,
    };
  });
}

export function traiterSimule(id) {
  const q = questionnaires.find((x) => x.id === id);
  if (!q) throw new Error(`Unbekannte Akte: ${id}`);
  return traiterQuestionnaire(q.texte, { caisse, annee: ANNEE_COTISATIONS, id });
}

// Simulierte Ablage: dieselben Ablehnungen wie bei n8n (Format, Größe, Dokument, das kein Fragebogen ist); im simulierten Modus keine PDFs.
export function deposerSimule(nom, contenuBase64) {
  const refus = (erreur, message) => ({ ok: false, erreur, message });
  if (!/^[^\\/]{1,120}\.(txt|pdf)$/i.test(nom)) return refus('format', 'Es werden nur .txt- und .pdf-Dateien akzeptiert (mit Text, kein Scan).');
  if (/\.pdf$/i.test(nom)) return refus('format', 'Das Hochladen von PDFs erfordert n8n: Laden Sie im simulierten Modus eine .txt-Datei hoch.');
  let octets;
  try {
    octets = Uint8Array.from(atob(contenuBase64 ?? ''), (c) => c.charCodeAt(0));
  } catch {
    return refus('format', 'Datei nicht lesbar.');
  }
  if (octets.length === 0) return refus('vide', 'Leere Datei.');
  if (octets.length > 1048576) return refus('taille', 'Datei zu groß: höchstens 1 MB.');
  let texte;
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/\r\n/g, '\n').trim();
  } catch {
    return refus('format', 'Die Textdatei muss in UTF-8 gespeichert sein.');
  }
  const { donnees } = extraireChamps(texte);
  if (!donnees.ref_caisse || !donnees.aidant_nom) return refus('pas_un_questionnaire', 'Dieses Dokument sieht nicht wie ein Fragebogen der Pflegekasse aus: Aktenzeichen oder Name der Pflegeperson nicht gefunden.');
  const id = `dep-${Math.random().toString(16).slice(2, 12)}`;
  questionnaires.push({ id, texte });
  return { ok: true, id };
}

// Von einem SIMULIERTEN Modell gesteuerter Agent (kein Netzwerk): dieselbe Schleife, dieselbe Schutzprüfung und dieselben Werkzeuge wie bei n8n; das Modell folgt der üblichen Reihenfolge.
// -> { resultat, tours }; Status und Beträge stammen aus dem Code (regles.js).
export async function traiterSimulePilote(id) {
  const q = questionnaires.find((x) => x.id === id);
  if (!q) throw new Error(`Unbekannte Akte: ${id}`);
  const sortie = await piloterOuReplier({ texte: q.texte, caisse, annee: ANNEE_COTISATIONS, dossier_id: id, modele: 'simuliertes Modell', chat: modeleSimule() });
  return { resultat: sortie.resultat, tours: sortie.session.journal };
}
