// Mode simulé de la page « Cotisations retraite » : le VRAI moteur de règles (workflows/code/sgb6/regles.js) lit les
// questionnaires fictifs (data/sgb6/questionnaires/*.txt) et les compare à la caisse simulée (data/sgb6/caisse.json).
import caisse from '../../../data/sgb6/caisse.json';
import { extraireChamps, traiterQuestionnaire } from '../../../workflows/code/sgb6/regles.js';
import { modeleSimule, piloterOuReplier } from '../../../workflows/code/sgb6/agent.js';

const textes = import.meta.glob('../../../data/sgb6/questionnaires/*.txt', { query: '?raw', import: 'default', eager: true });
export const ANNEE_COTISATIONS = 2026;

const questionnaires = Object.entries(textes)
  .map(([chemin, texte]) => ({ id: chemin.split('/').pop().replace(/\.txt$/, ''), texte }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Liste affichée avant tout traitement : on ne lit que le nom, la personne soignée et la date de réception.
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
  if (!q) throw new Error(`Dossier inconnu : ${id}`);
  return traiterQuestionnaire(q.texte, { caisse, annee: ANNEE_COTISATIONS, id });
}

// Dépôt simulé : mêmes refus que n8n (format, taille, document qui n'est pas un questionnaire) ; pas de PDF en mode simulé.
export function deposerSimule(nom, contenuBase64) {
  const refus = (erreur, message) => ({ ok: false, erreur, message });
  if (!/^[^\\/]{1,120}\.(txt|pdf)$/i.test(nom)) return refus('format', 'Seuls les fichiers .txt et .pdf (avec du texte, pas un scan) sont acceptés.');
  if (/\.pdf$/i.test(nom)) return refus('format', 'Le dépôt de PDF demande n8n : en mode simulé, déposez un fichier .txt.');
  let octets;
  try {
    octets = Uint8Array.from(atob(contenuBase64 ?? ''), (c) => c.charCodeAt(0));
  } catch {
    return refus('format', 'Fichier illisible.');
  }
  if (octets.length === 0) return refus('vide', 'Fichier vide.');
  if (octets.length > 1048576) return refus('taille', 'Fichier trop gros : 1 Mo au maximum.');
  let texte;
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/\r\n/g, '\n').trim();
  } catch {
    return refus('format', 'Le fichier texte doit être enregistré en UTF-8.');
  }
  const { donnees } = extraireChamps(texte);
  if (!donnees.ref_caisse || !donnees.aidant_nom) return refus('pas_un_questionnaire', "Ce document ne ressemble pas à un questionnaire de la caisse : référence du dossier ou nom de l'aidant introuvable.");
  const id = `dep-${Math.random().toString(16).slice(2, 12)}`;
  questionnaires.push({ id, texte });
  return { ok: true, id };
}

// Agent piloté par un modèle SIMULÉ (aucun réseau) : la même boucle, la même garde et les mêmes outils que n8n ; le modèle suit l'ordre habituel.
// -> { resultat, tours } ; le statut et les montants viennent du code (regles.js).
export async function traiterSimulePilote(id) {
  const q = questionnaires.find((x) => x.id === id);
  if (!q) throw new Error(`Dossier inconnu : ${id}`);
  const sortie = await piloterOuReplier({ texte: q.texte, caisse, annee: ANNEE_COTISATIONS, dossier_id: id, modele: 'modèle simulé', chat: modeleSimule() });
  return { resultat: sortie.resultat, tours: sortie.session.journal };
}
