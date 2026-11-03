// Rentenbeiträge – ist die Entscheidung zulässig? Die Regeln werden im GESPEICHERTEN Ergebnis gelesen, nie in der Anfrage.
//   valider : nur wenn die Akte « bereit zur Bestätigung » ist (pret_a_valider) UND alle Regeln (und Abweichungen) « ok » sind
//   refuser : nur nach einer Ausnahme und mit einem Grund
//   revue   : eine Prüfaufgabe, nur einmal
const d = $('Entscheidung prüfen').first().json;
const r = $input.first().json ?? {};
const refus = (erreur, message) => [{ json: { ok: false, reponse: { ok: false, erreur, message } } }];
if (!r.id) return refus('inconnu', 'Unbekannte Akte.');
if (r.traite !== true || !['pret_a_valider', 'exception'].includes(r.statut)) return refus('pas_en_attente', 'Die Akte wartet nicht auf eine Entscheidung (vom Agenten bearbeitet, weder bestätigt noch abgelehnt).');
if (d.decision === 'valider' && (r.statut !== 'pret_a_valider' || r.regles_ok !== true)) return refus('regle_non_ok', 'Bestätigung abgelehnt: Eine Regel ist nicht « ok ».');
if (d.decision === 'refuser' && d.motif === '') return refus('motif_obligatoire', 'Der Ablehnungsgrund ist ein Pflichtfeld.');
if (d.decision === 'refuser' && r.statut !== 'exception') return refus('refus_hors_exception', 'Eine Ablehnung ist nur nach einer Ausnahme möglich.');
if (d.decision === 'revue' && r.revue === true) return refus('revue_deja_creee', 'Für diese Akte besteht bereits eine Prüfaufgabe.');
return [{ json: { ok: true, id: d.id, decision: d.decision, motif: d.motif, soignant: $('Sitzung').first().json.soignant.identifiant } }];
