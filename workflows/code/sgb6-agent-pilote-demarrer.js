// Cotisations retraite, agent piloté par un modèle – démarrage : la session (état gardé par le code) et le message de mission.
// Le modèle ne verra jamais l'identifiant réel du dossier (alias « dossier-1 ») ni le texte du questionnaire.
const d = $('Dossier').first().json;
if (!d.id) throw new Error('Dossier introuvable');
const e = $('Entrée').first().json;
const sess = nouvelleSession({ dossier_id: e.dossier_id, texte: d.questionnaire, annee: new Date().getFullYear(), modele: e.modele });
return [{ json: { sess } }];