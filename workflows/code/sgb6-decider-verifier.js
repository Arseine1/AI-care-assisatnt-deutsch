// Cotisations retraite – la décision est-elle permise ? Les règles se lisent dans le résultat ENREGISTRÉ, jamais dans la requête.
//   valider : seulement si le dossier est « prêt à valider » ET si toutes les règles (et écarts) sont « ok »
//   refuser : seulement après une exception, avec un motif
//   revue   : une tâche de revue, une seule fois
const d = $('Contrôler la décision').first().json;
const r = $input.first().json ?? {};
const refus = (erreur, message) => [{ json: { ok: false, reponse: { ok: false, erreur, message } } }];
if (!r.id) return refus('inconnu', 'Dossier inconnu.');
if (r.traite !== true || !['pret_a_valider', 'exception'].includes(r.statut)) return refus('pas_en_attente', "Le dossier n'est pas en attente de décision (traité par l'agent, ni validé ni refusé).");
if (d.decision === 'valider' && (r.statut !== 'pret_a_valider' || r.regles_ok !== true)) return refus('regle_non_ok', "Validation refusée : une règle n'est pas « ok ».");
if (d.decision === 'refuser' && d.motif === '') return refus('motif_obligatoire', 'Le motif du refus est obligatoire.');
if (d.decision === 'refuser' && r.statut !== 'exception') return refus('refus_hors_exception', 'Le refus ne se fait qu\'après une exception.');
if (d.decision === 'revue' && r.revue === true) return refus('revue_deja_creee', 'Une tâche de revue existe déjà pour ce dossier.');
return [{ json: { ok: true, id: d.id, decision: d.decision, motif: d.motif, soignant: $('Session').first().json.soignant.identifiant } }];